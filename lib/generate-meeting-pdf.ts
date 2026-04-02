// ─── Client-side Meeting PDF Generator ──────────────────────────────────────
// Uses jsPDF (browser) to produce a formatted meeting summary PDF.
// Returns a Blob suitable for download or upload to Supabase Storage.

import type { Interaction } from "@/lib/types";

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

function formatDateShort(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return iso.slice(0, 10);
  }
}

export async function generateMeetingPDF(
  meeting: Interaction & { company?: { name: string } | null }
): Promise<Blob> {
  const { jsPDF } = await import("jspdf");

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const pageW    = doc.internal.pageSize.getWidth();
  const margin   = 20;
  const contentW = pageW - margin * 2;
  let y = margin;

  const TEAL  = [0, 128, 128] as [number, number, number];
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
