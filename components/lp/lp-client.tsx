"use client";
// ─── LP Tracker Client ─────────────────────────────────────────────────────────

import { useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import type { LpRelationship, LpStage } from "@/lib/types";
import { formatCurrency, formatDate, LP_STAGE_LABELS, LP_STAGE_COLORS, cn } from "@/lib/utils";
import { Plus, Search, Building2, UserPlus, ChevronDown, ChevronUp } from "lucide-react";

const STAGE_ORDER: LpStage[] = ["target","intro_made","meeting_scheduled","meeting_done","materials_sent","soft_commit","committed","closed"];

const LP_TYPE_OPTIONS = [
  "Family Office",
  "HNWI",
  "Fund of Funds",
  "Institutional",
  "Corporate VC",
  "Government",
  "Endowment / Foundation",
  "Sovereign Wealth Fund",
  "Other",
] as const;

const LOGO_TOKEN = "pk_FYk-9BO1QwS9yyppOxJ2vQ";

function extractDomain(url: string): string | null {
  try {
    const u = url.startsWith("http") ? url : `https://${url}`;
    return new URL(u).hostname.replace(/^www\./, "");
  } catch { return null; }
}

type RelWithJoins = LpRelationship & {
  company?: { id: string; name: string; aum: number | null; lp_type: string | null; location_country: string | null } | null;
  contact?: { id: string; first_name: string; last_name: string; email: string | null } | null;
};

interface Props {
  initialRelationships: RelWithJoins[];
  lpCompanies: { id: string; name: string; aum: number | null; lp_type: string | null }[];
}

export function LpClient({ initialRelationships, lpCompanies }: Props) {
  const supabase = createClient();
  const [relationships, setRelationships] = useState(initialRelationships);
  const [search, setSearch]       = useState("");
  const [stageFilter, setStage]   = useState("all");
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving]       = useState(false);

  // Modal: LP company fields (creating new)
  const [mode, setMode]           = useState<"new" | "existing">("new");
  const [lpName, setLpName]       = useState("");
  const [lpWebsite, setLpWebsite] = useState("");
  const [lpType, setLpType]       = useState("");
  const [lpCity, setLpCity]       = useState("");
  const [lpCountry, setLpCountry] = useState("");
  const [imgError, setImgError]   = useState(false);
  const [existingId, setExistingId] = useState("");

  // Modal: relationship fields
  const [stage, setStage2]          = useState<LpStage>("target");
  const [fundVehicle, setFundVehicle] = useState("Fund I");
  const [targetAlloc, setTargetAlloc] = useState("");
  const [committed, setCommitted]     = useState("");
  const [nextStep, setNextStep]       = useState("");
  const [nextStepDate, setNextStepDate] = useState("");
  const [notes, setNotes]             = useState("");

  // Modal: optional contact
  const [showContact, setShowContact]       = useState(false);
  const [contactFirst, setContactFirst]     = useState("");
  const [contactLast, setContactLast]       = useState("");
  const [contactEmail, setContactEmail]     = useState("");
  const [contactTitle, setContactTitle]     = useState("");

  const logoDomain = useMemo(() => {
    const d = extractDomain(lpWebsite);
    return d ?? null;
  }, [lpWebsite]);

  const logoSrc = logoDomain
    ? `https://img.logo.dev/${logoDomain}?token=${LOGO_TOKEN}&format=png&size=128`
    : null;

  function resetModal() {
    setMode("new");
    setLpName(""); setLpWebsite(""); setLpType(""); setLpCity(""); setLpCountry("");
    setImgError(false); setExistingId("");
    setStage2("target"); setFundVehicle("Fund I");
    setTargetAlloc(""); setCommitted(""); setNextStep(""); setNextStepDate(""); setNotes("");
    setShowContact(false);
    setContactFirst(""); setContactLast(""); setContactEmail(""); setContactTitle("");
  }

  const filtered = useMemo(() => relationships.filter(r => {
    const matchStage = stageFilter === "all" || r.stage === stageFilter;
    const q = search.toLowerCase();
    const matchSearch = !q || (r.company?.name ?? "").toLowerCase().includes(q);
    return matchStage && matchSearch && r.stage !== "passed";
  }), [relationships, search, stageFilter]);

  const totalTarget     = relationships.reduce((s, r) => s + (r.target_allocation ?? 0), 0);
  const totalCommitted  = relationships.filter(r => ["committed","closed"].includes(r.stage ?? "")).reduce((s, r) => s + (r.committed_amount ?? 0), 0);
  const totalSoftCommit = relationships.filter(r => r.stage === "soft_commit").reduce((s, r) => s + (r.target_allocation ?? 0), 0);
  const progressPct     = totalTarget > 0 ? Math.min((totalCommitted / totalTarget) * 100, 100) : 0;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();

    let companyId: string;

    if (mode === "existing") {
      if (!existingId) { setSaving(false); return; }
      companyId = existingId;
    } else {
      // Create the LP company
      const { data: co, error: coErr } = await supabase
        .from("companies")
        .insert({
          name:             lpName.trim(),
          type:             "lp",
          website:          lpWebsite.trim() || null,
          lp_type:          lpType || null,
          location_city:    lpCity.trim() || null,
          location_country: lpCountry.trim() || null,
          status:           "active",
        })
        .select("id")
        .single();
      if (coErr || !co) {
        alert(coErr?.message ?? "Failed to create LP company");
        setSaving(false);
        return;
      }
      companyId = co.id;
    }

    // Create the lp_relationship
    const { data: rel, error: relErr } = await supabase
      .from("lp_relationships")
      .insert({
        company_id:       companyId,
        stage,
        fund_vehicle:     fundVehicle.trim() || null,
        target_allocation: targetAlloc ? parseFloat(targetAlloc) : null,
        committed_amount:  committed  ? parseFloat(committed)  : null,
        next_step:        nextStep.trim() || null,
        next_step_date:   nextStepDate || null,
        notes:            notes.trim() || null,
        created_by:       user?.id,
      })
      .select("*, company:companies(id, name, aum, lp_type, location_country), contact:contacts(id, first_name, last_name, email)")
      .single();

    if (relErr || !rel) {
      alert(relErr?.message ?? "Failed to create LP relationship");
      setSaving(false);
      return;
    }

    // Optionally save a contact
    if (showContact && (contactFirst.trim() || contactEmail.trim())) {
      await supabase.from("contacts").insert({
        first_name:   contactFirst.trim() || null,
        last_name:    contactLast.trim()  || null,
        email:        contactEmail.trim() || null,
        title:        contactTitle.trim() || null,
        company_id:   companyId,
        type:         "Limited Partner",
        status:       "active",
      });
    }

    setRelationships(p => [rel as RelWithJoins, ...p]);
    setSaving(false);
    setShowModal(false);
    resetModal();
  }

  async function updateStage(id: string, s: LpStage) {
    await supabase.from("lp_relationships").update({ stage: s }).eq("id", id);
    setRelationships(prev => prev.map(r => r.id === id ? { ...r, stage: s } : r));
  }

  return (
    <div className="flex-1 overflow-auto p-6 space-y-4">

      {/* Fundraising progress */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">Fundraising Progress — Fund I</h2>
            <p className="text-xs text-slate-400 mt-0.5">{formatCurrency(totalCommitted, true)} committed of {formatCurrency(totalTarget, true)} target</p>
          </div>
          <div className="text-right">
            <span className="text-2xl font-bold text-slate-900">{Math.round(progressPct)}%</span>
            <p className="text-xs text-slate-400">funded</p>
          </div>
        </div>
        <div className="w-full bg-slate-100 rounded-full h-2.5">
          <div className="bg-blue-600 h-2.5 rounded-full transition-all duration-500" style={{ width: `${progressPct}%` }} />
        </div>
        <div className="grid grid-cols-3 gap-4 mt-4">
          <div><p className="text-xs text-slate-400">Hard Commits</p><p className="text-sm font-bold text-green-600">{formatCurrency(totalCommitted, true)}</p></div>
          <div><p className="text-xs text-slate-400">Soft Commits</p><p className="text-sm font-bold text-yellow-600">{formatCurrency(totalSoftCommit, true)}</p></div>
          <div><p className="text-xs text-slate-400">Target</p><p className="text-sm font-bold text-slate-700">{formatCurrency(totalTarget, true)}</p></div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex gap-3 items-center justify-between">
        <div className="flex gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="input pl-8 w-48 h-9" placeholder="Search LPs…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="select h-9 w-44" value={stageFilter} onChange={e => setStage(e.target.value)}>
            <option value="all">All stages</option>
            {STAGE_ORDER.map(s => <option key={s} value={s}>{LP_STAGE_LABELS[s]}</option>)}
          </select>
        </div>
        <button onClick={() => setShowModal(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg">
          <Plus size={16} /> Add LP
        </button>
      </div>

      {/* LP Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table w-full">
            <thead>
              <tr>
                <th>LP</th>
                <th>Type</th>
                <th>Stage</th>
                <th>Target Allocation</th>
                <th>Committed</th>
                <th>Next Step</th>
                <th>Next Step Date</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-slate-400">No LPs in pipeline. Add your first LP to start tracking.</td></tr>
              ) : (
                filtered.map(r => (
                  <tr key={r.id}>
                    <td>
                      <p className="font-medium text-slate-900">{r.company?.name ?? "Unknown"}</p>
                      {r.company?.location_country && <p className="text-xs text-slate-400">{r.company.location_country}</p>}
                      {r.contact && <p className="text-xs text-slate-500">{r.contact.first_name} {r.contact.last_name}</p>}
                    </td>
                    <td><span className="badge bg-purple-100 text-purple-700 capitalize">{r.company?.lp_type?.replace("_", " ") ?? "—"}</span></td>
                    <td>
                      <select
                        className={cn("text-xs px-2.5 py-1 rounded-full font-medium border-0 cursor-pointer", LP_STAGE_COLORS[r.stage ?? "target"] ?? "bg-slate-100 text-slate-600")}
                        value={r.stage ?? "target"}
                        onChange={e => updateStage(r.id, e.target.value as LpStage)}
                      >
                        {[...STAGE_ORDER, "passed" as LpStage].map(s => <option key={s} value={s}>{LP_STAGE_LABELS[s]}</option>)}
                      </select>
                    </td>
                    <td className="font-medium">{formatCurrency(r.target_allocation, true)}</td>
                    <td className="font-medium text-green-700">{formatCurrency(r.committed_amount, true)}</td>
                    <td className="text-slate-600 text-xs max-w-[160px] truncate">{r.next_step ?? "—"}</td>
                    <td className="text-slate-400 text-xs">{r.next_step_date ? formatDate(r.next_step_date) : "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add LP Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => { setShowModal(false); resetModal(); }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h2 className="text-base font-semibold text-slate-900">Add LP to Pipeline</h2>
              <button onClick={() => { setShowModal(false); resetModal(); }} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
            </div>

            {/* Mode toggle */}
            <div className="px-6 pt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setMode("new")}
                className={cn("flex-1 py-2 text-xs font-medium rounded-lg border transition-colors",
                  mode === "new" ? "bg-blue-600 border-blue-600 text-white" : "border-slate-200 text-slate-600 hover:bg-slate-50")}
              >
                Create New LP
              </button>
              <button
                type="button"
                onClick={() => setMode("existing")}
                className={cn("flex-1 py-2 text-xs font-medium rounded-lg border transition-colors",
                  mode === "existing" ? "bg-blue-600 border-blue-600 text-white" : "border-slate-200 text-slate-600 hover:bg-slate-50")}
              >
                Link Existing LP
              </button>
            </div>

            <form onSubmit={handleSave} className="px-6 py-5 space-y-5">

              {/* ── LP Company fields ── */}
              {mode === "new" ? (
                <div className="space-y-4">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">LP Company</p>

                  {/* Name + Logo preview */}
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-center flex-shrink-0 overflow-hidden">
                      {logoSrc && !imgError ? (
                        <img src={logoSrc} alt="" onError={() => setImgError(true)} className="w-8 h-8 object-contain" />
                      ) : (
                        <Building2 size={18} className="text-slate-300" />
                      )}
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-slate-600 mb-1">LP Name *</label>
                      <input
                        required
                        className="input"
                        placeholder="e.g. Temasek Holdings"
                        value={lpName}
                        onChange={e => setLpName(e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Website */}
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Website</label>
                    <input
                      className="input"
                      placeholder="temasek.com.sg"
                      value={lpWebsite}
                      onChange={e => { setLpWebsite(e.target.value); setImgError(false); }}
                    />
                    {logoDomain && !imgError && (
                      <p className="text-[10px] text-slate-400 mt-1">Logo auto-loaded from {logoDomain}</p>
                    )}
                  </div>

                  {/* LP Type + Stage */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">LP Type</label>
                      <select className="select" value={lpType} onChange={e => setLpType(e.target.value)}>
                        <option value="">— Select type —</option>
                        {LP_TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Stage</label>
                      <select className="select" value={stage} onChange={e => setStage2(e.target.value as LpStage)}>
                        {STAGE_ORDER.map(s => <option key={s} value={s}>{LP_STAGE_LABELS[s]}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* City + Country */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">City</label>
                      <input
                        className="input"
                        placeholder="San Francisco"
                        value={lpCity}
                        onChange={e => setLpCity(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Country</label>
                      <input
                        className="input"
                        placeholder="USA"
                        value={lpCountry}
                        onChange={e => setLpCountry(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">LP Company</p>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Select Existing LP *</label>
                  <select required className="select" value={existingId} onChange={e => setExistingId(e.target.value)}>
                    <option value="">Select LP…</option>
                    {lpCompanies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <div className="mt-3">
                    <label className="block text-xs font-medium text-slate-600 mb-1">Stage</label>
                    <select className="select" value={stage} onChange={e => setStage2(e.target.value as LpStage)}>
                      {STAGE_ORDER.map(s => <option key={s} value={s}>{LP_STAGE_LABELS[s]}</option>)}
                    </select>
                  </div>
                </div>
              )}

              {/* ── Relationship fields ── */}
              <div className="space-y-3 pt-1 border-t border-slate-100">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pt-1">Relationship</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Fund Vehicle</label>
                    <input className="input" placeholder="Fund I" value={fundVehicle} onChange={e => setFundVehicle(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Target Allocation ($)</label>
                    <input className="input" type="number" placeholder="500,000" value={targetAlloc} onChange={e => setTargetAlloc(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Committed Amount ($)</label>
                    <input className="input" type="number" placeholder="0" value={committed} onChange={e => setCommitted(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Next Step Date</label>
                    <input className="input" type="date" value={nextStepDate} onChange={e => setNextStepDate(e.target.value)} />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-slate-600 mb-1">Next Step</label>
                    <input className="input" placeholder="e.g. Send deck, Follow up call" value={nextStep} onChange={e => setNextStep(e.target.value)} />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
                    <textarea className="textarea" rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
                  </div>
                </div>
              </div>

              {/* ── Add Contact section ── */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowContact(v => !v)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
                >
                  <span className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                    <UserPlus size={13} />
                    Add Contact (optional)
                  </span>
                  {showContact ? <ChevronUp size={13} className="text-slate-400" /> : <ChevronDown size={13} className="text-slate-400" />}
                </button>
                {showContact && (
                  <div className="p-4 grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">First Name</label>
                      <input className="input" placeholder="Jane" value={contactFirst} onChange={e => setContactFirst(e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Last Name</label>
                      <input className="input" placeholder="Smith" value={contactLast} onChange={e => setContactLast(e.target.value)} />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-slate-600 mb-1">Email</label>
                      <input className="input" type="email" placeholder="jane@lp.com" value={contactEmail} onChange={e => setContactEmail(e.target.value)} />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-slate-600 mb-1">Title</label>
                      <input className="input" placeholder="Managing Director" value={contactTitle} onChange={e => setContactTitle(e.target.value)} />
                    </div>
                    <p className="col-span-2 text-[10px] text-slate-400">Contact will be saved to the CRM and linked to this LP.</p>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => { setShowModal(false); resetModal(); }} className="flex-1 py-2.5 border border-slate-300 text-slate-700 text-sm rounded-lg hover:bg-slate-50">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg disabled:opacity-50 font-medium">
                  {saving ? "Saving…" : "Add LP"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
