"use client";
// ─── Reset Password Page ──────────────────────────────────────────────────────
// Users land here after clicking the password-reset link in their email.
// The /auth/callback route already exchanged the code for a live session,
// so we just need to call supabase.auth.updateUser({ password }) to set
// the new password, then redirect to the dashboard.

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const supabase = createClient();
  const [password, setPassword]       = useState("");
  const [confirm, setConfirm]         = useState("");
  const [loading, setLoading]         = useState(false);
  const [done, setDone]               = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [sessionReady, setSessionReady] = useState(false);

  // Wait for the session to be established (the callback already did the code
  // exchange; we just need to confirm the client has a valid session).
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setSessionReady(true);
      } else {
        setError("This reset link has expired or already been used. Please request a new one.");
      }
    });
  }, [supabase]);

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (updateError) {
      setError(updateError.message);
    } else {
      setDone(true);
      // Give the user a moment to read the success message, then redirect
      setTimeout(() => { window.location.href = "/dashboard"; }, 2500);
    }
  }

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

        <div className="bg-[#131929] border border-[#1e2d4a] rounded-2xl p-6">

          {/* ── Success state ─────────────────────────────────────────────── */}
          {done ? (
            <div className="text-center py-4">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-900/40 border border-green-700 mb-4">
                <svg className="w-6 h-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-sm font-semibold text-white mb-1">Password updated</h2>
              <p className="text-xs text-slate-400">Taking you to the dashboard…</p>
            </div>

          ) : !sessionReady ? (
            /* ── Loading / invalid session ──────────────────────────────── */
            <div className="text-center py-4">
              {error ? (
                <>
                  <p className="text-xs text-red-300 mb-4">{error}</p>
                  <a
                    href="/auth/login"
                    className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    ← Back to sign in
                  </a>
                </>
              ) : (
                <p className="text-xs text-slate-400">Verifying reset link…</p>
              )}
            </div>

          ) : (
            /* ── Set new password form ──────────────────────────────────── */
            <>
              <div className="mb-5">
                <h2 className="text-sm font-semibold text-white">Set a new password</h2>
                <p className="text-xs text-slate-400 mt-1">
                  Choose a strong password — at least 8 characters.
                </p>
              </div>

              <form onSubmit={handleReset} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">
                    New password
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    minLength={8}
                    className="w-full px-3 py-2.5 text-sm bg-[#0a0f1e] border border-[#1e2d4a] rounded-lg
                               text-white placeholder-slate-600 focus:outline-none focus:ring-2
                               focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">
                    Confirm new password
                  </label>
                  <input
                    type="password"
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="w-full px-3 py-2.5 text-sm bg-[#0a0f1e] border border-[#1e2d4a] rounded-lg
                               text-white placeholder-slate-600 focus:outline-none focus:ring-2
                               focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {error && (
                  <div className="text-xs px-3 py-2.5 rounded-lg bg-red-900/40 text-red-300 border border-red-800">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-50
                             text-white text-sm font-medium rounded-lg transition-colors"
                >
                  {loading ? "Updating…" : "Set New Password"}
                </button>
              </form>
            </>
          )}
        </div>

        <p className="text-center text-xs text-slate-600 mt-4">
          Internal use only · Valuence Ventures
        </p>
      </div>
    </div>
  );
}
