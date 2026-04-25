"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Step = "auth" | "otp" | "claim";

function ClaimPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const [step, setStep] = useState<Step>("auth");
  const [authMode, setAuthMode] = useState<"signup" | "login">("signup");
  const [code, setCode] = useState(searchParams.get("code") ?? "");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [otpCode, setOtpCode] = useState("");
  // Persist pendingPhone + pendingUserId in sessionStorage so page refresh doesn't lose them
  const [pendingPhone, setPendingPhoneState] = useState(() =>
    typeof window !== "undefined" ? sessionStorage.getItem("claim_pending_phone") ?? "" : ""
  );
  const [pendingUserId, setPendingUserIdState] = useState(() =>
    typeof window !== "undefined" ? sessionStorage.getItem("claim_pending_user_id") ?? "" : ""
  );
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  function setPendingPhone(val: string) {
    setPendingPhoneState(val);
    if (typeof window !== "undefined") sessionStorage.setItem("claim_pending_phone", val);
  }
  function setPendingUserId(val: string) {
    setPendingUserIdState(val);
    if (typeof window !== "undefined") sessionStorage.setItem("claim_pending_user_id", val);
  }
  function clearPending() {
    setPendingPhoneState("");
    setPendingUserIdState("");
    if (typeof window !== "undefined") {
      sessionStorage.removeItem("claim_pending_phone");
      sessionStorage.removeItem("claim_pending_user_id");
    }
  }

  // Countdown for resend button
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  // On load: if there's a pending phone in sessionStorage and user is logged in but not phone-verified,
  // jump straight to the OTP step so they can complete verification after a refresh.
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("phone")
        .eq("id", user.id)
        .single();

      if (profile?.phone) {
        clearPending();
        setStep("claim");
        return;
      }

      // Phone not verified yet — resume OTP step if we have a pending phone
      const savedPhone = sessionStorage.getItem("claim_pending_phone");
      if (savedPhone) {
        setStep("otp");
        return;
      }

      // No pending phone — back to auth
      if (user.email_confirmed_at) setStep("auth");
    });
  }, []);

  // Normalize phone to E.164
  function normalizePhone(raw: string) {
    const digits = raw.replace(/\D/g, "");
    if (raw.startsWith("+")) return `+${digits}`;
    // Assume US if 10 digits
    return digits.length === 10 ? `+1${digits}` : `+${digits}`;
  }

  async function sendOtp(phoneNumber: string): Promise<boolean> {
    const res = await fetch("/api/verify/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: phoneNumber }),
    });
    const data = await res.json() as { error?: string };
    if (!res.ok) {
      setError(data.error ?? "Failed to send verification code");
      return false;
    }
    return true;
  }

  async function handleAuth(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    try {
      if (authMode === "signup") {
        if (!phone.trim()) throw new Error("Phone number is required");
        const normalized = normalizePhone(phone.trim());

        // 1. Create the account
        const redirectTo = `${window.location.origin}/api/auth/callback?next=/claim`;
        const { data: signupData, error: signupError } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: redirectTo },
        });
        if (signupError) throw signupError;

        // 2. Send OTP immediately
        const sent = await sendOtp(normalized);
        if (!sent) return;

        setPendingPhone(normalized);
        setPendingUserId(signupData.user?.id ?? "");
        setResendCooldown(60);
        setStep("otp");
      } else {
        // Login
        const { error: loginError } = await supabase.auth.signInWithPassword({ email, password });
        if (loginError) throw loginError;

        const { data: { user } } = await supabase.auth.getUser();
        const { data: profile } = await supabase
          .from("profiles")
          .select("phone")
          .eq("id", user!.id)
          .single();

        if (profile?.phone) {
          setStep("claim");
        } else {
          // Logged in but no phone yet — show phone verification
          setPendingUserId(user!.id);
          setError("");
          // Re-show auth with phone field so they can provide their number
          setAuthMode("signup");
          setError("Your account doesn't have a verified phone. Please enter your phone number to continue.");
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    if (!otpCode.trim() || otpCode.length < 6) return;
    setError("");
    setIsLoading(true);
    try {
      const res = await fetch("/api/verify/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: pendingPhone, code: otpCode.trim(), userId: pendingUserId }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Incorrect code. Please try again.");
      setStep("claim");
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleResendOtp() {
    setError("");
    setOtpCode("");
    const sent = await sendOtp(pendingPhone);
    if (sent) setResendCooldown(60);
  }

  async function handleClaim(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    try {
      const { data, error } = await supabase.rpc("claim_unit", { p_code: code.trim() });
      if (error) throw error;
      const result = data as { success: boolean; error?: string; property_id?: string } | null;
      if (!result?.success) {
        setError(result?.error || "Invalid or expired invite code");
        return;
      }
      clearPending();
      router.push(result.property_id ? `/properties/${result.property_id}` : "/properties");
    } catch (err: unknown) {
      setError((err as { message?: string })?.message || "Invalid or expired invite code");
    } finally {
      setIsLoading(false);
    }
  }

  // Step indicator
  const steps = [
    { key: "auth" as Step, label: "Create account" },
    { key: "otp" as Step, label: "Verify phone" },
    { key: "claim" as Step, label: "Enter code" },
  ];
  const stepIndex: Record<Step, number> = { auth: 0, otp: 1, claim: 2 };
  const current = stepIndex[step];

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Claim Your Unit</h1>
          <p className="text-gray-500 mt-2 text-sm">
            Register as a resident to get your parking permit.
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          {/* Step indicator */}
          <div className="flex items-center mb-6">
            {steps.map((s, i) => {
              const done = i < current;
              const active = i === current;
              return (
                <div key={s.key} className="flex items-center flex-1 last:flex-none">
                  <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold shrink-0 ${
                    done ? "bg-green-500 text-white" : active ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-400"
                  }`}>
                    {done ? "✓" : i + 1}
                  </div>
                  <span className={`text-xs ml-1.5 ${active ? "text-gray-700 font-medium" : "text-gray-400"}`}>
                    {s.label}
                  </span>
                  {i < steps.length - 1 && <div className="flex-1 h-px bg-gray-200 mx-2" />}
                </div>
              );
            })}
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 mb-4">
              {error}
            </div>
          )}

          {/* ── Step 1: Auth ── */}
          {step === "auth" && (
            <>
              <div className="flex gap-2 mb-6">
                <button onClick={() => { setAuthMode("signup"); setError(""); }}
                  className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${authMode === "signup" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                  New account
                </button>
                <button onClick={() => { setAuthMode("login"); setError(""); }}
                  className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${authMode === "login" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                  Sign in
                </button>
              </div>

              <form onSubmit={handleAuth} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                    required placeholder="you@example.com"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                    required placeholder="••••••••"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                {authMode === "signup" && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Phone number <span className="text-red-500">*</span>
                    </label>
                    <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
                      required placeholder="+1 (555) 000-0000"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <p className="text-xs text-gray-400 mt-1">
                      We&apos;ll send a verification code via SMS.
                    </p>
                  </div>
                )}
                <button type="submit" disabled={isLoading}
                  className="w-full py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
                  {isLoading
                    ? "Please wait..."
                    : authMode === "signup"
                    ? "Create account & send code"
                    : "Sign in"}
                </button>
              </form>
            </>
          )}

          {/* ── Step 2: OTP ── */}
          {step === "otp" && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                We sent a 6-digit code to <span className="font-medium text-gray-900">{pendingPhone}</span>. Enter it below.
              </p>
              <form onSubmit={handleVerifyOtp} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Verification code</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    required
                    maxLength={6}
                    placeholder="123456"
                    autoFocus
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono tracking-[0.4em] text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <button type="submit" disabled={isLoading || otpCode.length < 6}
                  className="w-full py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
                  {isLoading ? "Verifying..." : "Verify phone"}
                </button>
              </form>
              <button onClick={handleResendOtp} disabled={resendCooldown > 0}
                className="w-full text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50 transition-colors">
                {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : "Resend code"}
              </button>
            </div>
          )}

          {/* ── Step 3: Claim ── */}
          {step === "claim" && (
            <form onSubmit={handleClaim} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Invite Code</label>
                <input type="text" value={code} onChange={(e) => setCode(e.target.value)}
                  required placeholder="e.g., RIVER-101-ABCD"
                  autoFocus
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <p className="text-xs text-gray-400 mt-1">Get this code from your property manager.</p>
              </div>
              <button type="submit" disabled={isLoading || !code.trim()}
                className="w-full py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
                {isLoading ? "Verifying..." : "Claim unit"}
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          Already have an account?{" "}
          <Link href="/login" className="text-blue-600 hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
}

export default function ClaimPage() {
  return (
    <Suspense>
      <ClaimPageInner />
    </Suspense>
  );
}
