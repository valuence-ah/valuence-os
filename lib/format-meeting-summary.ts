// ─── Meeting Summary Formatter ────────────────────────────────────────────────
// Parses structured Fireflies AI summaries (markdown-style headers) into
// typed sections suitable for VC investment display.

export type FormattedSummary = {
  overview:             string | null;
  keyDiscussionTopics:  string[];
  decisionsMade:        string[];
  nextSteps:            string[];
  rawFallback:          string | null;
  hasStructure:         boolean;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Strip common markdown formatting from a string, leaving plain readable text. */
function stripMarkdown(text: string): string {
  return text
    // Remove **bold** and __bold__
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    // Remove *italic* and _italic_
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/_(.*?)_/g, "$1")
    // Remove ### headings (keep the text)
    .replace(/^#{1,6}\s+/gm, "")
    // Remove leading "- " bullet characters (keep the text)
    .replace(/^[-*•]\s+/gm, "")
    // Collapse 3+ newlines into 2
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Strip bullet/numbered prefixes, filter blank lines, and strip markdown from each item. */
function parseBullets(text: string): string[] {
  return text
    .split("\n")
    .map(l => l.replace(/^[\s\t]*[-*•\u2022]|\d+[.)]\s*/, "").trim())
    .filter(l => l.length > 2)
    .map(stripMarkdown)
    .filter(l => l.length > 0);
}

// ── Main export ───────────────────────────────────────────────────────────────

export function formatMeetingSummary(raw: string | null | undefined): FormattedSummary {
  const empty: FormattedSummary = {
    overview: null, keyDiscussionTopics: [], decisionsMade: [],
    nextSteps: [], rawFallback: null, hasStructure: false,
  };

  if (!raw?.trim()) return empty;

  // ── Step 1 — detect if the string contains markdown-style headers ──────────
  const headerRe = /^#{1,3}\s+(.+)$|^\*\*(.+)\*\*$/gm;
  const hasHeaders = headerRe.test(raw);

  if (!hasHeaders) {
    // ── Step 4 — best-effort parse for bullet-heavy text ────────────────────
    const bulletLines = raw.split("\n").filter(l =>
      /^[\s\t]*[-*•\u2022]|\d+[.)]/.test(l.trim())
    );

    if (bulletLines.length >= 3) {
      const firstBlank = raw.indexOf("\n\n");
      const overviewRaw = firstBlank > 0 ? raw.slice(0, firstBlank).trim() : null;
      const topics = bulletLines
        .map(l => l.replace(/^[\s\t]*[-*•\u2022]|\d+[.)]\s*/, "").trim())
        .filter(Boolean)
        .map(stripMarkdown)
        .filter(Boolean);
      return {
        overview: overviewRaw ? stripMarkdown(overviewRaw) : null,
        keyDiscussionTopics: topics,
        decisionsMade: [],
        nextSteps: [],
        rawFallback: null,
        hasStructure: true,
      };
    }

    // No recognisable structure — return as raw fallback
    return { ...empty, rawFallback: stripMarkdown(raw) };
  }

  // ── Step 2 — split on headers, extract section text ───────────────────────
  const result: FormattedSummary = {
    overview: null, keyDiscussionTopics: [], decisionsMade: [],
    nextSteps: [], rawFallback: null, hasStructure: true,
  };

  // Find all header positions (reset lastIndex after test())
  const hdrRe = /^#{1,3}\s+(.+)$|^\*\*(.+)\*\*$/gm;
  const matches: Array<{ header: string; matchEnd: number; matchStart: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = hdrRe.exec(raw)) !== null) {
    matches.push({
      header:     (m[1] ?? m[2]).trim(),
      matchStart: m.index,
      matchEnd:   m.index + m[0].length,
    });
  }

  // ── Step 3 — map each section to the appropriate field ────────────────────
  for (let i = 0; i < matches.length; i++) {
    const bodyStart = matches[i].matchEnd;
    const bodyEnd   = i + 1 < matches.length ? matches[i + 1].matchStart : raw.length;
    const text      = raw.slice(bodyStart, bodyEnd).trim();
    const header    = matches[i].header.toLowerCase();

    if (/overview|summary|about/i.test(header)) {
      result.overview = text ? stripMarkdown(text) : null;
    } else if (/discussion|topic|talked|covered/i.test(header)) {
      result.keyDiscussionTopics = parseBullets(text);
    } else if (/decision|agreed|conclusion/i.test(header)) {
      result.decisionsMade = parseBullets(text);
    } else if (/next.?step|action|follow.?up|todo/i.test(header)) {
      result.nextSteps = parseBullets(text);
    }
  }

  return result;
}
