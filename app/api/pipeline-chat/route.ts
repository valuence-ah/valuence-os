// ─── Pipeline Chat API /api/pipeline-chat ─────────────────────────────────────
// Comprehensive VC intelligence endpoint — pipeline, LPs, strategics, documents.
// Reads model/temperature/system_prompt from ai_configs (pipeline_assistant).

import { createAnthropic } from "@ai-sdk/anthropic";
import { streamText } from "ai";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerClient } from "@/lib/supabase/server";

export const maxDuration = 60;

const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

// ── Types ──────────────────────────────────────────────────────────────────────

type CompanyRow = {
  id: string; name: string; type: string | null; types: string[] | null;
  deal_status: string | null; sectors: string[] | null;
  sub_type: string | null; stage: string | null; description: string | null;
  location_city: string | null; location_country: string | null;
  funding_raised: number | null; website: string | null;
  first_contact_date: string | null; last_contact_date: string | null;
  notes: string | null; tags: string[] | null; source: string | null;
  updated_at: string; drive_folder_url: string | null; priority: string | null;
  lp_type: string | null; aum: number | null; fund_focus: string | null;
  lp_stage: string | null; commitment_goal: number | null;
  last_meeting_date: string | null;
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

type DocumentRow = {
  company_id: string; name: string; type: string;
  extracted_text: string | null; created_at: string;
};

type InteractionRow = {
  company_id: string; type: string; date: string;
  summary: string | null; body: string | null;
};

type AiConfigRow = {
  model: string; max_tokens: number; temperature: number;
  system_prompt: string | null; user_prompt: string | null;
};

export async function POST(req: Request) {
  const { messages } = await req.json();
  const authClient = await createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const supabase = createAdminClient();

  // ── Fetch all data in parallel ─────────────────────────────────────────────
  const [
    { data: allCompanies },
    { data: contacts },
    { data: deals },
    { data: documents },
    { data: recentInteractions },
    { data: aiConfigRows },
  ] = await Promise.all([
    // All companies — filter by type in JS for flexibility
    supabase
      .from("companies")
      .select("id, name, type, types, deal_status, sectors, sub_type, stage, description, location_city, location_country, funding_raised, website, first_contact_date, last_contact_date, notes, tags, source, updated_at, drive_folder_url, priority, lp_type, aum, fund_focus, lp_stage, commitment_goal, last_meeting_date")
      .order("updated_at", { ascending: false })
      .limit(600) as unknown as Promise<{ data: CompanyRow[] | null }>,

    // Contacts
    supabase
      .from("contacts")
      .select("first_name, last_name, title, email, last_contact_date, company_id")
      .order("last_contact_date", { ascending: false })
      .limit(2000) as unknown as Promise<{ data: ContactRow[] | null }>,

    // Deals
    supabase
      .from("deals")
      .select("stage, instrument, investment_amount, valuation_cap, discount_pct, close_date, notes, company_id")
      .order("created_at", { ascending: false })
      .limit(500) as unknown as Promise<{ data: DealRow[] | null }>,

    // Documents with extracted text
    supabase
      .from("documents")
      .select("company_id, name, type, extracted_text, created_at")
      .not("extracted_text", "is", null)
      .order("created_at", { ascending: false })
      .limit(100) as unknown as Promise<{ data: DocumentRow[] | null }>,

    // Recent interactions (last 180 days)
    supabase
      .from("interactions")
      .select("company_id, type, date, summary, body")
      .gte("date", new Date(Date.now() - 180 * 86_400_000).toISOString())
      .order("date", { ascending: false })
      .limit(300) as unknown as Promise<{ data: InteractionRow[] | null }>,

    // AI config
    supabase
      .from("ai_configs")
      .select("model, max_tokens, temperature, system_prompt, user_prompt")
      .eq("name", "pipeline_assistant")
      .maybeSingle() as unknown as Promise<{ data: AiConfigRow | null }>,
  ]);

  const aiConfig = aiConfigRows as AiConfigRow | null;

  // ── Categorise companies ───────────────────────────────────────────────────
  const isLP = (c: CompanyRow) =>
    c.type === "limited partner" ||
    c.types?.includes("limited partner") ||
    c.deal_status === "lp";

  const isStrategic = (c: CompanyRow) =>
    c.type === "strategic partner" ||
    c.types?.includes("strategic partner");

  const isStartup = (c: CompanyRow) =>
    c.type === "startup" || c.types?.includes("startup");

  const startups   = (allCompanies ?? []).filter(isStartup);
  const lpCompanies = (allCompanies ?? []).filter(isLP);
  const strategics = (allCompanies ?? []).filter(c => isStrategic(c) && !isStartup(c));

  // ── Build lookup maps ──────────────────────────────────────────────────────
  const contactsByCompany = new Map<string, ContactRow[]>();
  contacts?.forEach(c => {
    const arr = contactsByCompany.get(c.company_id) ?? [];
    arr.push(c); contactsByCompany.set(c.company_id, arr);
  });

  const dealsByCompany = new Map<string, DealRow[]>();
  deals?.forEach(d => {
    const arr = dealsByCompany.get(d.company_id) ?? [];
    arr.push(d); dealsByCompany.set(d.company_id, arr);
  });

  const docsByCompany = new Map<string, DocumentRow[]>();
  documents?.forEach(d => {
    const arr = docsByCompany.get(d.company_id) ?? [];
    arr.push(d); docsByCompany.set(d.company_id, arr);
  });

  const interactionsByCompany = new Map<string, InteractionRow[]>();
  recentInteractions?.forEach(i => {
    const arr = interactionsByCompany.get(i.company_id) ?? [];
    arr.push(i); interactionsByCompany.set(i.company_id, arr);
  });

  // ── Format helpers ─────────────────────────────────────────────────────────
  const fmtMoney = (n: number | null) =>
    n == null ? "—" : n >= 1_000_000_000 ? `$${(n / 1_000_000_000).toFixed(1)}B`
    : n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : `$${(n / 1_000).toFixed(0)}K`;

  const fmtDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "never";

  // ── Group pipeline companies by status ─────────────────────────────────────
  const ACTIVE_STATUSES = ["portfolio", "active_deal", "due_diligence", "discussion_in_process", "first_meeting", "monitoring", "tracking_hold", "identified_introduced"];
  const groups: Record<string, CompanyRow[]> = {
    portfolio: [], active_deal: [], due_diligence: [], discussion_in_process: [],
    first_meeting: [], monitoring: [], tracking_hold: [], identified_introduced: [],
    passed: [], other: [],
  };
  startups.forEach(s => {
    const key = s.deal_status ?? "other";
    (groups[key] ?? groups["other"]).push(s);
  });

  const renderStartup = (s: CompanyRow, brief = false) => {
    const loc = [s.location_city, s.location_country].filter(Boolean).join(", ") || "—";
    const sector = [...(s.sectors ?? []), s.sub_type].filter(Boolean).join(" / ") || "—";
    const people = contactsByCompany.get(s.id)?.slice(0, 3)
      .map(c => `${c.first_name} ${c.last_name}${c.title ? ` (${c.title})` : ""}`)
      .join(", ") ?? "—";
    const deal = dealsByCompany.get(s.id)?.[0];
    const dealLine = deal ? ` | Deal: ${deal.stage} via ${deal.instrument?.toUpperCase() ?? "—"} @ ${fmtMoney(deal.valuation_cap)} cap` : "";
    const lastInt = interactionsByCompany.get(s.id)?.[0];
    const docs = docsByCompany.get(s.id);

    if (brief) {
      return `  • ${s.name} | ${sector} | ${loc} | ${s.deal_status ?? "—"} | Last: ${fmtDate(s.last_contact_date)}`;
    }
    return [
      `  • ${s.name}${s.priority ? ` [${s.priority}]` : ""} | ${sector} | ${loc}`,
      `    Stage: ${s.stage ?? "—"} | Status: ${s.deal_status ?? "—"} | Last contact: ${fmtDate(s.last_contact_date)}${dealLine}`,
      `    Raised: ${fmtMoney(s.funding_raised)} | People: ${people}`,
      s.description ? `    About: ${s.description.slice(0, 180)}` : "",
      s.notes ? `    Notes: ${s.notes.slice(0, 120)}` : "",
      lastInt ? `    Latest (${fmtDate(lastInt.date)}): ${(lastInt.summary ?? lastInt.body ?? "").slice(0, 120)}` : "",
      docs?.length ? `    Docs: ${docs.map(d => d.name).join(", ")}` : "",
    ].filter(Boolean).join("\n");
  };

  const renderLp = (lp: CompanyRow) => {
    const people = contactsByCompany.get(lp.id)?.slice(0, 2)
      .map(c => `${c.first_name} ${c.last_name}${c.title ? ` (${c.title})` : ""}`)
      .join(", ") ?? "—";
    const docs = docsByCompany.get(lp.id);
    return [
      `  • ${lp.name} | Type: ${lp.lp_type ?? lp.type ?? "—"} | AUM: ${fmtMoney(lp.aum)} | ${lp.location_country ?? "—"}`,
      `    CRM Stage: ${lp.lp_stage ?? "—"} | Goal: ${fmtMoney(lp.commitment_goal)} | Last contact: ${fmtDate(lp.last_contact_date)}`,
      lp.fund_focus ? `    Focus: ${lp.fund_focus}` : "",
      lp.description ? `    Profile: ${lp.description.slice(0, 160)}` : "",
      lp.notes ? `    Notes: ${lp.notes.slice(0, 100)}` : "",
      people !== "—" ? `    Contacts: ${people}` : "",
      docs?.length ? `    Docs: ${docs.map(d => d.name).join(", ")}` : "",
    ].filter(Boolean).join("\n");
  };

  const renderStrategic = (s: CompanyRow) => {
    const people = contactsByCompany.get(s.id)?.slice(0, 2)
      .map(c => `${c.first_name} ${c.last_name}${c.title ? ` (${c.title})` : ""}`)
      .join(", ") ?? "—";
    const lastInt = interactionsByCompany.get(s.id)?.[0];
    return [
      `  • ${s.name} | ${s.sectors?.join(", ") ?? "—"} | ${s.location_country ?? "—"}`,
      `    Last contact: ${fmtDate(s.last_contact_date)}`,
      s.description ? `    About: ${s.description.slice(0, 160)}` : "",
      s.notes ? `    Notes: ${s.notes.slice(0, 100)}` : "",
      people !== "—" ? `    Contacts: ${people}` : "",
      lastInt ? `    Latest (${fmtDate(lastInt.date)}): ${(lastInt.summary ?? lastInt.body ?? "").slice(0, 100)}` : "",
    ].filter(Boolean).join("\n");
  };

  // ── Document context ───────────────────────────────────────────────────────
  const companyNameById = new Map<string, string>();
  (allCompanies ?? []).forEach(c => companyNameById.set(c.id, c.name));

  const docContext = (documents ?? []).length > 0
    ? `\n── UPLOADED DOCUMENTS (${documents!.length}) ──────────────────────────────────\n` +
      documents!.map(d => {
        const company = companyNameById.get(d.company_id) ?? "Unknown";
        const excerpt = (d.extracted_text ?? "").slice(0, 800);
        return `  • ${company} — ${d.name} (${d.type})\n    ${excerpt}${excerpt.length >= 800 ? "…" : ""}`;
      }).join("\n\n")
    : "";

  // ── Assemble context ───────────────────────────────────────────────────────
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  // Active pipeline companies in detail; passed ones brief
  const activeStartups = ACTIVE_STATUSES.flatMap(s => groups[s] ?? []);
  const passedStartups = groups.passed ?? [];

  const fullContext = `
VALUENCE VENTURES — INTELLIGENCE SNAPSHOT
Generated: ${today}
Startups tracked: ${startups.length} | LPs: ${lpCompanies.length} | Strategics: ${strategics.length}

═══ ACTIVE PIPELINE (${activeStartups.length} companies) ═════════════════════════════
${activeStartups.map(s => renderStartup(s, false)).join("\n\n") || "  None."}

═══ PASSED / ARCHIVED (${passedStartups.length}) ════════════════════════════════════
${passedStartups.map(s => renderStartup(s, true)).join("\n") || "  None."}

═══ LP FUNDRAISING (${lpCompanies.length} LPs) ══════════════════════════════════════
${lpCompanies.map(renderLp).join("\n\n") || "  No LPs tracked."}

═══ STRATEGIC PARTNERS (${strategics.length}) ═══════════════════════════════════════
${strategics.map(renderStrategic).join("\n\n") || "  No strategic partners tracked."}
${docContext}
`.trim();

  // ── System prompt ──────────────────────────────────────────────────────────
  const defaultSystemPrompt = `You are the Valuence AI Assistant — an expert investment intelligence partner embedded in Valuence Ventures' operating system.

Valuence Ventures is an early-stage deeptech fund focused on cleantech, techbio, and advanced materials at pre-seed and seed stage.

## Your Knowledge Sources

1. **INTERNAL DATA** (provided below): Live CRM — pipeline companies, LP relationships, strategic partners, uploaded documents, and interaction history. This is authoritative. Cite names, stages, dates, and amounts directly.
2. **EXTERNAL KNOWLEDGE**: Your training includes deep knowledge of the VC ecosystem, technology sectors, institutional investors, and publicly known information about companies worldwide. Use this freely to enrich answers — label it "External context:" so the team knows the source.

## How to Respond

- Lead with specific internal data — exact company names, deal stages, contact dates, amounts
- Supplement with external context where it adds value (technology, LP mandate, competitive landscape)
- If a document has been uploaded for a company, summarise its key points when relevant
- Flag companies overdue for follow-up (last contact > 60 days + active status)
- Draft VC-quality emails, IC memos, LP updates, and meeting prep on request
- Never fabricate internal data — only use what's in context
- Be sharp, concise, and actionable — not generic
${aiConfig?.user_prompt ? `\n## Additional Instructions\n${aiConfig.user_prompt}` : ""}

## Live CRM Data

${fullContext}`;

  const systemPrompt = aiConfig?.system_prompt
    ? `${aiConfig.system_prompt}\n\n${aiConfig.user_prompt ? `Additional Instructions:\n${aiConfig.user_prompt}\n\n` : ""}Live CRM Data:\n${fullContext}`
    : defaultSystemPrompt;

  // ── Stream response ────────────────────────────────────────────────────────
  const modelId = aiConfig?.model ?? "claude-3-5-sonnet-latest";
  console.log(`[pipeline-chat] model=${modelId} promptChars=${systemPrompt.length} msgs=${messages.length}`);

  // Trim system prompt if it exceeds ~400k chars (~100k tokens) to stay safe
  const trimmedPrompt = systemPrompt.length > 400_000
    ? systemPrompt.slice(0, 400_000) + "\n\n[Context truncated due to length]"
    : systemPrompt;

  let result;
  try {
    result = streamText({
      model: anthropic(modelId),
      system: trimmedPrompt,
      messages: messages.map((m: { role: string; content: unknown }) => ({
        role: m.role,
        content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
      })),
      temperature: aiConfig?.temperature ?? 0.25,
      maxTokens: aiConfig?.max_tokens ?? 4096,
    });
  } catch (err) {
    console.error("[pipeline-chat] streamText setup error:", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }

  return result.toDataStreamResponse({
    getErrorMessage: (err) => {
      console.error("[pipeline-chat] stream error:", err);
      return err instanceof Error ? err.message : "An error occurred in the AI stream.";
    },
  });
}
