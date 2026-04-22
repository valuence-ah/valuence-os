"use client";
// ─── Resolution Modal ─────────────────────────────────────────────────────────
// Shows for meetings with partial/unresolved CRM resolution status.
// Allows users to confirm/create contacts and companies from meeting attendees.

import { useState, useEffect } from "react";
import { X, Check, Building2, User, ChevronRight, Loader2, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import type { Interaction } from "@/lib/types";
import type { AttendeeResolution, CompanyResolution, PendingResolutions } from "@/lib/meeting-resolution";

const TITLE_OPTIONS = [
  "General Partner",
  "Managing Partner",
  "Partner",
  "Venture Partner",
  "Principal",
  "Associate",
  "Analyst",
  "CEO / Co-Founder",
  "CTO / Co-Founder",
  "COO",
  "CFO",
  "President",
  "Founder",
  "VP",
  "Director",
  "Advisor",
  "Professor / Researcher",
  "Government Official",
  "Other",
] as const;

const CONTACT_TYPES = [
  "Founder / Mgmt", "Investor", "Government/Academic", "Limited Partner",
  "Advisor / KOL", "Strategic", "Ecosystem", "Other",
] as const;

const COMPANY_TYPES = [
  { value: "startup", label: "Startup" },
  { value: "fund", label: "Fund / VC" },
  { value: "lp", label: "LP" },
  { value: "corporate", label: "Corporate" },
  { value: "ecosystem_partner", label: "Ecosystem" },
  { value: "government", label: "Gov / Academic" },
  { value: "other", label: "Other" },
] as const;

const PIPELINE_STAGES = [
  "First Meeting", "Tracking", "Due Diligence",
  "Discussion in Process", "IC", "Portfolio", "Pass",
] as const;

interface Props {
  meeting: Interaction & { company?: { id: string; name: string } | null };
  onClose: () => void;
  onResolved: (meetingId: string) => void;
}

interface AttendeeForm {
  existing_id: string;
  first_name: string;
  last_name: string;
  email: string;
  title: string;
  type: string;
  mode: "matched" | "new" | "skip";
}

interface CompanyForm {
  existing_id: string;
  name: string;
  website: string;
  type: string;
  city: string;
  country: string;
  mode: "matched" | "new" | "skip";
}

interface CompanyStub { id: string; name: string; type: string; website?: string | null; }

export function ResolutionModal({ meeting, onClose, onResolved }: Props) {
  const resolutions = meeting.pending_resolutions as PendingResolutions | null;
  const externalAttendees: AttendeeResolution[] = resolutions?.attendees ?? [];
  const companyRes: CompanyResolution | null = resolutions?.company ?? null;

  const [attendeeForms, setAttendeeForms] = useState<AttendeeForm[]>(
    externalAttendees.map((r) => ({
      existing_id: r.contact?.id ?? "",
      first_name: r.contact?.first_name ?? r.attendee.name?.split(" ")[0] ?? "",
      last_name: r.contact?.last_name ?? r.attendee.name?.split(" ").slice(1).join(" ") ?? "",
      email: r.attendee.email ?? "",
      title: "",
      type: "Other",
      mode: r.contact ? "matched" : "new",
    }))
  );

  // Prefer the meeting's live-joined company over the (possibly stale) AI-detected pending_resolution
  const effectiveCompany = meeting.company ?? companyRes?.company ?? null;

  const [companyForm, setCompanyForm] = useState<CompanyForm>({
    existing_id: effectiveCompany?.id ?? "",
    name: effectiveCompany?.name ?? companyRes?.extracted_name ?? "",
    website: companyRes?.extracted_domain ? `https://${companyRes.extracted_domain}` : "",
    type: (effectiveCompany as CompanyStub | null)?.type ?? companyRes?.company?.type ?? "startup",
    city: "",
    country: "",
    mode: effectiveCompany ? "matched" : companyRes?.extracted_name ? "new" : "skip",
  });

  // Company search state
  const [allCompanies, setAllCompanies] = useState<CompanyStub[]>([]);
  const [companySearch, setCompanySearch] = useState("");
  const [showCompanySearch, setShowCompanySearch] = useState(false);
  const [matchedCompany, setMatchedCompany] = useState<CompanyStub | null>(
    effectiveCompany
      ? { id: effectiveCompany.id, name: effectiveCompany.name, type: (effectiveCompany as CompanyStub).type ?? "startup" }
      : null
  );

  const [addToPipeline, setAddToPipeline] = useState(false);
  const [pipelineStage, setPipelineStage] = useState<string>("First Meeting");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load companies for search
  useEffect(() => {
    const supabase = createClient();
    supabase.from("companies").select("id, name, type, website").order("name").limit(500)
      .then(({ data }) => { if (data) setAllCompanies(data as CompanyStub[]); });
  }, []);

  const filteredCompanies = allCompanies.filter(c =>
    !companySearch || c.name.toLowerCase().includes(companySearch.toLowerCase())
  ).slice(0, 8);

  function handleSelectCompany(c: CompanyStub) {
    setMatchedCompany(c);
    setCompanyForm(f => ({ ...f, existing_id: c.id, name: c.name, type: c.type, mode: "matched" }));
    setShowCompanySearch(false);
    setCompanySearch("");
  }

  function handleUnmatch() {
    setMatchedCompany(null);
    setCompanyForm(f => ({ ...f, existing_id: "", mode: "matched" }));
    setShowCompanySearch(true);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const contacts = attendeeForms
        .filter((f) => f.mode !== "skip")
        .map((f) => ({
          existing_id: f.existing_id || undefined,
          first_name: f.first_name,
          last_name: f.last_name,
          email: f.email,
          title: f.title || undefined,
          type: f.type,
          company_id: companyForm.mode !== "skip" ? (companyForm.existing_id || undefined) : undefined,
        }));

      const company = companyForm.mode === "skip" ? null : {
        existing_id: companyForm.existing_id || undefined,
        name: companyForm.name,
        website: companyForm.website || undefined,
        type: companyForm.type,
        location_city: companyForm.city || undefined,
        location_country: companyForm.country || undefined,
      };

      const res = await fetch("/api/fellow/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          meeting_id: meeting.id,
          contacts,
          company,
          pipeline: addToPipeline ? { stage: pipelineStage } : null,
        }),
      });

      if (!res.ok) {
        const d = await res.json() as { error?: string };
        throw new Error(d.error ?? "Save failed");
      }

      onResolved(meeting.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col z-10">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Resolve CRM Entities</h2>
            <p className="text-xs text-slate-500 mt-0.5 truncate max-w-md">
              {meeting.subject ?? "Untitled Meeting"}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 -mt-1 -mr-1">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {/* Section A: Attendees */}
          {externalAttendees.length > 0 && (
            <div>
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1">
                <User size={11} /> Attendees
              </h3>
              <div className="space-y-3">
                {attendeeForms.map((form, i) => {
                  const resolution = externalAttendees[i];
                  return (
                    <div key={i} className="border border-slate-200 rounded-xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-violet-100 flex items-center justify-center text-[10px] font-bold text-violet-600">
                            {(form.first_name[0] ?? "?").toUpperCase()}
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-slate-800">{resolution.attendee.name}</p>
                            <p className="text-[10px] text-slate-400">{resolution.attendee.email}</p>
                          </div>
                        </div>
                        <div className="flex gap-1">
                          {(["matched", "new", "skip"] as const).map((mode) => (
                            <button
                              key={mode}
                              onClick={() => setAttendeeForms(prev => prev.map((f, j) => j === i ? { ...f, mode } : f))}
                              className={cn(
                                "text-[10px] px-2 py-0.5 rounded border font-medium transition-colors",
                                form.mode === mode
                                  ? mode === "skip" ? "bg-slate-100 border-slate-300 text-slate-600"
                                    : "bg-teal-600 border-teal-600 text-white"
                                  : "border-slate-200 text-slate-400 hover:border-slate-300"
                              )}
                            >
                              {mode === "matched" ? "Re-Match" : mode === "new" ? "Create New" : "Skip"}
                            </button>
                          ))}
                        </div>
                      </div>

                      {form.mode === "matched" && resolution.contact && (
                        <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 flex items-center justify-between">
                          <div>
                            <p className="text-xs font-semibold text-emerald-800">
                              {resolution.contact.first_name} {resolution.contact.last_name}
                            </p>
                            <p className="text-[10px] text-emerald-600">{resolution.contact.type}</p>
                          </div>
                          <span className="text-[9px] px-1.5 py-0.5 bg-emerald-100 text-emerald-700 border border-emerald-200 rounded font-medium">
                            {resolution.confidence === "high" ? "Exact match" : "Name match"}
                          </span>
                        </div>
                      )}

                      {form.mode === "new" && (
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] text-slate-400 mb-0.5 block">First Name</label>
                            <input value={form.first_name}
                              onChange={e => setAttendeeForms(p => p.map((f, j) => j === i ? { ...f, first_name: e.target.value } : f))}
                              className="w-full text-xs border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-teal-400" />
                          </div>
                          <div>
                            <label className="text-[10px] text-slate-400 mb-0.5 block">Last Name</label>
                            <input value={form.last_name}
                              onChange={e => setAttendeeForms(p => p.map((f, j) => j === i ? { ...f, last_name: e.target.value } : f))}
                              className="w-full text-xs border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-teal-400" />
                          </div>
                          <div>
                            <label className="text-[10px] text-slate-400 mb-0.5 block">Title</label>
                            <select
                              value={form.title}
                              onChange={e => setAttendeeForms(p => p.map((f, j) => j === i ? { ...f, title: e.target.value } : f))}
                              className="w-full text-xs border border-slate-200 rounded px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-teal-400"
                            >
                              <option value="">Select title…</option>
                              {TITLE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="text-[10px] text-slate-400 mb-0.5 block">Contact Type</label>
                            <select value={form.type}
                              onChange={e => setAttendeeForms(p => p.map((f, j) => j === i ? { ...f, type: e.target.value } : f))}
                              className="w-full text-xs border border-slate-200 rounded px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-teal-400">
                              {CONTACT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Section B: Company */}
          <div>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1">
              <Building2 size={11} /> Company
            </h3>
            <div className="border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-slate-800">
                    {companyRes?.company?.name ?? companyRes?.extracted_name ?? "Unknown company"}
                  </p>
                  {companyRes?.extracted_domain && (
                    <p className="text-[10px] text-slate-400">{companyRes.extracted_domain}</p>
                  )}
                </div>
                <div className="flex gap-1">
                  {(["matched", "new", "skip"] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => {
                        setCompanyForm(f => ({ ...f, mode }));
                        if (mode === "matched") setShowCompanySearch(!matchedCompany);
                        else setShowCompanySearch(false);
                      }}
                      className={cn(
                        "text-[10px] px-2 py-0.5 rounded border font-medium transition-colors",
                        companyForm.mode === mode
                          ? mode === "skip" ? "bg-slate-100 border-slate-300 text-slate-600"
                            : "bg-teal-600 border-teal-600 text-white"
                          : "border-slate-200 text-slate-400 hover:border-slate-300"
                      )}
                    >
                      {mode === "matched" ? "Re-Match" : mode === "new" ? "Create New" : "Skip"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Matched company display — with Unmatch + Re-match */}
              {companyForm.mode === "matched" && matchedCompany && !showCompanySearch && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-emerald-800">{matchedCompany.name}</p>
                    <p className="text-[10px] text-emerald-600 capitalize">{matchedCompany.type}</p>
                  </div>
                  <button
                    onClick={handleUnmatch}
                    className="text-[10px] px-2 py-0.5 rounded border border-slate-300 text-slate-500 hover:bg-slate-100 transition-colors"
                  >
                    Unmatch
                  </button>
                </div>
              )}

              {/* Company search — shown when mode=matched but no company selected yet, or after unmatch */}
              {companyForm.mode === "matched" && (!matchedCompany || showCompanySearch) && (
                <div className="space-y-1.5">
                  <div className="relative">
                    <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      autoFocus
                      value={companySearch}
                      onChange={e => setCompanySearch(e.target.value)}
                      placeholder="Search existing companies…"
                      className="w-full text-xs border border-teal-300 rounded-lg pl-7 pr-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-teal-400"
                    />
                  </div>
                  {filteredCompanies.length > 0 ? (
                    <div className="border border-slate-200 rounded-lg overflow-hidden divide-y divide-slate-100">
                      {filteredCompanies.map(c => (
                        <button
                          key={c.id}
                          onClick={() => handleSelectCompany(c)}
                          className="w-full text-left px-3 py-2 hover:bg-teal-50 transition-colors flex items-center justify-between"
                        >
                          <span className="text-xs font-medium text-slate-800">{c.name}</span>
                          <span className="text-[10px] text-slate-400 capitalize">{c.type}</span>
                        </button>
                      ))}
                    </div>
                  ) : companySearch ? (
                    <p className="text-[11px] text-slate-400 pl-1">No companies found — try "Create New" instead.</p>
                  ) : (
                    <p className="text-[11px] text-slate-400 pl-1">Type to search companies…</p>
                  )}
                </div>
              )}

              {companyForm.mode === "new" && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="col-span-2">
                    <label className="text-[10px] text-slate-400 mb-0.5 block">Company Name</label>
                    <input value={companyForm.name}
                      onChange={e => setCompanyForm(f => ({ ...f, name: e.target.value }))}
                      className="w-full text-xs border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-teal-400" />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 mb-0.5 block">Website</label>
                    <input value={companyForm.website}
                      onChange={e => setCompanyForm(f => ({ ...f, website: e.target.value }))}
                      placeholder="https://…"
                      className="w-full text-xs border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-teal-400" />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 mb-0.5 block">Type</label>
                    <select value={companyForm.type}
                      onChange={e => setCompanyForm(f => ({ ...f, type: e.target.value }))}
                      className="w-full text-xs border border-slate-200 rounded px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-teal-400">
                      {COMPANY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 mb-0.5 block">City</label>
                    <input value={companyForm.city}
                      onChange={e => setCompanyForm(f => ({ ...f, city: e.target.value }))}
                      className="w-full text-xs border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-teal-400" />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 mb-0.5 block">Country</label>
                    <input value={companyForm.country}
                      onChange={e => setCompanyForm(f => ({ ...f, country: e.target.value }))}
                      className="w-full text-xs border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-teal-400" />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Section C: Pipeline */}
          {companyForm.mode !== "skip" && (
            <div>
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1">
                <ChevronRight size={11} /> Pipeline
              </h3>
              <div className="border border-slate-200 rounded-xl p-4 space-y-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={addToPipeline}
                    onChange={e => setAddToPipeline(e.target.checked)}
                    className="rounded border-slate-300" />
                  <span className="text-xs text-slate-700">Add to pipeline as active deal</span>
                </label>
                {addToPipeline && (
                  <div>
                    <label className="text-[10px] text-slate-400 mb-0.5 block">Deal Stage</label>
                    <select value={pipelineStage} onChange={e => setPipelineStage(e.target.value)}
                      className="w-full text-xs border border-slate-200 rounded px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-teal-400">
                      {PIPELINE_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between gap-3">
          {error && <p className="text-xs text-red-500 flex-1">{error}</p>}
          <div className="flex items-center gap-2 ml-auto">
            <button onClick={onClose}
              className="px-4 py-2 text-xs border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors">
              Skip for Now
            </button>
            <button onClick={handleSave} disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors">
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
              {saving ? "Saving…" : "Save & Resolve"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
