"use client";
// ─── Memo Detail Client ───────────────────────────────────────────────────────
// Displays a full 14-section IC memo with collapsible sections.
// Allows editing any section inline and updating recommendation/status.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { IcMemo } from "@/lib/types";
import { formatDate, cn } from "@/lib/utils";
import { Edit3, X, RefreshCw, CheckCircle, XCircle, AlertCircle, Clock, ChevronDown, Printer } from "lucide-react";

const REC_CONFIG = {
  invest:         { label: "Invest",          color: "bg-green-100 text-green-700 border-green-200",   icon: CheckCircle },
  pass:           { label: "Pass",            color: "bg-red-100 text-red-700 border-red-200",          icon: XCircle },
  more_diligence: { label: "More Diligence",  color: "bg-yellow-100 text-yellow-700 border-yellow-200", icon: AlertCircle },
  pending:        { label: "Pending",         color: "bg-slate-100 text-slate-600 border-slate-200",    icon: Clock },
};

const SECTIONS = [
  { key: "company_overview",      label: "Company Overview",                       defaultOpen: true  },
  { key: "problem_statement",     label: "Problem Statement",                      defaultOpen: true  },
  { key: "technology",            label: "Technology Deep Dive",                   defaultOpen: true  },
  { key: "industry_sector",       label: "Industry and Sector Analysis",           defaultOpen: false },
  { key: "competitive_analysis",  label: "Competitive Analysis",                   defaultOpen: false },
  { key: "team",                  label: "Team",                                   defaultOpen: true  },
  { key: "path_success",          label: "Path to Success",                        defaultOpen: false },
  { key: "exit_analysis",         label: "Exit Analysis",                          defaultOpen: false },
  { key: "risks_mitigation",      label: "Key Risks and Mitigation Strategies",    defaultOpen: false },
  { key: "financials",            label: "Financials",                             defaultOpen: false },
  { key: "go_right",              label: "What Can Go Massively Right",            defaultOpen: false },
  { key: "top_reasons_invest",    label: "Strong Rationale for Investing",         defaultOpen: false },
  { key: "top_reasons_pass",      label: "Strong Rationale for NOT Investing",     defaultOpen: false },
  { key: "evaluation_score",      label: "Tech Evaluation and Scores",             defaultOpen: true  },
] as const;

type SectionKey = typeof SECTIONS[number]["key"];

type MemoWithCompany = IcMemo & {
  company?: {
    id: string;
    name: string;
    type: string;
    sectors: string[] | null;
    description: string | null;
    website: string | null;
  } | null;
};

// ─── getSectionContent ─────────────────────────────────────────────────────────
// Returns display content for a section key, falling back to legacy column names.
function getSectionContent(memo: MemoWithCompany, key: string): string {
  // Direct match first (new column names if they exist on the record)
  if (key in memo && memo[key as keyof typeof memo]) {
    return String(memo[key as keyof typeof memo] ?? "");
  }
  // Fallback mapping from new section keys to old column names (for legacy memos)
  const fallback: Record<string, string> = {
    company_overview:    (memo as any).executive_summary  ?? "",
    problem_statement:   (memo as any).problem_solution   ?? "",
    technology:          "",
    industry_sector:     (memo as any).market_opportunity ?? "",
    competitive_analysis:(memo as any).competition        ?? "",
    team:                (memo as any).team               ?? "",
    path_success:        [(memo as any).business_model, (memo as any).traction].filter(Boolean).join("\n\n"),
    exit_analysis:       "",
    risks_mitigation:    (memo as any).risks              ?? "",
    financials:          (memo as any).financials         ?? "",
    go_right:            (memo as any).investment_thesis  ?? "",
    top_reasons_invest:  "",
    top_reasons_pass:    "",
    evaluation_score:    "",
  };
  return fallback[key] ?? "";
}

// ─── MemoContent ──────────────────────────────────────────────────────────────
// Renders memo text with proper paragraph spacing.
// Splits on double-newline for paragraphs, preserves single-newline line breaks.
function MemoContent({ text }: { text: string }) {
  const paragraphs = text.split(/\n{2,}/);
  return (
    <div className="space-y-3 text-sm text-gray-700 leading-relaxed">
      {paragraphs.map((para, i) => (
        <p key={i} className="whitespace-pre-wrap">{para.trim()}</p>
      ))}
    </div>
  );
}

// ─── TechScoreCard ─────────────────────────────────────────────────────────────
// Renders a visual score card if content is JSON array of {dimension, score, rationale}.
// Otherwise renders plain text.
function TechScoreCard({ content }: { content: string }) {
  let scores: Array<{ dimension: string; score: number; rationale: string }> | null = null;
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) scores = parsed;
  } catch { /* render as text */ }

  if (scores) {
    return (
      <div className="grid grid-cols-2 gap-3">
        {scores.map(s => (
          <div key={s.dimension} className="flex items-center gap-3 py-2 border-b border-gray-50">
            <div className="flex-1">
              <p className="text-xs font-medium text-gray-700">{s.dimension}</p>
              {s.rationale && (
                <p className="text-[11px] text-gray-500 mt-0.5">{s.rationale}</p>
              )}
            </div>
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                s.score >= 8
                  ? "bg-emerald-50 text-emerald-700"
                  : s.score >= 5
                  ? "bg-amber-50 text-amber-700"
                  : "bg-red-50 text-red-700"
              }`}
            >
              {s.score}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <p className="whitespace-pre-wrap text-sm text-gray-700 leading-relaxed">
      {content}
    </p>
  );
}

// ─── MemoSection ──────────────────────────────────────────────────────────────
// A collapsible section with a numbered header and hover-reveal edit pencil.
function MemoSection({
  number,
  title,
  children,
  defaultOpen = true,
  sectionKey,
  onEdit,
  forceOpen = false,
}: {
  number: number;
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  sectionKey: string;
  onEdit: (key: string) => void;
  forceOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [hovered, setHovered] = useState(false);
  const isOpen = forceOpen || open;

  return (
    <section className="border-b border-gray-100 py-4">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 text-left"
      >
        <span className="text-xs font-mono text-gray-400 w-5 flex-shrink-0">{number}.</span>
        <h2 className="text-sm font-semibold text-gray-900 flex-1">{title}</h2>
        <ChevronDown
          size={14}
          className={`text-gray-400 transition-transform flex-shrink-0 ${isOpen ? "rotate-180" : ""}`}
        />
      </button>
      {isOpen && (
        <div
          className="memo-section-body mt-3 ml-8 text-sm text-gray-700 leading-relaxed relative group"
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          {children}
          {hovered && !forceOpen && (
            <button
              onClick={() => onEdit(sectionKey)}
              className="absolute top-0 right-0 text-gray-300 hover:text-blue-500 p-1 rounded transition-colors"
              title={`Edit ${title}`}
            >
              <Edit3 size={13} />
            </button>
          )}
        </div>
      )}
    </section>
  );
}

// ─── MemoDetailClient ─────────────────────────────────────────────────────────
export function MemoDetailClient({ memo: initMemo }: { memo: MemoWithCompany }) {
  const supabase = createClient();
  const router   = useRouter();

  const [memo, setMemo]          = useState(initMemo);
  const [editingKey, setEditing] = useState<string | null>(null);
  const [editText, setEditText]  = useState("");
  const [saving, setSaving]      = useState(false);
  const [regenerating, setRegen] = useState(false);
  const [regenError, setRegenError] = useState<string | null>(null);

  function handleExportPdf() {
    window.open(`/print/memos/${memo.id}`, "_blank");
  }

  async function handleRegenerate() {
    if (!memo.company_id) return;
    setRegen(true);
    setRegenError(null);
    try {
      const res = await fetch("/api/memos/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: memo.company_id }),
      });
      // Guard: Vercel may return an HTML 504 page — parse defensively
      let json: Record<string, unknown> = {};
      try { json = await res.json(); } catch {
        setRegenError(res.status === 504
          ? "Generation timed out — try again (memo generation can take up to 60 s)"
          : `Server returned an unexpected response (${res.status})`);
        return;
      }
      if (!res.ok || json.error) {
        setRegenError((json.error as string) ?? `Server error ${res.status}`);
        return;
      }
      if ((json.data as { id?: string })?.id) router.push(`/memos/${(json.data as { id: string }).id}`);
    } catch (err) {
      setRegenError(err instanceof Error ? err.message : "Network error");
    } finally {
      setRegen(false);
    }
  }

  function startEdit(key: string) {
    const currentValue = getSectionContent(memo, key);
    setEditing(key);
    setEditText(currentValue);
  }

  async function saveEdit() {
    if (!editingKey) return;
    setSaving(true);
    // Determine which DB column to write to.
    // If the key exists directly on the memo record, use it.
    // Otherwise fall through to the legacy column name.
    const dbColumn = editingKey in memo ? editingKey : editingKey;
    const { data } = await supabase
      .from("ic_memos")
      .update({ [dbColumn]: editText })
      .eq("id", memo.id)
      .select()
      .single();
    setSaving(false);
    if (data) setMemo(prev => ({ ...prev, [editingKey]: editText }));
    setEditing(null);
  }

  async function updateStatus(field: "recommendation" | "status", value: string) {
    await supabase.from("ic_memos").update({ [field]: value }).eq("id", memo.id);
    setMemo(prev => ({ ...prev, [field]: value } as MemoWithCompany));
  }

  const recConfig = REC_CONFIG[memo.recommendation as keyof typeof REC_CONFIG] ?? REC_CONFIG.pending;

  return (
    <div className="memo-print-root flex-1 overflow-auto p-4 md:p-6">
      <div className="memo-print-content max-w-4xl mx-auto space-y-6">

        {/* ── Header ────────────────────────────────────────────────────────── */}
        <div className="card p-4 md:p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-xl font-bold text-slate-900">{memo.title}</h1>
              {memo.company && (
                <div className="flex items-center gap-2 mt-1">
                  <a
                    href={`/crm/companies/${memo.company.id}`}
                    className="text-sm text-blue-600 hover:underline"
                  >
                    {memo.company.name}
                  </a>
                  {memo.company.sectors && (
                    <span className="text-slate-400 text-sm">
                      · {[...new Set(memo.company.sectors)].slice(0, 2).join(" · ")}
                    </span>
                  )}
                </div>
              )}
              <p className="text-xs text-slate-400 mt-1">
                Created {formatDate(memo.created_at)}
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Recommendation badge/selector */}
              <select
                className={cn(
                  "h-[30px] text-xs font-medium px-3 rounded-xl border cursor-pointer",
                  recConfig.color
                )}
                value={memo.recommendation ?? "pending"}
                onChange={e => updateStatus("recommendation", e.target.value)}
              >
                {Object.entries(REC_CONFIG).map(([key, cfg]) => (
                  <option key={key} value={key}>{cfg.label}</option>
                ))}
              </select>

              {/* Status selector */}
              <select
                className="h-[30px] text-xs font-medium px-3 rounded-xl border border-slate-300 bg-white text-slate-700 cursor-pointer"
                value={memo.status}
                onChange={e => updateStatus("status", e.target.value)}
              >
                <option value="draft">Draft</option>
                <option value="in_review">In Review</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>

              {/* Export PDF */}
              <button
                onClick={handleExportPdf}
                className="h-[30px] flex items-center gap-1.5 px-3 text-xs font-medium rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
                title="Export memo as PDF"
              >
                <Printer size={12} />
                Export PDF
              </button>

              {/* Regenerate */}
              <button
                onClick={handleRegenerate}
                disabled={regenerating}
                className="no-print h-[30px] flex items-center gap-1.5 px-3 text-xs font-medium rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
                title="Regenerate memo with latest company data"
              >
                <RefreshCw size={12} className={regenerating ? "animate-spin" : ""} />
                {regenerating ? "Regenerating…" : "Regenerate"}
              </button>
            </div>
          </div>
        </div>

        {/* ── Regenerate error banner ──────────────────────────────────────── */}
        {regenError && (
          <div className="flex items-center justify-between gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
            <span>⚠ Regeneration failed: {regenError}</span>
            <button onClick={() => setRegenError(null)} className="text-red-400 hover:text-red-600 font-medium">Dismiss</button>
          </div>
        )}

        {/* ── 14 Collapsible Sections ───────────────────────────────────────── */}
        <div className="card px-6 py-2">
          {SECTIONS.map(({ key, label, defaultOpen }, index) => {
            const isEditing = editingKey === key;
            const content   = getSectionContent(memo, key);

            if (isEditing) {
              return (
                <section key={key} className="border-b border-gray-100 py-4">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-xs font-mono text-gray-400 w-5 flex-shrink-0">
                      {index + 1}.
                    </span>
                    <h2 className="text-sm font-semibold text-gray-900 flex-1">{label}</h2>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setEditing(null)}
                        className="text-slate-400 hover:text-slate-600 p-1"
                      >
                        <X size={14} />
                      </button>
                      <button
                        onClick={saveEdit}
                        disabled={saving}
                        className="text-blue-600 hover:text-blue-700 text-xs font-medium px-2 py-1 rounded"
                      >
                        {saving ? "Saving…" : "Save"}
                      </button>
                    </div>
                  </div>
                  <div className="ml-8">
                    <textarea
                      className="textarea w-full"
                      rows={8}
                      value={editText}
                      onChange={e => setEditText(e.target.value)}
                      autoFocus
                    />
                  </div>
                </section>
              );
            }

            return (
              <MemoSection
                key={key}
                number={index + 1}
                title={label}
                defaultOpen={defaultOpen}
                sectionKey={key}
                onEdit={startEdit}
              >
                {content ? (
                  key === "evaluation_score" ? (
                    <TechScoreCard content={content} />
                  ) : (
                    <MemoContent text={content} />
                  )
                ) : (
                  <span className="text-gray-400 italic text-sm">
                    Not yet written. Hover and click the pencil to add content, or regenerate the memo.
                  </span>
                )}
              </MemoSection>
            );
          })}
        </div>

        {/* ── Review Notes ─────────────────────────────────────────────────── */}
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Review Notes</h3>
          {editingKey === "review_notes" ? (
            <div className="space-y-2">
              <textarea
                className="textarea w-full"
                rows={3}
                value={editText}
                onChange={e => setEditText(e.target.value)}
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setEditing(null)}
                  className="text-slate-400 text-xs"
                >
                  Cancel
                </button>
                <button
                  onClick={saveEdit}
                  disabled={saving}
                  className="text-blue-600 text-xs font-medium"
                >
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm text-slate-600 whitespace-pre-wrap flex-1">
                {memo.review_notes || (
                  <span className="text-slate-400 italic">No review notes yet.</span>
                )}
              </p>
              <button
                onClick={() => {
                  setEditing("review_notes");
                  setEditText(memo.review_notes ?? "");
                }}
                className="text-slate-400 hover:text-blue-600 p-1 flex-shrink-0"
              >
                <Edit3 size={14} />
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
