"use client";
// ─── Login Page ───────────────────────────────────────────────────────────────
// Supports both magic link (email only) and email+password login.
// Uses Supabase Auth — no passwords are stored by us.

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"magic" | "password">("magic");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setLoading(false);
    if (error) {
      setMessage({ type: "error", text: error.message });
    } else {
      setMessage({ type: "success", text: "Check your email — we sent you a magic link." });
    }
  }

  async function handlePassword(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setMessage({ type: "error", text: error.message });
    } else {
      window.location.href = "/dashboard";
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0f1e] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo / Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-blue-600 mb-4">
            <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">Valuence OS</h1>
          <p className="text-slate-400 text-sm mt-1">Valuence Ventures · Operating System</p>
        </div>

        {/* Login Card */}
        <div className="bg-[#131929] border border-[#1e2d4a] rounded-2xl p-6">
          {/* Mode Toggle */}
          <div className="flex gap-1 bg-[#0a0f1e] p-1 rounded-lg mb-5">
            {(["magic", "password"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
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

          <form onSubmit={mode === "magic" ? handleMagicLink : handlePassword} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                Email address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@valuenceventures.com"
                required
                className="w-full px-3 py-2.5 text-sm bg-[#0a0f1e] border border-[#1e2d4a] rounded-lg text-white placeholder-slate-600
                           focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {mode === "password" && (
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full px-3 py-2.5 text-sm bg-[#0a0f1e] border border-[#1e2d4a] rounded-lg text-white placeholder-slate-600
                             focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            )}

            {message && (
              <div
                className={`text-xs px-3 py-2.5 rounded-lg ${
                  message.type === "success"
                    ? "bg-green-900/40 text-green-300 border border-green-800"
                    : "bg-red-900/40 text-red-300 border border-red-800"
                }`}
              >
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
        </div>

        <p className="text-center text-xs text-slate-600 mt-4">
          Internal use only · Valuence Ventures
        </p>
      </div>
    </div>
  );
}
