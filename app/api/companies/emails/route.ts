// ─── Company Emails /api/companies/emails?company_id=xxx ───────────────────────
// Fetches Outlook emails involving a company's contacts via Microsoft Graph.
// Filters out trivial / automated emails.
// Returns emails with a 5-word Claude summary, date, and Outlook link.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getRecentEmails, GraphEmail } from "@/lib/microsoft-graph";
import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";

export const maxDuration = 30;

const MAILBOX = process.env.OUTLOOK_MAILBOX ?? "andrew@valuence.vc";

const SKIP_PATTERNS = [
  /no.?reply/i, /noreply/i, /do.not.reply/i,
  /automated/i, /notification/i, /newsletter/i,
  /unsubscribe/i, /calendar invite/i, /out of office/i,
  /^(accepted|declined|tentative):/i,
];

function isTrivial(email: GraphEmail): boolean {
  if (email.bodyPreview.trim().length < 120) return true;
  const combined = `${email.subject} ${email.from.emailAddress.address}`;
  return SKIP_PATTERNS.some(p => p.test(combined));
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const company_id = req.nextUrl.searchParams.get("company_id");
  if (!company_id) return NextResponse.json({ error: "company_id required" }, { status: 400 });

  // Get contact emails for this company
  const { data: contacts } = await supabase
    .from("contacts")
    .select("email")
    .eq("company_id", company_id)
    .not("email", "is", null)
    .limit(50);

  if (!contacts?.length) return NextResponse.json({ emails: [] });

  const contactEmails = new Set(
    contacts.map(c => c.email?.toLowerCase()).filter(Boolean) as string[]
  );

  // Fetch inbox + sent items from Graph
  let inbox: GraphEmail[] = [];
  let sent: GraphEmail[] = [];
  try {
    [inbox, sent] = await Promise.all([
      getRecentEmails(MAILBOX, undefined, 80, "inbox"),
      getRecentEmails(MAILBOX, undefined, 80, "sentItems"),
    ]);
  } catch (err) {
    console.error("Graph email fetch error:", err);
    return NextResponse.json({ emails: [], graphError: true });
  }

  // Merge and deduplicate by subject+date
  const seen = new Set<string>();
  const allEmails: GraphEmail[] = [];
  for (const e of [...inbox, ...sent]) {
    const key = `${e.subject}__${e.receivedDateTime}`;
    if (!seen.has(key)) { seen.add(key); allEmails.push(e); }
  }

  // Filter to emails involving this company's contacts
  const relevant = allEmails.filter(e => {
    const from = e.from.emailAddress.address.toLowerCase();
    const to = e.toRecipients.map(r => r.emailAddress.address.toLowerCase());
    return [from, ...to].some(a => contactEmails.has(a));
  });

  // Filter out trivial emails
  const substantial = relevant.filter(e => !isTrivial(e));

  if (!substantial.length) return NextResponse.json({ emails: [] });

  // Sort by date desc, take top 20
  const top = substantial
    .sort((a, b) => new Date(b.receivedDateTime).getTime() - new Date(a.receivedDateTime).getTime())
    .slice(0, 20);

  // Batch-summarize with Claude Haiku (fast + cheap)
  let summaries: Record<string, string> = {};
  try {
    const payload = top.map(e => ({
      id: e.id,
      subject: e.subject,
      preview: e.bodyPreview.slice(0, 200),
    }));

    const { text } = await generateText({
      model: anthropic("claude-haiku-4-5-20251001"),
      maxTokens: 600,
      messages: [{
        role: "user",
        content: `Summarize each email in exactly 5 words. Be factual, no filler words.\nReturn ONLY valid JSON array: [{"id":"...","summary":"..."}]\n\nEmails:\n${JSON.stringify(payload)}`,
      }],
    });

    const clean = text.trim().replace(/^```json\n?/, "").replace(/\n?```$/, "");
    const parsed = JSON.parse(clean);
    for (const item of parsed) summaries[item.id] = item.summary;
  } catch {
    // Fall back to first 5 words of subject
    for (const e of top) {
      summaries[e.id] = e.subject.split(" ").slice(0, 5).join(" ");
    }
  }

  const result = top.map(e => ({
    id: e.id,
    subject: e.subject,
    summary: summaries[e.id] ?? e.subject.split(" ").slice(0, 5).join(" "),
    from: e.from.emailAddress,
    date: e.receivedDateTime,
    webLink: e.webLink,
  }));

  return NextResponse.json({ emails: result });
}
