// ─── Meeting PDF Generator ───────────────────────────────────────────────────
// generateMeetingPDF       — browser-side (dynamic import), returns Blob
// generateMeetingPDFBuffer — server-side (dynamic import), returns Uint8Array

import type { Interaction } from "@/lib/types";
import { formatMeetingSummary } from "@/lib/format-meeting-summary";

interface ParsedNotes {
  summary: string;
  nextSteps: string[];
}

function parseAINotes(raw: string | null | undefined): ParsedNotes {
  if (!raw?.trim()) return { summary: "", nextSteps: [] };
  const nextStepsRe = /(?:\*{2}|#{1,3}\s*)?(?:next\s+steps?|action\s+items?|follow[\-\s]?ups?|to[\-\s]?dos?)(?:\*{2})?\s*:?\s*\n/im;
  const summaryHeaderRe = /(?:\*{2}|#{1,3}\s*)?(?:summary|overview|meeting\s+summary)(?:\*{2})?\s*:?\s*\n?/im;
  const nextMatch = raw.match(nextStepsRe);
  let summaryText: string;
  let nextStepsText = "";
  if (nextMatch?.index !== undefined) {
    summaryText   = raw.slice(0, nextMatch.index);
    nextStepsText = raw.slice(nextMatch.index + nextMatch[0].length);
  } else {
    summaryText = raw;
  }
  summaryText = summaryText.replace(summaryHeaderRe, "").trim();
  const nextSteps = nextStepsText
    .split("\n")
    .map(l => l.replace(/^[\s\t]*[-*•\u2022\d]+[.)]\s*/, "").trim())
    .filter(l => l.length > 3 && !/^(?:\*{2}|#{1,3})/.test(l));
  return { summary: summaryText, nextSteps };
}

function formatDateLong(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  } catch {
    return iso.slice(0, 10);
  }
}

function formatDateShort(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return iso.slice(0, 10);
  }
}

// ─── Browser-side PDF ─────────────────────────────────────────────────────────

export async function generateMeetingPDF(
  meeting: Interaction & { company?: { name: string } | null }
): Promise<Blob> {
  const { jsPDF } = await import("jspdf");

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const pageW    = doc.internal.pageSize.getWidth();
  const margin   = 20;
  const contentW = pageW - margin * 2;
  let y = margin;

  const TEAL  = [13, 148, 136] as [number, number, number];
  const DARK  = [30,  40,  55] as [number, number, number];
  const GREY  = [100, 110, 120] as [number, number, number];
  const LIGHT = [240, 242, 245] as [number, number, number];

  // ── Header bar ──────────────────────────────────────────────────────────────
  doc.setFillColor(...TEAL);
  doc.rect(0, 0, pageW, 18, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Meeting Summary", margin, 12);

  const companyName = meeting.company?.name ?? "";
  if (companyName) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    const cw = doc.getTextWidth(companyName);
    doc.text(companyName, pageW - margin - cw, 12);
  }

  y = 26;

  // ── Title ───────────────────────────────────────────────────────────────────
  doc.setTextColor(...DARK);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  const titleText = meeting.subject ?? "Untitled Meeting";
  const titleLines = doc.splitTextToSize(titleText, contentW) as string[];
  doc.text(titleLines, margin, y);
  y += titleLines.length * 7 + 3;

  // ── Meta row ────────────────────────────────────────────────────────────────
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...GREY);
  const metaParts: string[] = [formatDateShort(meeting.date)];
  if (meeting.duration_minutes) metaParts.push(`${meeting.duration_minutes} min`);
  if (meeting.source)           metaParts.push(meeting.source);
  doc.text(metaParts.join("  ·  "), margin, y);
  y += 8;

  // ── Divider ─────────────────────────────────────────────────────────────────
  doc.setDrawColor(...LIGHT);
  doc.setLineWidth(0.4);
  doc.line(margin, y, pageW - margin, y);
  y += 6;

  // Helper: section heading
  function sectionHeading(label: string) {
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...TEAL);
    doc.text(label.toUpperCase(), margin, y);
    y += 5;
    doc.setTextColor(...DARK);
  }

  // Helper: body text with line wrapping + page breaks
  function bodyText(text: string, fontSize = 9.5) {
    doc.setFontSize(fontSize);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...DARK);
    const lines = doc.splitTextToSize(text.trim(), contentW) as string[];
    for (const line of lines) {
      if (y > 270) { doc.addPage(); y = margin; }
      doc.text(line, margin, y);
      y += 5;
    }
    y += 2;
  }

  // ── AI Summary ──────────────────────────────────────────────────────────────
  const raw = meeting.ai_summary ?? meeting.summary ?? meeting.body;
  const { summary, nextSteps } = parseAINotes(raw);

  if (summary) {
    sectionHeading("Summary");
    bodyText(summary);
    y += 2;
  } else {
    sectionHeading("Summary");
    doc.setFontSize(9);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(...GREY);
    doc.text("No AI summary available for this meeting.", margin, y);
    y += 8;
  }

  // ── Attendees ───────────────────────────────────────────────────────────────
  const attendees = meeting.attendees as Array<{ name?: string; email?: string }> | null;
  if (attendees && attendees.length > 0) {
    if (y > 255) { doc.addPage(); y = margin; }
    sectionHeading("Attendees");
    for (const a of attendees) {
      const name  = a.name  ?? "";
      const email = a.email ?? "";
      const line  = name && email ? `${name} <${email}>` : name || email;
      if (line) bodyText(line, 9);
    }
    y += 2;
  }

  // ── Next Steps ──────────────────────────────────────────────────────────────
  const allNextSteps = nextSteps.length > 0 ? nextSteps : (meeting.action_items ?? []);
  if (allNextSteps.length > 0) {
    if (y > 255) { doc.addPage(); y = margin; }
    sectionHeading("Next Steps");
    for (const step of allNextSteps) {
      if (y > 270) { doc.addPage(); y = margin; }
      doc.setFontSize(9.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...DARK);
      const stepLines = doc.splitTextToSize(`• ${step}`, contentW - 4) as string[];
      doc.text(stepLines, margin + 2, y);
      y += stepLines.length * 5 + 1;
    }
  }

  // ── Footer ──────────────────────────────────────────────────────────────────
  const pageH = doc.internal.pageSize.getHeight();
  const today = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "italic");
  doc.setTextColor(...GREY);
  doc.text(`Generated by Valuence OS — ${today}`, margin, pageH - 10);

  return doc.output("blob");
}

// ─── Server-side PDF buffer ───────────────────────────────────────────────────
// Suitable for use in API routes (Node.js). Returns Uint8Array.
// Produces a rich, multi-page PDF with summary, full transcript, and keywords.

export async function generateMeetingPDFBuffer(
  meeting: Interaction,
  companyName: string,
): Promise<Uint8Array> {
  const { jsPDF } = await import("jspdf");

  const doc      = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW    = doc.internal.pageSize.getWidth();
  const pageH    = doc.internal.pageSize.getHeight();
  const margin   = 20;
  const contentW = pageW - margin * 2;
  let y = margin;

  const TEAL  = [13, 148, 136] as [number, number, number];
  const DARK  = [30,  40,  55] as [number, number, number];
  const GREY  = [100, 110, 120] as [number, number, number];
  const LIGHT = [240, 242, 245] as [number, number, number];

  const today = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const meetingTitle = meeting.subject ?? "Untitled Meeting";
  const transcriptUrl = (meeting as unknown as { transcript_url?: string | null }).transcript_url ?? null;

  // ── Footer helper (called per page) ──────────────────────────────────────────
  function renderFooter(pageNum: number, totalPages: number) {
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...GREY);
    doc.text("Confidential — Valuence Ventures", margin, pageH - 8);
    const center = `Page ${pageNum} of ${totalPages}`;
    const cw = doc.getTextWidth(center);
    doc.text(center, pageW / 2 - cw / 2, pageH - 8);
    const right = `Generated by Valuence OS — ${today}`;
    const rw = doc.getTextWidth(right);
    doc.text(right, pageW - margin - rw, pageH - 8);
  }

  // ── Page break helper ────────────────────────────────────────────────────────
  function checkPageBreak(neededH = 10) {
    if (y + neededH > pageH - 15) {
      doc.addPage();
      y = margin;
      return true;
    }
    return false;
  }

  // ── Section heading ──────────────────────────────────────────────────────────
  function heading(label: string) {
    checkPageBreak(12);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...TEAL);
    doc.text(label.toUpperCase(), margin, y);
    y += 6;
    doc.setTextColor(...DARK);
  }

  // ── Body text with wrapping ──────────────────────────────────────────────────
  function body(text: string, size = 9.5, color: [number,number,number] = DARK) {
    doc.setFontSize(size);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...color);
    const lines = doc.splitTextToSize(text.trim(), contentW) as string[];
    for (const line of lines) {
      checkPageBreak(6);
      doc.text(line, margin, y);
      y += 5;
    }
    y += 2;
  }

  // ── Bullet list ──────────────────────────────────────────────────────────────
  function bulletList(items: string[], prefix = "•") {
    for (const item of items) {
      checkPageBreak(6);
      doc.setFontSize(9.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...DARK);
      const lines = doc.splitTextToSize(`${prefix} ${item}`, contentW - 4) as string[];
      doc.text(lines, margin + 2, y);
      y += lines.length * 5 + 1;
    }
    y += 2;
  }

  // ── Numbered list ────────────────────────────────────────────────────────────
  function numberedList(items: string[]) {
    items.forEach((item, idx) => {
      checkPageBreak(6);
      doc.setFontSize(9.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...DARK);
      const lines = doc.splitTextToSize(`${idx + 1}. ${item}`, contentW - 4) as string[];
      doc.text(lines, margin + 2, y);
      y += lines.length * 5 + 1;
    });
    y += 2;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE 1 — COVER / SUMMARY
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Header bar ──────────────────────────────────────────────────────────────
  doc.setFillColor(...TEAL);
  doc.rect(0, 0, pageW, 18, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("MEETING SUMMARY", margin, 12);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  const vv = "Valuence Ventures";
  const vvW = doc.getTextWidth(vv);
  doc.text(vv, pageW - margin - vvW, 12);

  y = 26;

  // ── Meeting title ────────────────────────────────────────────────────────────
  doc.setTextColor(...DARK);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  const titleLines = doc.splitTextToSize(meetingTitle, contentW) as string[];
  doc.text(titleLines, margin, y);
  y += titleLines.length * 7 + 2;

  // ── Company name (teal) ──────────────────────────────────────────────────────
  if (companyName) {
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...TEAL);
    doc.text(`Company: ${companyName}`, margin, y);
    y += 6;
  }

  // ── Date / Duration ──────────────────────────────────────────────────────────
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...GREY);
  const dateParts: string[] = [];
  if (meeting.date) dateParts.push(`Date: ${formatDateLong(meeting.date)}`);
  if (meeting.duration_minutes) dateParts.push(`Duration: ${meeting.duration_minutes} min`);
  if (dateParts.length > 0) { doc.text(dateParts.join("  |  "), margin, y); y += 5; }

  // ── Attendees list ───────────────────────────────────────────────────────────
  const attendees = (meeting.attendees ?? []) as Array<{ name?: string; email?: string }>;
  if (attendees.length > 0) {
    const names = attendees.map(a => a.name ?? a.email ?? "").filter(Boolean).join(", ");
    const attLines = doc.splitTextToSize(`Attendees: ${names}`, contentW) as string[];
    doc.text(attLines, margin, y);
    y += attLines.length * 5 + 2;
  }
  y += 2;

  // ── Divider ─────────────────────────────────────────────────────────────────
  doc.setDrawColor(...LIGHT);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageW - margin, y);
  y += 7;

  // ── Parse structured summary ─────────────────────────────────────────────────
  const fmt = formatMeetingSummary(meeting.ai_summary ?? meeting.summary ?? meeting.body);

  // OVERVIEW
  heading("Overview");
  if (fmt.overview) {
    body(fmt.overview);
  } else if (fmt.rawFallback) {
    body(fmt.rawFallback);
  } else {
    body("Summary not available.", 9, GREY);
  }

  // KEY DISCUSSION TOPICS
  if (fmt.keyDiscussionTopics.length > 0) {
    heading("Key Discussion Topics");
    bulletList(fmt.keyDiscussionTopics);
  }

  // DECISIONS MADE
  if (fmt.decisionsMade.length > 0) {
    heading("Decisions Made");
    bulletList(fmt.decisionsMade, "✓");
  }

  // ACTION ITEMS / NEXT STEPS
  const allNextSteps = fmt.nextSteps.length > 0 ? fmt.nextSteps : (meeting.action_items ?? []);
  heading("Action Items");
  if (allNextSteps.length > 0) {
    numberedList(allNextSteps);
  } else {
    body("None recorded.", 9, GREY);
  }

  // KEYWORDS
  const keywords = (meeting as unknown as { keywords?: string | null }).keywords ?? null;
  if (keywords?.trim()) {
    heading("Keywords");
    const kws = keywords.split(",").map(k => k.trim()).filter(Boolean);
    const kwText = kws.map(k => `[${k}]`).join("  ");
    body(kwText, 9, GREY);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE 2+ — FULL TRANSCRIPT
  // ═══════════════════════════════════════════════════════════════════════════

  doc.addPage();
  y = margin;

  // Transcript page header
  function renderTranscriptHeader() {
    doc.setFontSize(8);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(...GREY);
    const hdrText = `FULL TRANSCRIPT — ${meetingTitle}`;
    doc.text(doc.splitTextToSize(hdrText, contentW)[0] as string, margin, y);
    y += 5;
    if (transcriptUrl) {
      doc.setTextColor(...TEAL);
      doc.text(transcriptUrl.slice(0, 80), margin, y);
      y += 5;
    }
    doc.setDrawColor(...LIGHT);
    doc.setLineWidth(0.3);
    doc.line(margin, y, pageW - margin, y);
    y += 6;
    doc.setTextColor(...DARK);
  }

  renderTranscriptHeader();

  const transcriptText = meeting.transcript_text ?? null;

  if (transcriptText && transcriptText.trim()) {
    const lines = transcriptText.split("\n");
    for (const line of lines) {
      if (!line.trim()) { y += 2; continue; }

      // Detect speaker prefix — "Name: text" or "SPEAKER N: text"
      const speakerMatch = line.match(/^([^:]{1,40}):\s+(.+)/);
      if (speakerMatch) {
        checkPageBreak(10);
        // If we started a new page, re-render the transcript header
        if (y === margin) renderTranscriptHeader();

        const [, speaker, text] = speakerMatch;
        // Speaker name bold
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...TEAL);
        doc.text(`${speaker}:`, margin, y);
        const speakerW = doc.getTextWidth(`${speaker}: `);
        // Inline text (same line if fits, else next line)
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...DARK);
        const availW = contentW - speakerW;
        if (availW > 30 && (text ?? "").length < 80) {
          doc.text(text, margin + speakerW, y);
          y += 5;
        } else {
          y += 5;
          const tLines = doc.splitTextToSize(text, contentW) as string[];
          for (const tl of tLines) {
            checkPageBreak(6);
            doc.text(tl, margin + 3, y);
            y += 5;
          }
        }
      } else {
        checkPageBreak(6);
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...DARK);
        const wLines = doc.splitTextToSize(line, contentW) as string[];
        for (const wl of wLines) {
          checkPageBreak(6);
          doc.text(wl, margin, y);
          y += 5;
        }
      }
    }
  } else {
    doc.setFontSize(9);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(...GREY);
    if (transcriptUrl) {
      doc.text("Full transcript available at:", margin, y);
      y += 5;
      doc.setTextColor(...TEAL);
      doc.text(transcriptUrl.slice(0, 100), margin, y);
      y += 5;
    } else {
      doc.text("Transcript not available.", margin, y);
      y += 5;
    }
  }

  // ── Footers (all pages) ───────────────────────────────────────────────────────
  const totalPages = (doc.internal as unknown as { pages: unknown[] }).pages.length - 1;
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    renderFooter(p, totalPages);
  }

  const arrayBuffer = doc.output("arraybuffer");
  return new Uint8Array(arrayBuffer);
}
