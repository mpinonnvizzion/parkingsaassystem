"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Step = "auth" | "phone" | "claim";

function ClaimPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const [step, setStep] = useState<Step>("auth");
  const [authMode, setAuthMode] = useState<"login" | "signup">("signup");
  const [code, setCode] = useState(searchParams.get("code") ?? "");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  // Phone verification state
  const [phone, setPhone] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  // Resend countdown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  // If already signed in, check if phone is verified too
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user?.email_confirmed_at) return;
      // Check if phone already verified
      const { data: profile } = await supabase
        .from("profiles")
        .select("phone")
        .eq("id", user.id)
        .single();
      if (profile?.phone) {
        setStep("claim");
      } else {
        setStep("phone");
      }
    });
  }, []);

  async function handleAuth(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    try {
      if (authMode === "signup") {
        const redirectTo = `${window.location.origin}/api/auth/callback?next=/claim`;
        const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo } });
        if (error) throw error;
        setSuccessMessage("Check your email to confirm your account. After clicking the link you'll be brought back here automatically.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        // Check phone verification status
        const { data: { user } } = await supabase.auth.getUser();
        const { data: profile } = await supabase
          .from("profiles")
          .select("phone")
          .eq("id", user!.id)
          .single();
        if (profile?.phone) {
          setStep("claim");
        } else {
          setStep("phone");
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSendOtp() {
    if (!phone.trim()) {
      setError("Please enter your phone number");
      return;
    }
    setError("");
    setIsSendingOtp(true);
    try {
      const res = await fetch("/api/verify/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim() }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to send code");
      setOtpSent(true);
      setOtpCode("");
      setResendCooldown(60);
      setSuccessMessage(`Verification code sent to ${phone}`);
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setIsSendingOtp(false);
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    if (!otpCode.trim()) return;
    setError("");
    setSuccessMessage("");
    setIsVerifyingOtp(true);
    try {
      const res = await fetch("/api/verify/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim(), code: otpCode.trim() }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Incorrect code");
      setStep("claim");
      setSuccessMessage("");
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setIsVerifyingOtp(false);
    }
  }

  async function handleClaim(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    try {
      const { data, error } = await supabase.rpc("claim_unit", {
        p_code: code.trim(),
      });
      if (error) throw error;
      const result = data as { success: boolean; error?: string; property_id?: string; unit_id?: string } | null;
      if (!result?.success) {
        setError(result?.error || "Invalid or expired invite code");
        return;
      }
      if (result.property_id) {
        router.push(`/properties/${result.property_id}`);
      } else {
        router.push("/properties");
      }
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message;
      setError(msg || "Invalid or expired invite code");
    } finally {
      setIsLoading(false);
    }
  }

  // Step indicator config
  const steps: { key: Step; label: string }[] = [
    { key: "auth", label: "Sign in" },
    { key: "phone", label: "Verify phone" },
    { key: "claim", label: "Enter code" },
  ];
  const stepIndex: Record<Step, number> = { auth: 0, phone: 1, claim: 2 };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Claim Your Unit</h1>
          <p className="text-gray-500 mt-2 text-sm">
            Enter your invite code to register as a resident.
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          {/* Step indicator */}
          <div className="flex items-center gap-2 mb-6">
            {steps.map((s, i) => {
              const current = stepIndex[step];
              const isDone = i < current;
              const isActive = i === current;
              return (
                <div key={s.key} className="flex items-center gap-2 flex-1 last:flex-none">
                  <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold shrink-0 ${
                    isDone ? "bg-green-500 text-white" : isActive ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-400"
                  }`}>
                    {isDone ? "✓" : i + 1}
                  </div>
                  <span className={`text-xs ${isActive ? "text-gray-700 font-medium" : "text-gray-400"}`}>{s.label}</span>
                  {i < steps.length - 1 && <div className="flex-1 h-px bg-gray-200" />}
                </div>
              );
            })}
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 mb-4">
              {error}
            </div>
          )}

          {successMessage && (
            <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-700 mb-4">
              {successMessage}
            </div>
          )}

          {/* Step 1: Auth */}
          {step === "auth" && (
            <>
              <div className="flex gap-2 mb-6">
                <button
                  onClick={() => setAuthMode("signup")}
                  className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${authMode === "signup" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
                >
                  New account
                </button>
                <button
                  onClick={() => setAuthMode("login")}
                  className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${authMode === "login" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
                >
                  Sign in
                </button>
              </div>

              <form onSubmit={handleAuth} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="you@example.com"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    placeholder="••••••••"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {isLoading ? "Please wait..." : authMode === "signup" ? "Create account" : "Sign in"}
                </button>
              </form>
            </>
          )}

          {/* Step 2: Phone verification */}
          {step === "phone" && (
            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-600 mb-4">
                  We need to verify your phone number. We&apos;ll send you a 6-digit code by SMS.
                </p>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone number</label>
                <div className="flex gap-2">
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => { setPhone(e.target.value); setOtpSent(false); setOtpCode(""); }}
                    placeholder="+1 (555) 000-0000"
                    disabled={otpSent && resendCooldown > 0}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
                  />
                  <button
                    type="button"
                    onClick={handleSendOtp}
                    disabled={isSendingOtp || (otpSent && resendCooldown > 0) || !phone.trim()}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors whitespace-nowrap"
                  >
                    {isSendingOtp
                      ? "Sending..."
                      : otpSent && resendCooldown > 0
                      ? `Resend (${resendCooldown}s)`
                      : otpSent
                      ? "Resend"
                      : "Send code"}
                  </button>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  US numbers: enter as 10 digits or with +1 prefix.
                </p>
              </div>

              {otpSent && (
                <form onSubmit={handleVerifyOtp} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Verification code</label>
                    <input
                      type="text"
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      required
                      placeholder="6-digit code"
                      maxLength={6}
                      autoFocus
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isVerifyingOtp || otpCode.length < 6}
                    className="w-full py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    {isVerifyingOtp ? "Verifying..." : "Verify phone"}
                  </button>
                </form>
              )}
            </div>
          )}

          {/* Step 3: Claim unit */}
          {step === "claim" && (
            <form onSubmit={handleClaim} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Invite Code
                </label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                  placeholder="e.g., RIVER-101-ABCD"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
                <p className="text-xs text-gray-400 mt-1">
                  Get this code from your property manager.
                </p>
              </div>
              <button
                type="submit"
                disabled={isLoading || !code.trim()}
                className="w-full py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {isLoading ? "Verifying..." : "Claim unit"}
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          Already have an account?{" "}
          <Link href="/login" className="text-blue-600 hover:underline">
            Sign in
          </Link>
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
