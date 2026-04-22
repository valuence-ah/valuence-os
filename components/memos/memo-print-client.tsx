"use client";
// ─── Memo Print Client ────────────────────────────────────────────────────────
// Renders the full IC memo with every section expanded.
// Auto-triggers window.print() on mount so the user just gets a save-PDF dialog.
// Lives at /print/memos/[id] — no sidebar, no navigation.

import { useEffect } from "react";
import type { IcMemo } from "@/lib/types";

// ── Section keys + labels (same order as memo-detail-client) ──────────────────
const SECTIONS = [
  { key: "company_overview",      label: "Company Overview"                      },
  { key: "problem_statement",     label: "Problem Statement"                     },
  { key: "technology",            label: "Technology Deep Dive"                  },
  { key: "industry_sector",       label: "Industry and Sector Analysis"          },
  { key: "competitive_analysis",  label: "Competitive Analysis"                  },
  { key: "team",                  label: "Team"                                  },
  { key: "path_success",          label: "Path to Success"                       },
  { key: "exit_analysis",         label: "Exit Analysis"                         },
  { key: "risks_mitigation",      label: "Key Risks and Mitigation Strategies"   },
  { key: "financials",            label: "Financials"                            },
  { key: "go_right",              label: "What Can Go Massively Right"           },
  { key: "top_reasons_invest",    label: "Strong Rationale for Investing"        },
  { key: "top_reasons_pass",      label: "Strong Rationale for NOT Investing"    },
  { key: "evaluation_score",      label: "Tech Evaluation and Scores"            },
] as const;

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

function getSectionContent(memo: MemoWithCompany, key: string): string {
  if (key in memo && memo[key as keyof typeof memo]) {
    return String(memo[key as keyof typeof memo] ?? "");
  }
  const fallback: Record<string, string> = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    company_overview:    (memo as any).executive_summary  ?? "",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    problem_statement:   (memo as any).problem_solution   ?? "",
    technology:          "",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    industry_sector:     (memo as any).market_opportunity ?? "",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    competitive_analysis:(memo as any).competition        ?? "",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    team:                (memo as any).team               ?? "",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    path_success:        [(memo as any).business_model, (memo as any).traction].filter(Boolean).join("\n\n"),
    exit_analysis:       "",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    risks_mitigation:    (memo as any).risks              ?? "",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    financials:          (memo as any).financials         ?? "",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    go_right:            (memo as any).investment_thesis  ?? "",
    top_reasons_invest:  "",
    top_reasons_pass:    "",
    evaluation_score:    "",
  };
  return fallback[key] ?? "";
}

// Render evaluation_score as a score card if it's a JSON array
function EvalScoreContent({ content }: { content: string }) {
  let scores: Array<{ dimension: string; score: number; rationale: string }> | null = null;
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) scores = parsed;
  } catch { /* render as text */ }

  if (scores) {
    return (
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
        <thead>
          <tr style={{ background: "#f8fafc" }}>
            <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid #e2e8f0" }}>Dimension</th>
            <th style={{ textAlign: "center", padding: "6px 8px", borderBottom: "1px solid #e2e8f0", width: 60 }}>Score</th>
            <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid #e2e8f0" }}>Rationale</th>
          </tr>
        </thead>
        <tbody>
          {scores.map(s => (
            <tr key={s.dimension}>
              <td style={{ padding: "5px 8px", borderBottom: "1px solid #f1f5f9", fontWeight: 500 }}>{s.dimension}</td>
              <td style={{
                padding: "5px 8px", borderBottom: "1px solid #f1f5f9", textAlign: "center", fontWeight: 700,
                color: s.score >= 8 ? "#065f46" : s.score >= 5 ? "#92400e" : "#991b1b",
              }}>{s.score}/10</td>
              <td style={{ padding: "5px 8px", borderBottom: "1px solid #f1f5f9", color: "#475569" }}>{s.rationale}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{content}</p>;
}

const REC_LABELS: Record<string, { label: string; color: string }> = {
  invest:         { label: "INVEST",          color: "#065f46" },
  pass:           { label: "PASS",            color: "#991b1b" },
  more_diligence: { label: "MORE DILIGENCE",  color: "#92400e" },
  pending:        { label: "PENDING",         color: "#475569" },
};

export function MemoPrintClient({ memo }: { memo: MemoWithCompany }) {
  useEffect(() => {
    // Small delay so the browser finishes rendering before the print dialog opens
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, []);

  const rec = REC_LABELS[memo.recommendation ?? "pending"] ?? REC_LABELS.pending;
  const createdDate = memo.created_at
    ? new Date(memo.created_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
    : "";

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');

        * { box-sizing: border-box; margin: 0; padding: 0; }

        body {
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 12px;
          line-height: 1.6;
          color: #1e293b;
          background: white;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        .memo-container {
          max-width: 820px;
          margin: 0 auto;
          padding: 40px 48px;
        }

        /* ── Cover header ── */
        .cover-header {
          border-bottom: 2px solid #0f766e;
          padding-bottom: 20px;
          margin-bottom: 28px;
        }
        .cover-title {
          font-size: 22px;
          font-weight: 700;
          color: #0f172a;
          margin-bottom: 6px;
          line-height: 1.3;
        }
        .cover-meta {
          display: flex;
          align-items: center;
          gap: 16px;
          flex-wrap: wrap;
          margin-top: 8px;
        }
        .cover-company {
          font-size: 13px;
          font-weight: 600;
          color: #0f766e;
        }
        .cover-sectors {
          font-size: 12px;
          color: #64748b;
        }
        .cover-date {
          font-size: 11px;
          color: #94a3b8;
          margin-left: auto;
        }
        .rec-badge {
          display: inline-block;
          padding: 3px 10px;
          border-radius: 999px;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.05em;
          border: 1.5px solid currentColor;
        }

        /* ── Sections ── */
        .section {
          margin-bottom: 24px;
          page-break-inside: avoid;
        }
        .section-header {
          display: flex;
          align-items: baseline;
          gap: 10px;
          margin-bottom: 10px;
          padding-bottom: 5px;
          border-bottom: 1px solid #e2e8f0;
        }
        .section-number {
          font-size: 10px;
          font-family: monospace;
          color: #94a3b8;
          flex-shrink: 0;
          width: 18px;
        }
        .section-title {
          font-size: 13px;
          font-weight: 600;
          color: #0f172a;
        }
        .section-body {
          padding-left: 28px;
          color: #334155;
          font-size: 12px;
          line-height: 1.7;
          white-space: pre-wrap;
        }
        .section-empty {
          padding-left: 28px;
          color: #94a3b8;
          font-style: italic;
          font-size: 11px;
        }

        /* ── Review notes ── */
        .review-notes {
          margin-top: 32px;
          padding: 14px 16px;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          background: #f8fafc;
        }
        .review-notes-label {
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: #64748b;
          margin-bottom: 6px;
        }

        /* ── Footer ── */
        .print-footer {
          margin-top: 40px;
          padding-top: 14px;
          border-top: 1px solid #e2e8f0;
          display: flex;
          justify-content: space-between;
          font-size: 10px;
          color: #94a3b8;
        }

        /* ── Print-only tweaks ── */
        @media print {
          body { font-size: 11px; }
          .memo-container { padding: 0; max-width: 100%; }
          .no-print { display: none !important; }
          .section { page-break-inside: avoid; }
        }

        /* ── Screen: show a "close" button ── */
        @media screen {
          .print-toolbar {
            position: fixed;
            top: 16px;
            right: 16px;
            display: flex;
            gap: 8px;
            z-index: 999;
          }
          .print-btn {
            background: #0f766e;
            color: white;
            border: none;
            border-radius: 8px;
            padding: 8px 16px;
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            font-family: inherit;
          }
          .print-btn:hover { background: #0d6560; }
          .close-btn {
            background: #f1f5f9;
            color: #475569;
            border: none;
            border-radius: 8px;
            padding: 8px 16px;
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            font-family: inherit;
          }
          .close-btn:hover { background: #e2e8f0; }
        }
      `}</style>

      {/* Screen-only toolbar */}
      <div className="print-toolbar no-print">
        <button className="print-btn" onClick={() => window.print()}>⬇ Save as PDF</button>
        <button className="close-btn" onClick={() => window.close()}>Close</button>
      </div>

      <div className="memo-container">
        {/* Cover */}
        <div className="cover-header">
          <div className="cover-title">{memo.title}</div>
          <div className="cover-meta">
            {memo.company && (
              <span className="cover-company">{memo.company.name}</span>
            )}
            {memo.company?.sectors && (
              <span className="cover-sectors">
                {[...new Set(memo.company.sectors)].slice(0, 3).join(" · ")}
              </span>
            )}
            <span
              className="rec-badge"
              style={{ color: rec.color, borderColor: rec.color }}
            >
              {rec.label}
            </span>
            <span className="cover-date">
              {createdDate} · Confidential
            </span>
          </div>
        </div>

        {/* All 14 sections — fully expanded */}
        {SECTIONS.map(({ key, label }, index) => {
          const content = getSectionContent(memo, key);
          return (
            <div key={key} className="section">
              <div className="section-header">
                <span className="section-number">{index + 1}.</span>
                <span className="section-title">{label}</span>
              </div>
              {content ? (
                key === "evaluation_score" ? (
                  <div className="section-body" style={{ whiteSpace: "normal" }}>
                    <EvalScoreContent content={content} />
                  </div>
                ) : (
                  <div className="section-body">{content}</div>
                )
              ) : (
                <div className="section-empty">No content for this section.</div>
              )}
            </div>
          );
        })}

        {/* Review notes */}
        {memo.review_notes && (
          <div className="review-notes">
            <div className="review-notes-label">Review Notes</div>
            <div style={{ color: "#334155", whiteSpace: "pre-wrap" }}>{memo.review_notes}</div>
          </div>
        )}

        {/* Footer */}
        <div className="print-footer">
          <span>Valuence Ventures — Confidential</span>
          <span>Generated {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</span>
        </div>
      </div>
    </>
  );
}
