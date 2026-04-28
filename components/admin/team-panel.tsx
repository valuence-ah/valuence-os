"use client";
// ─── Team Panel ────────────────────────────────────────────────────────────────
// Admin-only: approve/reject access requests + manage active team members.

import { useState } from "react";
import { UserPlus, UserX, ChevronDown, Check, X, Clock, Users } from "lucide-react";
import { cn } from "@/lib/utils";

interface AccessRequest {
  id: string;
  email: string;
  full_name: string;
  message: string | null;
  requested_at: string;
  status: string;
}

interface TeamMember {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  created_at: string;
  outlook_mailbox: string | null;
  fireflies_email: string | null;
  initials:        string | null;
}

interface Props {
  initialRequests: AccessRequest[];
  initialMembers:  TeamMember[];
}

const ROLE_OPTIONS = [
  { value: "partner",   label: "Partner"   },
  { value: "principal", label: "Principal" },
  { value: "analyst",   label: "Analyst"   },
];

const ROLE_COLORS: Record<string, string> = {
  admin:     "bg-violet-100 text-violet-700",
  partner:   "bg-blue-100 text-blue-700",
  principal: "bg-sky-100 text-sky-700",
  analyst:   "bg-slate-100 text-slate-600",
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
}

export function TeamPanel({ initialRequests, initialMembers }: Props) {
  const [requests, setRequests] = useState<AccessRequest[]>(initialRequests);
  const [members,  setMembers]  = useState<TeamMember[]>(initialMembers);

  // Per-request state
  const [approveRole,   setApproveRole]   = useState<Record<string, string>>({});
  const [loadingAction, setLoadingAction] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null);

  function showToast(text: string, ok = true) {
    setToast({ text, ok });
    setTimeout(() => setToast(null), 3500);
  }

  async function handleApprove(req: AccessRequest) {
    const role = approveRole[req.id] ?? "analyst";
    setLoadingAction(p => ({ ...p, [req.id]: true }));
    const res = await fetch("/api/admin/invite-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId: req.id, email: req.email, fullName: req.full_name, role }),
    });
    setLoadingAction(p => ({ ...p, [req.id]: false }));
    if (res.ok) {
      setRequests(p => p.filter(r => r.id !== req.id));
      showToast(`Invite sent to ${req.email}`);
    } else {
      const j = await res.json();
      showToast(j.error ?? "Failed to invite", false);
    }
  }

  async function handleReject(req: AccessRequest) {
    setLoadingAction(p => ({ ...p, [req.id]: true }));
    const res = await fetch("/api/admin/reject-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId: req.id }),
    });
    setLoadingAction(p => ({ ...p, [req.id]: false }));
    if (res.ok) {
      setRequests(p => p.filter(r => r.id !== req.id));
      showToast(`Request from ${req.email} rejected`);
    } else {
      showToast("Failed to reject", false);
    }
  }

  async function handleRoleChange(member: TeamMember, newRole: string) {
    setLoadingAction(p => ({ ...p, [member.id]: true }));
    const res = await fetch("/api/admin/update-role", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: member.id, role: newRole }),
    });
    setLoadingAction(p => ({ ...p, [member.id]: false }));
    if (res.ok) {
      setMembers(p => p.map(m => m.id === member.id ? { ...m, role: newRole } : m));
      showToast(`Role updated to ${newRole}`);
    } else {
      showToast("Failed to update role", false);
    }
  }

  async function handleRevoke(member: TeamMember) {
    if (!confirm(`Remove ${member.full_name ?? member.email} from Valuence OS? They will be locked out immediately.`)) return;
    setLoadingAction(p => ({ ...p, [member.id]: true }));
    const res = await fetch("/api/admin/revoke-access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: member.id }),
    });
    setLoadingAction(p => ({ ...p, [member.id]: false }));
    if (res.ok) {
      setMembers(p => p.filter(m => m.id !== member.id));
      showToast(`Access revoked for ${member.full_name ?? member.email}`);
    } else {
      const j = await res.json();
      showToast(j.error ?? "Failed to revoke", false);
    }
  }

  const pending = requests.filter(r => r.status === "pending");

  return (
    <div className="flex-1 overflow-auto p-6 space-y-8">

      {/* Toast */}
      {toast && (
        <div className={cn(
          "fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium",
          toast.ok ? "bg-emerald-600 text-white" : "bg-red-600 text-white"
        )}>
          {toast.text}
        </div>
      )}

      {/* ── Pending Requests ─────────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Clock size={16} className="text-amber-500" />
          <h2 className="text-sm font-semibold text-slate-800">Pending Requests</h2>
          {pending.length > 0 && (
            <span className="bg-amber-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">{pending.length}</span>
          )}
        </div>

        {pending.length === 0 ? (
          <div className="bg-slate-50 border border-slate-200 rounded-xl px-6 py-8 text-center">
            <UserPlus size={28} className="text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-400">No pending access requests</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pending.map(req => (
              <div key={req.id} className="bg-white border border-slate-200 rounded-xl p-4 flex items-start gap-4">
                {/* Avatar */}
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 text-blue-700 font-semibold text-sm">
                  {req.full_name.charAt(0).toUpperCase()}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-900">{req.full_name}</p>
                  <p className="text-xs text-slate-500">{req.email}</p>
                  {req.message && (
                    <p className="text-xs text-slate-600 mt-1 italic">&ldquo;{req.message}&rdquo;</p>
                  )}
                  <p className="text-xs text-slate-400 mt-1">Requested {fmtDate(req.requested_at)}</p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {/* Role picker */}
                  <div className="relative">
                    <select
                      value={approveRole[req.id] ?? "analyst"}
                      onChange={e => setApproveRole(p => ({ ...p, [req.id]: e.target.value }))}
                      className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 pr-6 appearance-none"
                    >
                      {ROLE_OPTIONS.map(r => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </select>
                    <ChevronDown size={10} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>

                  <button
                    onClick={() => handleApprove(req)}
                    disabled={loadingAction[req.id]}
                    className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
                  >
                    <Check size={12} />
                    {loadingAction[req.id] ? "Sending…" : "Approve"}
                  </button>

                  <button
                    onClick={() => handleReject(req)}
                    disabled={loadingAction[req.id]}
                    className="flex items-center gap-1 border border-slate-200 hover:bg-slate-50 disabled:opacity-50 text-slate-600 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
                  >
                    <X size={12} />
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Active Team ───────────────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Users size={16} className="text-blue-500" />
          <h2 className="text-sm font-semibold text-slate-800">Active Team</h2>
          <span className="text-xs text-slate-400">{members.length} member{members.length !== 1 ? "s" : ""}</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {members.length === 0 ? (
            <div className="px-6 py-8 text-center text-sm text-slate-400">No team members yet</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {members.map(member => (
                <div key={member.id} className="px-4 py-3 hover:bg-slate-50/60 transition-colors">
                  <div className="flex items-center gap-3">
                    {/* Avatar + name */}
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-semibold text-xs flex-shrink-0">
                        {(member.full_name ?? member.email).charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900 truncate text-sm">{member.full_name ?? "—"}</p>
                        <p className="text-xs text-slate-400 truncate">{member.email}</p>
                      </div>
                    </div>
                    {/* Role */}
                    <div className="flex-shrink-0">
                      {member.role === "admin" ? (
                        <span className={cn("text-xs font-medium px-2.5 py-1 rounded-full", ROLE_COLORS["admin"])}>Admin</span>
                      ) : (
                        <div className="relative inline-block">
                          <select
                            value={member.role}
                            onChange={e => handleRoleChange(member, e.target.value)}
                            disabled={loadingAction[member.id]}
                            className={cn(
                              "text-xs font-medium px-2.5 py-1 rounded-full border-0 focus:outline-none focus:ring-1 focus:ring-blue-400 appearance-none pr-5 cursor-pointer disabled:opacity-50",
                              ROLE_COLORS[member.role] ?? "bg-slate-100 text-slate-600"
                            )}
                          >
                            {ROLE_OPTIONS.map(r => (
                              <option key={r.value} value={r.value}>{r.label}</option>
                            ))}
                          </select>
                          <ChevronDown size={10} className="absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none opacity-60" />
                        </div>
                      )}
                    </div>
                    {/* Joined */}
                    <span className="text-xs text-slate-400 hidden sm:inline flex-shrink-0">{fmtDate(member.created_at)}</span>
                    {/* Revoke */}
                    <div className="flex-shrink-0">
                      {member.role !== "admin" && (
                        <button
                          onClick={() => handleRevoke(member)}
                          disabled={loadingAction[member.id]}
                          className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50 flex items-center gap-1"
                        >
                          <UserX size={13} />
                          Revoke
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Per-member integrations */}
                  <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Outlook mailbox</label>
                      <input
                        type="email"
                        defaultValue={member.outlook_mailbox ?? ""}
                        placeholder="user@valuence.vc"
                        className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400"
                        onBlur={async (e) => {
                          const val = e.target.value.trim().toLowerCase() || null;
                          if (val === member.outlook_mailbox) return;
                          const res = await fetch("/api/admin/update-integrations", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ userId: member.id, outlook_mailbox: val }),
                          });
                          if (res.ok) {
                            setMembers(p => p.map(m => m.id === member.id ? { ...m, outlook_mailbox: val } : m));
                            showToast(`Outlook mailbox updated for ${member.full_name ?? member.email}`);
                          } else showToast("Failed to update", false);
                        }}
                      />
                      <p className="text-[10px] text-slate-400 mt-0.5">Emails to this address auto-tag this user as recipient.</p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Fireflies email</label>
                      <input
                        type="email"
                        defaultValue={member.fireflies_email ?? ""}
                        placeholder="user@valuence.vc"
                        className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400"
                        onBlur={async (e) => {
                          const val = e.target.value.trim().toLowerCase() || null;
                          if (val === member.fireflies_email) return;
                          const res = await fetch("/api/admin/update-integrations", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ userId: member.id, fireflies_email: val }),
                          });
                          if (res.ok) {
                            setMembers(p => p.map(m => m.id === member.id ? { ...m, fireflies_email: val } : m));
                            showToast(`Fireflies email updated for ${member.full_name ?? member.email}`);
                          } else showToast("Failed to update", false);
                        }}
                      />
                      <p className="text-[10px] text-slate-400 mt-0.5">Used to attribute meeting transcripts.</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
