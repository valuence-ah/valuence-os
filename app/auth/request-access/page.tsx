"use client";
// ─── Request Access Page ───────────────────────────────────────────────────────
// Step 1: User registers with name + email + password → account created, pending
// Step 2: Admin reviews the request and approves
// Step 3: User receives an email and can sign in to access the app

import { useState } from "react";
import Link from "next/link";

export default function RequestAccessPage() {
  const [fullName,        setFullName]        = useState("");
  const [email,           setEmail]           = useState("");
  const [password,        setPassword]        = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message,         setMessage]         = useState("");
  const [loading,         setLoading]         = useState(false);
  const [done,            setDone]            = useState(false);
  const [error,           setError]           = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    const res = await fetch("/api/auth/request-access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fullName, email, password, message }),
    });
    const json = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(json.error ?? "Something went wrong. Please try again.");
    } else {
      setDone(true);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0f1e] to-[#0D3D38] flex items-center justify-center p-4">
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="flex items-center gap-3 mb-8 justify-center">
          <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </div>
          <span className="text-white text-lg font-semibold">Valuence OS</span>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          {done ? (
            /* ── Success state ── */
            <div className="text-center py-2">
              <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-slate-900 mb-2">Account created!</h2>
              <p className="text-sm text-slate-500 mb-6 leading-relaxed">
                Your account has been created and your request is pending admin approval.
                You&apos;ll receive an email at <strong>{email}</strong> once you&apos;re approved.
              </p>

              {/* What happens next */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-left mb-6">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">What happens next</p>
                <ol className="space-y-2">
                  {[
                    "A Valuence team admin reviews your request",
                    "You receive an approval email notification",
                    "Sign in with your email and password to access the app",
                  ].map((step, i) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <span className="flex-shrink-0 w-5 h-5 bg-emerald-100 text-emerald-700 rounded-full text-[10px] font-bold flex items-center justify-center mt-0.5">
                        {i + 1}
                      </span>
                      <span className="text-xs text-slate-500">{step}</span>
                    </li>
                  ))}
                </ol>
              </div>

              <Link
                href="/auth/login"
                className="text-sm text-blue-600 hover:underline"
              >
                Back to sign in
              </Link>
            </div>
          ) : (
            <>
              <h1 className="text-xl font-semibold text-slate-900 mb-1">Request Access</h1>

              {/* How it works — 3-step progress indicator */}
              <div className="flex items-center gap-0 mb-6 mt-3">
                {[
                  { n: "1", label: "Register" },
                  { n: "2", label: "Admin approves" },
                  { n: "3", label: "Get access" },
                ].map((step, i, arr) => (
                  <div key={i} className="flex items-center flex-1">
                    <div className="flex flex-col items-center flex-shrink-0">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${i === 0 ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-400"}`}>
                        {step.n}
                      </div>
                      <span className={`text-[9px] mt-1 font-medium whitespace-nowrap ${i === 0 ? "text-blue-600" : "text-slate-400"}`}>{step.label}</span>
                    </div>
                    {i < arr.length - 1 && (
                      <div className="flex-1 h-px bg-slate-200 mx-1 mb-4" />
                    )}
                  </div>
                ))}
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Full name</label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    placeholder="Jane Smith"
                    className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 text-slate-900 placeholder-slate-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Work email</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="jane@example.com"
                    className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 text-slate-900 placeholder-slate-400"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Password</label>
                    <input
                      type="password"
                      required
                      minLength={8}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Min. 8 characters"
                      className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 text-slate-900 placeholder-slate-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Confirm password</label>
                    <input
                      type="password"
                      required
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      placeholder="Repeat password"
                      className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 text-slate-900 placeholder-slate-400"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Note <span className="text-slate-400 font-normal">(optional)</span>
                  </label>
                  <textarea
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    placeholder="e.g. Joining the investment team as Principal"
                    rows={2}
                    className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 text-slate-900 placeholder-slate-400 resize-none"
                  />
                </div>

                {/* Approval notice */}
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
                  <svg className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-xs text-amber-700 leading-relaxed">
                    Your account will be created but <strong>access is not granted until a team admin approves your request.</strong> You&apos;ll receive an email when approved.
                  </p>
                </div>

                {error && (
                  <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium py-2.5 rounded-lg transition-colors"
                >
                  {loading ? "Creating account…" : "Create account & request access"}
                </button>
              </form>

              <p className="text-center text-xs text-slate-400 mt-5">
                Already have access?{" "}
                <Link href="/auth/login" className="text-blue-600 hover:underline">Sign in</Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
