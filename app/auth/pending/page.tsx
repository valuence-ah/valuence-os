"use client";
// ─── Access Pending Page ───────────────────────────────────────────────────────
// Shown to users who have authenticated but haven't been approved by an admin yet.

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function PendingPage() {
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/auth/login");
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

        <div className="bg-white rounded-2xl shadow-2xl p-8 text-center">
          {/* Hourglass icon */}
          <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-5">
            <svg className="w-8 h-8 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>

          <h1 className="text-xl font-semibold text-slate-900 mb-2">
            Awaiting Approval
          </h1>
          <p className="text-sm text-slate-500 mb-6 leading-relaxed">
            Your account has been created but is pending admin review.
            You&apos;ll receive an email once a Valuence team member approves your access.
          </p>

          <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-left mb-6">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">What happens next?</p>
            <ol className="text-xs text-slate-500 space-y-1 list-decimal list-inside">
              <li>A team admin reviews your request</li>
              <li>You receive an approval email with a sign-in link</li>
              <li>Click the link to access Valuence OS</li>
            </ol>
          </div>

          <button
            onClick={handleSignOut}
            className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg transition-colors"
          >
            Sign out
          </button>

          <p className="text-xs text-slate-400 mt-4">
            Questions? Contact{" "}
            <a href="mailto:andrew@valuence.vc" className="text-blue-500 hover:underline">
              andrew@valuence.vc
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
