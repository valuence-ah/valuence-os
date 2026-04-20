// ─── MeetingTranscripts — shared component ───────────────────────────────────
// Shows meeting PDFs (from company_documents) AND meetings with AI summaries
// (from interactions). Used in: pipeline, funds, LP, strategic views.

"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { FileText, Download, ExternalLink, ChevronRight, Bot, Calendar, Clock } from "lucide-react";

interface MeetingDoc {
  id: string;
  file_name: string;
  uploaded_at: string;
  fireflies_url: string | null;
}

interface MeetingSummary {
  id: string;
  subject: string | null;
  date: string | null;
  duration_minutes: number | null;
  ai_summary: string | null;
  source: string | null;
}

interface Props {
  companyId: string | null | undefined;
}

function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
  });
}

export function MeetingTranscripts({ companyId }: Props) {
  const supabase = createClient();
  const [docs, setDocs]         = useState<MeetingDoc[]>([]);
  const [meetings, setMeetings] = useState<MeetingSummary[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = useCallback(async (id: string) => {
    // ── 1. PDF transcripts from company_documents ──────────────────────────
    const { data: docData } = await supabase
      .from("company_documents" as "documents")
      .select("id, file_name, uploaded_at, fireflies_url")
      .eq("company_id", id)
      .eq("document_type", "meeting_transcript")
      .order("uploaded_at", { ascending: false });
    setDocs((docData ?? []) as unknown as MeetingDoc[]);

    // ── 2. Meetings with AI summary from interactions ──────────────────────
    const { data: meetData } = await supabase
      .from("interactions")
      .select("id, subject, date, duration_minutes, ai_summary, source")
      .eq("company_id", id)
      .eq("type", "meeting")
      .not("ai_summary", "is", null)
      .order("date", { ascending: false })
      .limit(20);
    setMeetings((meetData ?? []) as MeetingSummary[]);
  }, [supabase]);

  useEffect(() => {
    if (companyId) { setDocs([]); setMeetings([]); load(companyId); }
    else           { setDocs([]); setMeetings([]); }
  }, [companyId, load]);

  if (!companyId) return null;

  const totalCount = docs.length + meetings.length;

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return (
    <section>
      <details className="group" open={totalCount > 0}>
        <summary className="flex items-center justify-between cursor-pointer list-none pb-3">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
            Meeting Transcripts & Summaries
            {totalCount > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 bg-teal-100 text-teal-700 rounded-full font-medium">
                {totalCount}
              </span>
            )}
          </h2>
          <ChevronRight size={13} className="text-slate-400 group-open:rotate-90 transition-transform" />
        </summary>

        <div className="space-y-1.5 pb-2">
          {totalCount === 0 ? (
            <p className="text-xs text-slate-300 italic">
              No meeting transcripts or summaries yet. Sync meetings via Fireflies or upload a transcript.
            </p>
          ) : (
            <>
              {/* ── PDF documents ── */}
              {docs.map(doc => (
                <div
                  key={doc.id}
                  className="flex items-center gap-2.5 px-3 py-2.5 bg-slate-50 rounded-lg border border-slate-200 hover:bg-white transition-colors"
                >
                  <FileText size={13} className="text-teal-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-slate-800 truncate">{doc.file_name}</p>
                    <p className="text-[10px] text-slate-400">{formatShortDate(doc.uploaded_at)}</p>
                  </div>

                  {/* Download PDF */}
                  <a
                    href={`/api/documents/${doc.id}/download`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Download PDF"
                    className="text-slate-400 hover:text-teal-600 transition-colors p-1 flex-shrink-0"
                  >
                    <Download size={13} />
                  </a>

                  {/* View in Fireflies */}
                  {doc.fireflies_url && (
                    <a
                      href={doc.fireflies_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="View in Fireflies"
                      className="text-slate-400 hover:text-orange-500 transition-colors p-1 flex-shrink-0"
                    >
                      <ExternalLink size={13} />
                    </a>
                  )}
                </div>
              ))}

              {/* ── AI-summarised meetings ── */}
              {meetings.map(m => {
                const isExpanded = expanded.has(m.id);
                // Truncate the summary for the collapsed preview
                const preview = (m.ai_summary ?? "").slice(0, 160).trimEnd();
                const isLong  = (m.ai_summary ?? "").length > 160;

                return (
                  <div
                    key={m.id}
                    className="rounded-lg border border-slate-200 bg-white overflow-hidden"
                  >
                    {/* Header row */}
                    <button
                      onClick={() => toggleExpand(m.id)}
                      className="w-full flex items-start gap-2.5 px-3 py-2.5 hover:bg-slate-50 transition-colors text-left"
                    >
                      <Bot size={13} className="text-violet-500 flex-shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-slate-800 truncate">
                          {m.subject ?? "Untitled Meeting"}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="flex items-center gap-0.5 text-[10px] text-slate-400">
                            <Calendar size={9} />
                            {formatShortDate(m.date)}
                          </span>
                          {m.duration_minutes && (
                            <span className="flex items-center gap-0.5 text-[10px] text-slate-400">
                              <Clock size={9} />
                              {m.duration_minutes}m
                            </span>
                          )}
                          <span className="text-[9px] px-1.5 py-0.5 bg-violet-50 text-violet-600 rounded-full font-medium">
                            AI Summary
                          </span>
                        </div>
                      </div>
                      <ChevronRight
                        size={12}
                        className={`text-slate-400 flex-shrink-0 mt-0.5 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                      />
                    </button>

                    {/* Expandable summary */}
                    {isExpanded && (
                      <div className="px-3 pb-3 border-t border-slate-100">
                        <div className="mt-2 text-[11px] text-slate-600 leading-relaxed whitespace-pre-wrap">
                          {m.ai_summary}
                        </div>
                        <a
                          href={`/meetings?meeting=${m.id}`}
                          className="mt-2 inline-flex items-center gap-1 text-[10px] text-teal-600 hover:text-teal-800 font-medium"
                        >
                          Open full meeting →
                        </a>
                      </div>
                    )}

                    {/* Collapsed preview (when not expanded) */}
                    {!isExpanded && preview && (
                      <div className="px-3 pb-2.5">
                        <p className="text-[10px] text-slate-400 leading-snug line-clamp-2">
                          {preview}{isLong ? "…" : ""}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>
      </details>
    </section>
  );
}
