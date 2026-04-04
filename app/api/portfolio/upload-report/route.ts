// ─── POST /api/portfolio/upload-report ───────────────────────────────────────
// Accepts a portfolio report file (PDF/DOCX/XLSX), uploads to Supabase storage,
// extracts text, calls Claude to extract KPIs/milestones/initiatives, and
// updates the company's health status and raise info.

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const contentType = request.headers.get("content-type") ?? "";
  const isJsonBody = contentType.includes("application/json");

  let companyId: string | null;
  let reportType: string;
  let period: string;
  let extractedText = "";
  let reportId: string | null = null;

  if (isJsonBody) {
    // Text paste mode — no file upload needed
    const body = await request.json() as { text_content?: string; company_id?: string; report_type?: string; period?: string };
    companyId = body.company_id ?? null;
    reportType = body.report_type ?? "quarterly";
    period = body.period ?? "";
    extractedText = (body.text_content ?? "").substring(0, 15000);

    if (!companyId || !extractedText.trim()) {
      return NextResponse.json({ error: "company_id and text_content required" }, { status: 400 });
    }

    // Create a lightweight report record for text-paste mode
    const { data: r } = await supabase
      .from("portfolio_reports")
      .insert({ company_id: companyId, file_name: "pasted-text", storage_path: "text-paste", report_type: reportType, period: period || null })
      .select("id")
      .single();
    reportId = r?.id ?? null;
  } else {
    // File upload mode
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    companyId = formData.get("company_id") as string | null;
    reportType = (formData.get("report_type") as string) || "quarterly";
    period = (formData.get("period") as string) || "";

    if (!file || !companyId) {
      return NextResponse.json({ error: "File and company_id required" }, { status: 400 });
    }

    // 1. Upload to Supabase storage
    const fileName = `${Date.now()}-${file.name}`;
    const storagePath = `portfolio-reports/${companyId}/${fileName}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabase.storage
      .from("documents")
      .upload(storagePath, buffer, { contentType: file.type });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    // 2. Create report record
    const { data: r } = await supabase
      .from("portfolio_reports")
      .insert({
        company_id: companyId,
        file_name: file.name,
        storage_path: storagePath,
        report_type: reportType,
        period: period || null,
      })
      .select("id")
      .single();
    reportId = r?.id ?? null;

    // 3. Extract text from PDF
    try {
      const { extractPdfText } = await import("@/lib/extract-pdf-text");
      extractedText = await extractPdfText(buffer);
    } catch {
      extractedText = buffer.toString("utf-8").substring(0, 15000);
    }
  }

  // 4. Get company context
  const { data: company } = await supabase
    .from("companies")
    .select("name, sectors, stage, description")
    .eq("id", companyId)
    .single();

  // 5. Call Claude Sonnet to extract structured data
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 2000,
    system: `You are a VC analyst extracting structured data from portfolio company reports for Valuence Ventures, an early-stage deeptech fund (cleantech, biotech, advanced materials). Extract ALL available data. Return ONLY valid JSON, no markdown fences.`,
    messages: [{
      role: "user",
      content: `Extract structured data from this ${reportType} report for ${company?.name ?? "portfolio company"} (${(company?.sectors ?? []).join(", ")}, ${company?.stage ?? ""}).

Report text:
${extractedText.substring(0, 12000)}

Return JSON:
{
  "summary": "2-3 sentence executive summary of the report",
  "kpis": {
    "mrr": number or null,
    "mrr_growth": percentage number or null,
    "monthly_burn": number or null,
    "cash_on_hand": number or null,
    "runway_months": number or null,
    "revenue": number or null,
    "gross_margin": percentage or null,
    "headcount": number or null,
    "headcount_change": number or null,
    "customers": number or null,
    "pilots_active": number or null,
    "custom_kpis": {}
  },
  "strategic_initiatives": [
    {
      "title": "initiative name",
      "description": "1-2 sentence description",
      "status": "planned" | "in_progress" | "complete" | "paused",
      "category": "market_expansion" | "product_development" | "partnership" | "regulatory" | "fundraise" | "hiring" | "ip" | "general"
    }
  ],
  "milestones": [
    {
      "title": "milestone name",
      "description": "detail",
      "status": "upcoming" | "in_progress" | "done" | "blocked",
      "target_date": "Q3 2026" or null,
      "category": "fundraise" | "regulatory" | "product" | "partnership" | "hiring" | "general"
    }
  ],
  "fundraise_status": {
    "is_raising": boolean,
    "status": "not_raising" | "preparing" | "actively_raising" | "closing",
    "target_amount": "$8M" or null,
    "target_round": "Series A" or null
  }
}`
    }]
  });

  const aiText = response.content[0].type === "text" ? response.content[0].text : "";
  let extracted: {
    summary?: string;
    kpis?: Record<string, number | null | Record<string, number>>;
    strategic_initiatives?: Array<{ title: string; description?: string; status?: string; category?: string }>;
    milestones?: Array<{ title: string; description?: string; status?: string; target_date?: string; category?: string }>;
    fundraise_status?: { is_raising?: boolean; status?: string; target_amount?: string; target_round?: string };
  };

  try {
    extracted = JSON.parse(aiText.replace(/```json|```/g, "").trim());
  } catch {
    return NextResponse.json({ error: "AI extraction failed to parse" }, { status: 500 });
  }

  // 6. Update report with extraction
  await supabase
    .from("portfolio_reports")
    .update({
      ai_extracted: true,
      ai_summary: extracted.summary ?? null,
      extracted_data: extracted,
    })
    .eq("id", reportId);

  // 7. Upsert KPIs
  if (extracted.kpis) {
    const kpis = extracted.kpis;
    await supabase
      .from("portfolio_kpis")
      .upsert({
        company_id: companyId,
        period: period || `${reportType} ${new Date().toISOString().substring(0, 7)}`,
        period_type: reportType,
        mrr: kpis.mrr as number | null ?? null,
        mrr_growth: kpis.mrr_growth as number | null ?? null,
        monthly_burn: kpis.monthly_burn as number | null ?? null,
        cash_on_hand: kpis.cash_on_hand as number | null ?? null,
        runway_months: kpis.runway_months as number | null ?? null,
        revenue: kpis.revenue as number | null ?? null,
        gross_margin: kpis.gross_margin as number | null ?? null,
        headcount: kpis.headcount as number | null ?? null,
        headcount_change: kpis.headcount_change as number | null ?? null,
        customers: kpis.customers as number | null ?? null,
        pilots_active: kpis.pilots_active as number | null ?? null,
        custom_kpis: (kpis.custom_kpis as Record<string, number>) ?? {},
        source: "report_upload",
        source_report_id: reportId ?? null,
      }, { onConflict: "company_id,period" });
  }

  // 8. Insert/update milestones
  if (extracted.milestones?.length) {
    for (const ms of extracted.milestones) {
      const { data: existing } = await supabase
        .from("portfolio_milestones")
        .select("id")
        .eq("company_id", companyId)
        .ilike("title", `%${ms.title.substring(0, 20)}%`)
        .limit(1)
        .maybeSingle();

      if (existing) {
        await supabase
          .from("portfolio_milestones")
          .update({ description: ms.description ?? null, status: ms.status ?? "upcoming", target_date: ms.target_date ?? null, updated_at: new Date().toISOString() })
          .eq("id", existing.id);
      } else {
        await supabase
          .from("portfolio_milestones")
          .insert({ company_id: companyId, title: ms.title, description: ms.description ?? null, status: ms.status ?? "upcoming", target_date: ms.target_date ?? null, category: ms.category ?? "general", source: "report_upload" });
      }
    }
  }

  // 9. Insert/update strategic initiatives
  if (extracted.strategic_initiatives?.length) {
    for (const init of extracted.strategic_initiatives) {
      const { data: existing } = await supabase
        .from("portfolio_initiatives")
        .select("id")
        .eq("company_id", companyId)
        .ilike("title", `%${init.title.substring(0, 20)}%`)
        .limit(1)
        .maybeSingle();

      if (existing) {
        await supabase
          .from("portfolio_initiatives")
          .update({ description: init.description ?? null, status: init.status ?? "in_progress", updated_at: new Date().toISOString() })
          .eq("id", existing.id);
      } else {
        await supabase
          .from("portfolio_initiatives")
          .insert({ company_id: companyId, title: init.title, description: init.description ?? null, status: init.status ?? "in_progress", category: init.category ?? "general", source: "report_upload", source_report_id: reportId ?? null });
      }
    }
  }

  // 10. Update company health status and raise info
  const runway = extracted.kpis?.runway_months as number | null ?? null;
  let healthStatus: "healthy" | "watch" | "attention" | "unknown" = "unknown";
  if (runway !== null) {
    if (runway >= 12) healthStatus = "healthy";
    else if (runway >= 6) healthStatus = "watch";
    else healthStatus = "attention";
  }

  const companyUpdates: Record<string, unknown> = {
    runway_months: runway,
    health_status: healthStatus,
    latest_report_date: new Date().toISOString(),
    latest_report_summary: extracted.summary ?? null,
  };

  if (extracted.fundraise_status) {
    companyUpdates.current_raise_status = extracted.fundraise_status.status ?? null;
    if (extracted.fundraise_status.target_amount && extracted.fundraise_status.target_round) {
      companyUpdates.current_raise_target = `${extracted.fundraise_status.target_amount} ${extracted.fundraise_status.target_round}`;
    }
  }

  await supabase.from("companies").update(companyUpdates).eq("id", companyId);

  return NextResponse.json({
    success: true,
    report_id: reportId,
    extracted: {
      summary: extracted.summary,
      kpi_count: Object.entries(extracted.kpis ?? {}).filter(([k, v]) => k !== "custom_kpis" && v !== null).length,
      milestone_count: extracted.milestones?.length ?? 0,
      initiative_count: extracted.strategic_initiatives?.length ?? 0,
    },
  });
}
