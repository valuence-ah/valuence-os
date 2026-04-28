"use client";
// ─── Login Page ───────────────────────────────────────────────────────────────
// Three modes:
//   magic    — email-only magic link (no password needed)
//   password — email + password sign-in
//   forgot   — sends a password-reset email; user clicks link → /auth/reset-password

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

type Mode = "magic" | "password" | "forgot";

export default function LoginPage() {
  const supabase = createClient();
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode]         = useState<Mode>("magic");
  const [loading, setLoading]   = useState(false);
  const [message, setMessage]   = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [redirectTo, setRedirectTo] = useState("/dashboard");

  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get("redirectTo") ?? "";
    if (raw && /^\/[^/\\]/.test(raw)) setRedirectTo(raw);
  }, []);

  // ── Magic link ──────────────────────────────────────────────────────────────
  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    // Pre-flight: check whether this email is approved before sending OTP.
    // This blocks unapproved users at the login page instead of letting
    // Supabase send a link that then fails at the dashboard gating step.
    try {
      const res = await fetch("/api/auth/check-approval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const { approved, reason } = await res.json() as { approved: boolean; reason?: string };

      if (!approved) {
        setLoading(false);
        if (reason === "pending") {
          setMessage({
            type: "error",
            text: "Your access request is pending admin review. You'll get an email once approved.",
          });
        } else if (reason === "rejected") {
          setMessage({
            type: "error",
            text: "Your access request was not approved. Contact andrew@valuence.vc for help.",
          });
        } else {
          // Unknown email — invite them to request access
          setMessage({
            type: "error",
            text: "This email doesn't have access yet. Request access below.",
          });
        }
        return;
      }
    } catch {
      // If the check fails (network error etc.), allow OTP to proceed —
      // the dashboard layout will still gate unapproved users server-side.
    }

    const callbackUrl = `${window.location.origin}/auth/callback?redirectTo=${encodeURIComponent(redirectTo)}`;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: callbackUrl },
    });
    setLoading(false);
    setMessage(
      error
        ? { type: "error", text: error.message }
        : { type: "success", text: "Check your email — we sent you a magic link." }
    );
  }

  // ── Password sign-in ────────────────────────────────────────────────────────
  async function handlePassword(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setMessage({ type: "error", text: error.message });
    } else {
      window.location.href = redirectTo;
    }
  }

  // ── Forgot password — sends reset email ─────────────────────────────────────
  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    // After clicking the email link the user lands on /auth/callback which
    // exchanges the code and then redirects to /auth/reset-password
    const callbackUrl = `${window.location.origin}/auth/callback?redirectTo=${encodeURIComponent("/auth/reset-password")}`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: callbackUrl,
    });
    setLoading(false);
    setMessage(
      error
        ? { type: "error", text: error.message }
        : { type: "success", text: "Password reset email sent — check your inbox and click the link." }
    );
  }

  const submitHandler =
    mode === "magic" ? handleMagicLink :
    mode === "password" ? handlePassword :
    handleForgotPassword;

  return (
    <div className="min-h-screen bg-[#0a0f1e] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        {/* Logo / Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-blue-600 mb-4">
            <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">Valuence OS</h1>
          <p className="text-slate-400 text-sm mt-1">Valuence Ventures · Operating System</p>
        </div>

        {/* Card */}
        <div className="bg-[#131929] border border-[#1e2d4a] rounded-2xl p-6">

          {/* ── Forgot-password view ─────────────────────────────────────── */}
          {mode === "forgot" ? (
            <>
              <div className="mb-5">
                <h2 className="text-sm font-semibold text-white">Reset your password</h2>
                <p className="text-xs text-slate-400 mt-1">
                  Enter your email and we&apos;ll send a reset link. Click it to set a new password.
                </p>
              </div>

              <form onSubmit={handleForgotPassword} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">
                    Email address
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@valuenceventures.com"
                    required
                    className="w-full px-3 py-2.5 text-sm bg-[#0a0f1e] border border-[#1e2d4a] rounded-lg
                               text-white placeholder-slate-600 focus:outline-none focus:ring-2
                               focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {message && (
                  <div className={`text-xs px-3 py-2.5 rounded-lg ${
                    message.type === "success"
                      ? "bg-green-900/40 text-green-300 border border-green-800"
                      : "bg-red-900/40 text-red-300 border border-red-800"
                  }`}>
                    {message.text}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-50
                             text-white text-sm font-medium rounded-lg transition-colors"
                >
                  {loading ? "Sending…" : "Send Reset Link"}
                </button>
              </form>

              <button
                onClick={() => { setMode("password"); setMessage(null); }}
                className="mt-4 w-full text-center text-xs text-slate-500 hover:text-slate-300 transition-colors"
              >
                ← Back to sign in
              </button>
            </>
          ) : (

          /* ── Normal sign-in view ───────────────────────────────────────── */
          <>
            {/* Mode toggle */}
            <div className="flex gap-1 bg-[#0a0f1e] p-1 rounded-lg mb-5">
              {(["magic", "password"] as const).map(m => (
                <button
                  key={m}
                  onClick={() => { setMode(m); setMessage(null); }}
                  className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${
                    mode === m
                      ? "bg-blue-600 text-white"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {m === "magic" ? "Magic Link" : "Password"}
                </button>
              ))}
            </div>

            <form onSubmit={submitHandler} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  Email address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@valuenceventures.com"
                  required
                  className="w-full px-3 py-2.5 text-sm bg-[#0a0f1e] border border-[#1e2d4a] rounded-lg
                             text-white placeholder-slate-600 focus:outline-none focus:ring-2
                             focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {mode === "password" && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-medium text-slate-400">Password</label>
                    <button
                      type="button"
                      onClick={() => { setMode("forgot"); setMessage(null); }}
                      className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="w-full px-3 py-2.5 text-sm bg-[#0a0f1e] border border-[#1e2d4a] rounded-lg
                               text-white placeholder-slate-600 focus:outline-none focus:ring-2
                               focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              )}

              {message && (
                <div className={`text-xs px-3 py-2.5 rounded-lg ${
                  message.type === "success"
                    ? "bg-green-900/40 text-green-300 border border-green-800"
                    : "bg-red-900/40 text-red-300 border border-red-800"
                }`}>
                  {message.text}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-50
                           text-white text-sm font-medium rounded-lg transition-colors"
              >
                {loading
                  ? "Please wait…"
                  : mode === "magic"
                  ? "Send Magic Link"
                  : "Sign In"}
              </button>
            </form>
          </>
          )}
        </div>

        <div className="mt-4 pt-4 border-t border-slate-700 text-center">
          <p className="text-xs text-slate-500">
            Don&apos;t have access?{" "}
            <a href="/auth/request-access" className="text-blue-400 hover:text-blue-300 font-medium hover:underline">
              Request access
            </a>
          </p>
        </div>

        <p className="text-center text-xs text-slate-600 mt-4">
          Internal use only · Valuence Ventures
        </p>
      </div>
    </div>
  );
}
