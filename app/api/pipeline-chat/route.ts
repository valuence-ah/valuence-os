// ─── Pipeline Chat API /api/pipeline-chat ─────────────────────────────────────
// Comprehensive VC intelligence endpoint — pipeline, LPs, strategics, documents.
// Reads model/temperature/system_prompt from ai_configs (pipeline_assistant).

import { createAnthropic } from "@ai-sdk/anthropic";
import { streamText } from "ai";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 60;

const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

// ── Types ──────────────────────────────────────────────────────────────────────

type StartupRow = {
  id: string; name: string; deal_status: string | null; sectors: string[] | null;
  sub_type: string | null; stage: string | null; description: string | null;
  location_city: string | null; location_country: string | null;
  funding_raised: number | null; website: string | null;
  first_contact_date: string | null; last_contact_date: string | null;
  notes: string | null; tags: string[] | null; source: string | null;
  updated_at: string; drive_folder_url: string | null; priority: string | null;
};

type LpRow = {
  id: string; name: string; lp_type: string | null; aum: number | null;
  fund_focus: string | null; lp_stage: string | null;
  commitment_goal: number | null; last_contact_date: string | null;
  last_meeting_date: string | null; website: string | null;
  location_country: string | null; description: string | null; notes: string | null;
};

type StrategicRow = {
  id: string; name: string; sectors: string[] | null; description: string | null;
  last_contact_date: string | null; website: string | null; notes: string | null;
  location_country: string | null;
};

type ContactRow = {
  first_name: string; last_name: string; title: string | null;
  email: string | null; last_contact_date: string | null; company_id: string;
};

type DealRow = {
  stage: string; instrument: string | null; investment_amount: number | null;
  valuation_cap: number | null; discount_pct: number | null;
  close_date: string | null; notes: string | null; company_id: string;
};

type LpRelRow = {
  stage: string | null; target_allocation: number | null;
  committed_amount: number | null; called_amount: number | null;
  fund_vehicle: string | null; notes: string | null; company_id: string;
};

type DocumentRow = {
  company_id: string; name: string; type: string;
  extracted_text: string | null; created_at: string;
};

type InteractionRow = {
  company_id: string; type: string; date: string;
  summary: string | null; notes: string | null;
};

type AiConfigRow = {
  model: string; max_tokens: number; temperature: number;
  system_prompt: string | null; user_prompt: string;
};

export async function POST(req: Request) {
  const { messages } = await req.json();
  const { createClient: createServerClient } = await import("@/lib/supabase/server");
  const authClient = await createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const supabase = createAdminClient();

  // ── Fetch all data in parallel ─────────────────────────────────────────────
  const [
    { data: startups },
    { data: lpCompanies },
    { data: strategics },
    { data: contacts },
    { data: deals },
    { data: lpRelationships },
    { data: documents },
    { data: recentInteractions },
    { data: aiConfigRows },
  ] = await Promise.all([
    // Pipeline companies (startups)
    supabase
      .from("companies")
      .select("id, name, deal_status, sectors, sub_type, stage, description, location_city, location_country, funding_raised, website, first_contact_date, last_contact_date, notes, tags, source, updated_at, drive_folder_url, priority")
      .eq("type", "startup")
      .order("updated_at", { ascending: false })
      .limit(500) as unknown as Promise<{ data: StartupRow[] | null }>,

    // LP companies
    supabase
      .from("companies")
      .select("id, name, lp_type, aum, fund_focus, lp_stage, commitment_goal, last_contact_date, last_meeting_date, website, location_country, description, notes")
      .in("type", ["lp", "limited partner", "investor"])
      .order("last_contact_date", { ascending: false })
      .limit(200) as unknown as Promise<{ data: LpRow[] | null }>,

    // Strategic partners
    supabase
      .from("companies")
      .select("id, name, sectors, description, last_contact_date, website, notes, location_country")
      .or("type.eq.strategic partner,types.cs.{strategic partner}")
      .order("last_contact_date", { ascending: false })
      .limit(200) as unknown as Promise<{ data: StrategicRow[] | null }>,

    // Contacts (indexed by company_id)
    supabase
      .from("contacts")
      .select("first_name, last_name, title, email, last_contact_date, company_id")
      .order("last_contact_date", { ascending: false })
      .limit(2000) as unknown as Promise<{ data: ContactRow[] | null }>,

    // Active deals
    supabase
      .from("deals")
      .select("stage, instrument, investment_amount, valuation_cap, discount_pct, close_date, notes, company_id")
      .order("created_at", { ascending: false })
      .limit(500) as unknown as Promise<{ data: DealRow[] | null }>,

    // LP deal relationships
    supabase
      .from("lp_relationships")
      .select("stage, target_allocation, committed_amount, called_amount, fund_vehicle, notes, company_id")
      .order("created_at", { ascending: false })
      .limit(200) as unknown as Promise<{ data: LpRelRow[] | null }>,

    // Documents with extracted text
    supabase
      .from("documents")
      .select("company_id, name, type, extracted_text, created_at")
      .not("extracted_text", "is", null)
      .order("created_at", { ascending: false })
      .limit(100) as unknown as Promise<{ data: DocumentRow[] | null }>,

    // Recent interactions (last 90 days)
    supabase
      .from("interactions")
      .select("company_id, type, date, summary, notes")
      .gte("date", new Date(Date.now() - 90 * 86_400_000).toISOString())
      .order("date", { ascending: false })
      .limit(200) as unknown as Promise<{ data: InteractionRow[] | null }>,

    // AI config for pipeline_assistant
    supabase
      .from("ai_configs")
      .select("model, max_tokens, temperature, system_prompt, user_prompt")
      .eq("name", "pipeline_assistant")
      .single() as unknown as Promise<{ data: AiConfigRow | null }>,
  ]);

  const aiConfig = aiConfigRows as AiConfigRow | null;

  // ── Build lookup maps ──────────────────────────────────────────────────────
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

  const lpRelByCompany = new Map<string, LpRelRow>();
  lpRelationships?.forEach(r => lpRelByCompany.set(r.company_id, r));

  const docsByCompany = new Map<string, DocumentRow[]>();
  documents?.forEach(d => {
    const arr = docsByCompany.get(d.company_id) ?? [];
    arr.push(d);
    docsByCompany.set(d.company_id, arr);
  });

  const interactionsByCompany = new Map<string, InteractionRow[]>();
  recentInteractions?.forEach(i => {
    const arr = interactionsByCompany.get(i.company_id) ?? [];
    arr.push(i);
    interactionsByCompany.set(i.company_id, arr);
  });

  // ── Format helpers ─────────────────────────────────────────────────────────
  const fmtMoney = (n: number | null) =>
    n == null ? "—" : n >= 1_000_000_000 ? `$${(n / 1_000_000_000).toFixed(1)}B`
    : n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : `$${(n / 1_000).toFixed(0)}K`;

  const fmtDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "never";

  // ── Group pipeline companies by stage ──────────────────────────────────────
  const groups: Record<string, StartupRow[]> = {
    portfolio: [], active_deal: [], monitoring: [], sourced: [], passed: [], other: [],
  };
  startups?.forEach(s => {
    const key = s.deal_status ?? "other";
    (groups[key] ?? groups["other"]).push(s);
  });

  const renderStartup = (s: StartupRow) => {
    const loc = [s.location_city, s.location_country].filter(Boolean).join(", ") || "—";
    const sector = [...(s.sectors ?? []), s.sub_type].filter(Boolean).join(" / ") || "—";
    const people = contactsByCompany.get(s.id)?.slice(0, 3)
      .map(c => `${c.first_name} ${c.last_name}${c.title ? ` (${c.title})` : ""}`)
      .join(", ") ?? "—";
    const deal = dealsByCompany.get(s.id)?.[0];
    const dealLine = deal
      ? ` | Deal: ${deal.stage} via ${deal.instrument?.toUpperCase() ?? "—"} @ ${fmtMoney(deal.valuation_cap)} cap`
      : "";
    const recentInts = interactionsByCompany.get(s.id);
    const lastInt = recentInts?.[0];
    const docs = docsByCompany.get(s.id);
    const lines = [
      `  • ${s.name}${s.priority ? ` [${s.priority} priority]` : ""} | ${sector} | ${loc}`,
      `    Stage: ${s.stage ?? "—"} | Status: ${s.deal_status ?? "—"} | Last contact: ${fmtDate(s.last_contact_date)}${dealLine}`,
      `    Raised: ${fmtMoney(s.funding_raised)} | People: ${people}`,
      s.description ? `    About: ${s.description.slice(0, 200)}${s.description.length > 200 ? "…" : ""}` : "",
      s.notes ? `    Notes: ${s.notes.slice(0, 150)}${s.notes.length > 150 ? "…" : ""}` : "",
      lastInt ? `    Latest interaction (${fmtDate(lastInt.date)} — ${lastInt.type}): ${(lastInt.summary ?? lastInt.notes ?? "").slice(0, 150)}` : "",
      docs?.length ? `    Documents: ${docs.map(d => d.name).join(", ")}` : "",
      s.drive_folder_url ? `    Data room: ${s.drive_folder_url}` : "",
    ];
    return lines.filter(Boolean).join("\n");
  };

  const sectionHeader = (label: string, items: StartupRow[]) =>
    items.length === 0 ? "" :
    `\n── ${label.toUpperCase()} (${items.length}) ──────────────────────────────────\n` +
    items.map(renderStartup).join("\n\n");

  // ── Format LP context ──────────────────────────────────────────────────────
  const renderLp = (lp: LpRow) => {
    const rel = lpRelByCompany.get(lp.id);
    const people = contactsByCompany.get(lp.id)?.slice(0, 2)
      .map(c => `${c.first_name} ${c.last_name}${c.title ? ` (${c.title})` : ""}`)
      .join(", ") ?? "—";
    const docs = docsByCompany.get(lp.id);
    return [
      `  • ${lp.name} | Type: ${lp.lp_type ?? "—"} | AUM: ${fmtMoney(lp.aum)} | Country: ${lp.location_country ?? "—"}`,
      `    CRM Stage: ${lp.lp_stage ?? "—"} | Commitment Goal: ${fmtMoney(lp.commitment_goal)} | Last contact: ${fmtDate(lp.last_contact_date)}`,
      rel ? `    Deal: ${rel.stage ?? "—"} | Target: ${fmtMoney(rel.target_allocation)} | Committed: ${fmtMoney(rel.committed_amount)} | Vehicle: ${rel.fund_vehicle ?? "—"}` : "",
      lp.fund_focus ? `    Focus: ${lp.fund_focus}` : "",
      lp.description ? `    Profile: ${lp.description.slice(0, 200)}${lp.description.length > 200 ? "…" : ""}` : "",
      lp.notes ? `    Notes: ${lp.notes.slice(0, 150)}${lp.notes.length > 150 ? "…" : ""}` : "",
      people !== "—" ? `    Contacts: ${people}` : "",
      docs?.length ? `    Documents: ${docs.map(d => d.name).join(", ")}` : "",
    ].filter(Boolean).join("\n");
  };

  // ── Format Strategic context ───────────────────────────────────────────────
  const renderStrategic = (s: StrategicRow) => {
    const people = contactsByCompany.get(s.id)?.slice(0, 2)
      .map(c => `${c.first_name} ${c.last_name}${c.title ? ` (${c.title})` : ""}`)
      .join(", ") ?? "—";
    const recentInts = interactionsByCompany.get(s.id);
    const lastInt = recentInts?.[0];
    return [
      `  • ${s.name} | Sectors: ${s.sectors?.join(", ") ?? "—"} | Country: ${s.location_country ?? "—"}`,
      `    Last contact: ${fmtDate(s.last_contact_date)}`,
      s.description ? `    About: ${s.description.slice(0, 200)}${s.description.length > 200 ? "…" : ""}` : "",
      s.notes ? `    Notes: ${s.notes.slice(0, 150)}${s.notes.length > 150 ? "…" : ""}` : "",
      people !== "—" ? `    Contacts: ${people}` : "",
      lastInt ? `    Latest (${fmtDate(lastInt.date)} — ${lastInt.type}): ${(lastInt.summary ?? lastInt.notes ?? "").slice(0, 150)}` : "",
    ].filter(Boolean).join("\n");
  };

  // ── Format Document context ────────────────────────────────────────────────
  const allDocs = documents ?? [];
  const companyNameById = new Map<string, string>();
  startups?.forEach(s => companyNameById.set(s.id, s.name));
  lpCompanies?.forEach(l => companyNameById.set(l.id, l.name));
  strategics?.forEach(s => companyNameById.set(s.id, s.name));

  const docContext = allDocs.length > 0
    ? `\n── UPLOADED DOCUMENTS (${allDocs.length}) ──────────────────────────────────\n` +
      allDocs.map(d => {
        const company = companyNameById.get(d.company_id) ?? d.company_id;
        const excerpt = (d.extracted_text ?? "").slice(0, 600);
        return `  • ${company} — ${d.name} (${d.type}, ${fmtDate(d.created_at)})\n    ${excerpt}${excerpt.length >= 600 ? "…" : ""}`;
      }).join("\n\n")
    : "";

  // ── Assemble full context ──────────────────────────────────────────────────
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  const fullContext = `
VALUENCE VENTURES — INTELLIGENCE SNAPSHOT
Generated: ${today}

═══ DEAL PIPELINE ═══════════════════════════════════════════════════════════
Total portfolio + pipeline companies tracked: ${startups?.length ?? 0}
${sectionHeader("Portfolio Companies", groups.portfolio)}
${sectionHeader("Active Deals (DD / IC Memo / Term Sheet)", groups.active_deal)}
${sectionHeader("Monitoring / Tracking", groups.monitoring)}
${sectionHeader("Sourced / Introduced", groups.sourced)}
${groups.passed.length > 0 ? sectionHeader("Passed", groups.passed) : ""}
${groups.other.length > 0 ? sectionHeader("Other / Unclassified", groups.other) : ""}

═══ LP FUNDRAISING (${lpCompanies?.length ?? 0} LPs) ═══════════════════════════════════
${(lpCompanies ?? []).map(renderLp).join("\n\n") || "  No LPs tracked."}

═══ STRATEGIC PARTNERS (${strategics?.length ?? 0}) ═══════════════════════════════════
${(strategics ?? []).map(renderStrategic).join("\n\n") || "  No strategic partners tracked."}
${docContext}
`.trim();

  // ── System prompt — use ai_configs override if available ───────────────────
  const defaultSystemPrompt = `You are the Valuence AI Assistant — an expert investment intelligence partner embedded in Valuence Ventures' operating system.

Valuence Ventures is an early-stage deeptech fund focused on cleantech, techbio, and advanced materials at pre-seed and seed stage.

## Your Knowledge Sources

1. **INTERNAL DATA** (provided below): Live CRM — pipeline companies, LP relationships, strategic partners, uploaded documents, and interaction history. This is authoritative. Cite names, stages, dates, and amounts directly.
2. **EXTERNAL KNOWLEDGE**: Your training includes deep knowledge of the VC ecosystem, technology sectors, institutional investors, and publicly known information about companies worldwide. Use this freely to enrich answers — label it "External context:" so the team knows the source.

## How to Respond

- Lead with specific internal data — exact company names, deal stages, contact dates, amounts
- Supplement with external context where it adds value (e.g., what is publicly known about a company's technology, LP's investment mandate, a sector's competitive landscape)
- If a document has been uploaded for a company, summarise its key points when relevant
- Flag companies overdue for follow-up (last contact > 60 days + active/monitoring status)
- Draft VC-quality emails, IC memos, LP updates, and meeting prep on request
- Never fabricate internal data (deal terms, amounts, contact dates) — only use what's in context
- Be sharp, concise, and actionable — not generic

## Coverage

You can answer questions about ANY company, LP, or strategic partner in our network, including:
- Deep dives on pipeline companies: technology, team, market, competitive landscape, comparable deals
- LP profiling: institutional background, fund strategy, historical mandate, typical check size
- Strategic partner analysis: business context, partnership angles, co-investment potential
- Document Q&A: summarise and extract insights from uploaded pitch decks, transcripts, and data room files
- Market intelligence: sector trends, valuation benchmarks, regulatory tailwinds/headwinds

${aiConfig?.user_prompt ? `\n## Additional Instructions\n${aiConfig.user_prompt}` : ""}

## Live Data Context

${fullContext}`;

  const systemPrompt = aiConfig?.system_prompt
    ? `${aiConfig.system_prompt}\n\n${aiConfig.user_prompt ? `Additional Instructions:\n${aiConfig.user_prompt}\n\n` : ""}Live Data Context:\n${fullContext}`
    : defaultSystemPrompt;

  // ── Stream response ────────────────────────────────────────────────────────
  const result = streamText({
    model: anthropic(aiConfig?.model ?? "claude-sonnet-4-6"),
    system: systemPrompt,
    messages,
    temperature: aiConfig?.temperature ?? 0.25,
    maxTokens: aiConfig?.max_tokens ?? 4096,
  });

  return result.toDataStreamResponse();
}
