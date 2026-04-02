// ─── MeetingTranscripts — shared component ───────────────────────────────────
// Fetches meeting transcript PDFs from company_documents and displays them
// with Download + "View in Fireflies" buttons.
// Used in: pipeline, funds, LP, strategic views.

"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { FileText, Download, ExternalLink, ChevronRight } from "lucide-react";

interface MeetingDoc {
  id: string;
  file_name: string;
  uploaded_at: string;
  fireflies_url: string | null;
}

interface Props {
  companyId: string | null | undefined;
}

export function MeetingTranscripts({ companyId }: Props) {
  const supabase = createClient();
  const [docs, setDocs] = useState<MeetingDoc[]>([]);

  const load = useCallback(async (id: string) => {
    const { data } = await supabase
      .from("company_documents" as "documents")
      .select("id, file_name, uploaded_at, fireflies_url")
      .eq("company_id", id)
      .eq("document_type", "meeting_transcript")
      .order("uploaded_at", { ascending: false });
    setDocs((data ?? []) as unknown as MeetingDoc[]);
  }, [supabase]);

  useEffect(() => {
    if (companyId) {
      setDocs([]);
      load(companyId);
    } else {
      setDocs([]);
    }
  }, [companyId, load]);

  if (!companyId) return null;

  return (
    <section>
      <details className="group">
        <summary className="flex items-center justify-between cursor-pointer list-none pb-3">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
            Meeting Transcripts
            {docs.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 bg-teal-100 text-teal-700 rounded-full font-medium">
                {docs.length}
              </span>
            )}
          </h2>
          <ChevronRight size={13} className="text-slate-400 group-open:rotate-90 transition-transform" />
        </summary>

        <div className="space-y-1.5 pb-2">
          {docs.length === 0 ? (
            <p className="text-xs text-slate-300 italic">
              No meeting transcripts yet. Synced meetings with a resolved company are saved automatically.
            </p>
          ) : (
            docs.map(doc => (
              <div
                key={doc.id}
                className="flex items-center gap-2.5 px-3 py-2.5 bg-slate-50 rounded-lg border border-slate-200 hover:bg-white transition-colors"
              >
                <FileText size={13} className="text-teal-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-slate-800 truncate">{doc.file_name}</p>
                  <p className="text-[10px] text-slate-400">
                    {new Date(doc.uploaded_at).toLocaleDateString("en-US", {
                      month: "short", day: "numeric", year: "numeric",
                    })}
                  </p>
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
            ))
          )}
        </div>
      </details>
    </section>
  );
}
