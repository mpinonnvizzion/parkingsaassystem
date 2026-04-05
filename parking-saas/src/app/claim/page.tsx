"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function ClaimPage() {
  const router = useRouter();
  const supabase = createClient();
  const [step, setStep] = useState<"auth" | "claim">("auth");
  const [authMode, setAuthMode] = useState<"login" | "signup">("signup");
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  // If already signed in with a confirmed email, skip straight to the claim step
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.email_confirmed_at) setStep("claim");
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
        setStep("claim");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        setStep("claim");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setIsLoading(false);
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
          <div className="flex items-center gap-3 mb-6">
            <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${step === "auth" ? "bg-blue-600 text-white" : "bg-green-500 text-white"}`}>
              {step === "auth" ? "1" : "✓"}
            </div>
            <span className="text-sm text-gray-500">Sign in / Sign up</span>
            <div className="flex-1 h-px bg-gray-200" />
            <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${step === "claim" ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-400"}`}>
              2
            </div>
            <span className="text-sm text-gray-500">Enter code</span>
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

          {step === "auth" ? (
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
          ) : (
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
