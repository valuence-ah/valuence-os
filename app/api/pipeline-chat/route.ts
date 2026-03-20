// ─── Pipeline Chat API /api/pipeline-chat ─────────────────────────────────────
// A pipeline-focused Claude endpoint. Pulls all startups + linked contacts,
// groups by deal stage, and gives Claude a rich deal-flow context.

import { createAnthropic } from "@ai-sdk/anthropic";
import { streamText } from "ai";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 45;

const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

// Typed rows
type StartupRow = {
  id: string;
  name: string;
  deal_status: string | null;
  sectors: string[] | null;
  sub_type: string | null;
  stage: string | null;
  description: string | null;
  location_city: string | null;
  location_country: string | null;
  funding_raised: number | null;
  website: string | null;
  first_contact_date: string | null;
  last_contact_date: string | null;
  notes: string | null;
  tags: string[] | null;
  source: string | null;
  updated_at: string;
};

type ContactRow = {
  first_name: string;
  last_name: string;
  title: string | null;
  email: string | null;
  last_contact_date: string | null;
  company_id: string;
};

type DealRow = {
  stage: string;
  instrument: string | null;
  investment_amount: number | null;
  valuation_cap: number | null;
  discount_pct: number | null;
  close_date: string | null;
  notes: string | null;
  company_id: string;
};

export async function POST(req: Request) {
  const { messages } = await req.json();
  // Auth check via the regular (anon) server client
  const { createClient: createServerClient } = await import("@/lib/supabase/server");
  const authClient = await createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const supabase = createAdminClient();

  // ── Fetch all pipeline data in parallel ───────────────────────────────────
  const [
    { data: startups },
    { data: contacts },
    { data: deals },
  ] = await Promise.all([
    supabase
      .from("companies")
      .select("id, name, deal_status, sectors, sub_type, stage, description, location_city, location_country, funding_raised, website, first_contact_date, last_contact_date, notes, tags, source, updated_at")
      .eq("type", "startup")
      .order("updated_at", { ascending: false })
      .limit(10000) as unknown as Promise<{ data: StartupRow[] | null; error: unknown }>,

    supabase
      .from("contacts")
      .select("first_name, last_name, title, email, last_contact_date, company_id")
      .order("last_contact_date", { ascending: false })
      .limit(10000) as unknown as Promise<{ data: ContactRow[] | null; error: unknown }>,

    supabase
      .from("deals")
      .select("stage, instrument, investment_amount, valuation_cap, discount_pct, close_date, notes, company_id")
      .order("created_at", { ascending: false })
      .limit(10000) as unknown as Promise<{ data: DealRow[] | null; error: unknown }>,
  ]);

  // ── Index contacts and deals by company_id ────────────────────────────────
  const contactsByCompany = new Map<string, ContactRow[]>();
  contacts?.forEach(c => {
    const arr = contactsByCompany.get(c.company_id) ?? [];
    arr.push(c);
    contactsByCompany.set(c.company_id, arr);
  });

  const dealsByCompany = new Map<string, DealRow[]>();
  deals?.forEach(d => {
    const arr = dealsByCompany.get(d.company_id) ?? [];
    arr.push(d);
    dealsByCompany.set(d.company_id, arr);
  });

  // ── Group startups by deal stage ──────────────────────────────────────────
  const groups: Record<string, StartupRow[]> = {
    portfolio: [],
    active_deal: [],
    monitoring: [],
    sourced: [],
    passed: [],
    other: [],
  };

  startups?.forEach(s => {
    const key = s.deal_status ?? "other";
    (groups[key] ?? groups["other"]).push(s);
  });

  const fmt = (n: number | null) =>
    n == null ? "—" : n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : `$${(n / 1_000).toFixed(0)}K`;

  const renderStartup = (s: StartupRow) => {
    const loc = [s.location_city, s.location_country].filter(Boolean).join(", ") || "—";
    const sector = [...(s.sectors ?? []), s.sub_type].filter(Boolean).join(" / ") || "—";
    const keyPeople = contactsByCompany.get(s.id)
      ?.slice(0, 3)
      .map(c => `${c.first_name} ${c.last_name}${c.title ? ` (${c.title})` : ""}`)
      .join(", ") ?? "—";
    const deal = dealsByCompany.get(s.id)?.[0];
    const dealLine = deal
      ? ` | Deal: ${deal.stage} via ${deal.instrument?.toUpperCase() ?? "—"} @ ${fmt(deal.valuation_cap)} cap`
      : "";
    const lastContact = s.last_contact_date
      ? new Date(s.last_contact_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
      : "never";

    return [
      `  • ${s.name} | ${sector} | ${loc}`,
      `    Stage: ${s.stage ?? "—"} | Status: ${s.deal_status ?? "—"} | Last contact: ${lastContact}${dealLine}`,
      `    Raised: ${fmt(s.funding_raised)} | People: ${keyPeople}`,
      s.description ? `    Desc: ${s.description.slice(0, 160)}${s.description.length > 160 ? "…" : ""}` : "",
      s.notes ? `    Notes: ${s.notes.slice(0, 120)}${s.notes.length > 120 ? "…" : ""}` : "",
    ].filter(Boolean).join("\n");
  };

  const sectionHeader = (label: string, items: StartupRow[]) =>
    items.length === 0 ? "" :
    `\n── ${label.toUpperCase()} (${items.length}) ──────────────────────────────────\n` +
    items.map(renderStartup).join("\n\n");

  const pipelineContext = `
VALUENCE VENTURES — DEAL PIPELINE SNAPSHOT
Generated: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
Total startups tracked: ${startups?.length ?? 0}
${sectionHeader("Portfolio", groups.portfolio)}
${sectionHeader("Active Deals (IC Memo / Due Diligence / Discussions)", groups.active_deal)}
${sectionHeader("Monitoring / Tracking", groups.monitoring)}
${sectionHeader("Sourced / Introduced", groups.sourced)}
${sectionHeader("Passed", groups.passed)}
${groups.other.length > 0 ? sectionHeader("Other / Unclassified", groups.other) : ""}
`.trim();

  // ── System prompt ─────────────────────────────────────────────────────────
  const systemPrompt = `You are the Valuence AI Assistant — an expert venture capital analyst embedded directly in the Valuence Ventures deal pipeline.

Valuence Ventures is an early-stage deeptech fund focused on cleantech, techbio, and advanced materials. We invest at pre-seed and seed.

You have full read access to the live deal pipeline data below. Use it to give sharp, specific, and actionable answers. Always cite company names, stages, sectors, and data points from the context.

${pipelineContext}

GUIDELINES:
- Be concise and direct — this is a fast-moving VC environment
- Format responses with bullet points and headers where useful
- For follow-up recommendations, consider recency of last contact and deal stage
- If asked to draft outreach, write crisp VC-style emails
- Flag any companies that appear overdue for contact (last contact > 60 days + active stage)
- Never invent data that isn't in the context above
- Speak like a sharp senior VC analyst / investment partner`;

  const result = streamText({
    model: anthropic("claude-sonnet-4-6"),
    system: systemPrompt,
    messages,
    temperature: 0.25,
    maxTokens: 2048,
  });

  return result.toDataStreamResponse();
}
