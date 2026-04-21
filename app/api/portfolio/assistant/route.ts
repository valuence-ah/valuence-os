// ─── Portfolio AI Assistant /api/portfolio/assistant ─────────────────────────
// Accepts { companyId, messages } from the portfolio assistant tab.
// Downloads investment documents from Supabase Storage, encodes them as base64,
// injects them as file content blocks before the conversation, then streams
// a Claude response. Compatible with useChat from @ai-sdk/react.

import { createAnthropic } from "@ai-sdk/anthropic";
import { streamText } from "ai";
import { createClient } from "@/lib/supabase/server";
import type { CoreMessage } from "ai";

export const maxDuration = 60;

const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

// ── Helper: download a file from Supabase storage and return as Uint8Array ────
async function downloadStorageFile(
  supabase: Awaited<ReturnType<typeof createClient>>,
  storagePath: string
): Promise<Uint8Array | null> {
  try {
    const { data, error } = await supabase.storage
      .from("investment-memos")
      .download(storagePath);
    if (error || !data) return null;
    const arrayBuffer = await data.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const { messages, companyId } = await req.json() as {
    messages: CoreMessage[];
    companyId: string;
  };

  const supabase = await createClient();

  // ── Auth ──────────────────────────────────────────────────────────────────
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  // ── Fetch company + investments ────────────────────────────────────────────
  const [{ data: company }, { data: investments }] = await Promise.all([
    supabase
      .from("companies")
      .select("name, description, sectors, stage, location_city, location_country")
      .eq("id", companyId)
      .single(),
    supabase
      .from("portfolio_investments")
      .select("*")
      .eq("company_id", companyId)
      .order("close_date", { ascending: false }),
  ]);

  // ── Build structured investment text for system prompt ────────────────────
  const investmentText = investments?.length
    ? investments
        .map(inv => {
          const type = inv.investment_type === "safe" ? "SAFE / Convertible Note" : "Priced Round";
          const lines = [
            `${type} — ${inv.funding_round ?? "—"} (closed ${inv.close_date ?? "unknown"})`,
            `  Amount: ${inv.investment_amount ? `$${inv.investment_amount.toLocaleString()}` : "—"}`,
            `  Round size: ${inv.round_size ? `$${inv.round_size.toLocaleString()}` : "—"}`,
            `  Board: ${inv.board_representation ?? "—"}`,
          ];
          if (inv.investment_type === "safe") {
            lines.push(`  Valuation cap: ${inv.valuation_cap ? `$${inv.valuation_cap.toLocaleString()}` : "—"}`);
            lines.push(`  Discount: ${inv.discount ?? "—"}%`);
            lines.push(`  Interest rate: ${inv.interest_rate ?? "—"}%`);
          } else {
            lines.push(`  Pre-money valuation: ${inv.pre_money_valuation ? `$${inv.pre_money_valuation.toLocaleString()}` : "—"}`);
            lines.push(`  Ownership: ${inv.ownership_pct ?? "—"}%`);
            lines.push(`  Price per share: ${inv.price_per_share != null ? `$${inv.price_per_share.toFixed(4)}` : "—"}`);
          }
          if (inv.notes) lines.push(`  Notes: ${inv.notes}`);
          return lines.join("\n");
        })
        .join("\n\n")
    : "No investments recorded.";

  // ── Download PDF documents ─────────────────────────────────────────────────
  // We collect all available PDFs as Uint8Array and inject them as file parts
  // in a synthetic "context" user message before the actual conversation.
  type FilePart = { type: "file"; data: Uint8Array; mimeType: "application/pdf" };
  const fileParts: FilePart[] = [];

  if (investments) {
    for (const inv of investments) {
      if (inv.memo_storage_path) {
        const bytes = await downloadStorageFile(supabase, inv.memo_storage_path);
        if (bytes) fileParts.push({ type: "file", data: bytes, mimeType: "application/pdf" });
      }
      if (inv.subscription_doc_storage_path) {
        const bytes = await downloadStorageFile(supabase, inv.subscription_doc_storage_path);
        if (bytes) fileParts.push({ type: "file", data: bytes, mimeType: "application/pdf" });
      }
    }
  }

  // ── System prompt ──────────────────────────────────────────────────────────
  const systemPrompt = `You are the Valuence AI Assistant — a specialist investment analyst for Valuence Ventures, an early-stage deeptech VC fund focused on cleantech, techbio, and advanced materials.

You are analyzing investments in **${company?.name ?? "this portfolio company"}**.
${company?.description ? `\nCompany description: ${company.description}` : ""}
${company?.sectors?.length ? `\nSectors: ${(company.sectors as string[]).join(", ")}` : ""}
${company?.stage ? `\nStage: ${company.stage}` : ""}
${company?.location_city || company?.location_country ? `\nLocation: ${[company?.location_city, company?.location_country].filter(Boolean).join(", ")}` : ""}

## Valuence Investments in ${company?.name ?? "this company"}

${investmentText}

${fileParts.length > 0
  ? `## Investment Documents\nYou have been provided with ${fileParts.length} investment document(s) (PDF${fileParts.length > 1 ? "s" : ""}) above. Use them to answer questions accurately and cite specific terms or clauses when relevant.`
  : "## Investment Documents\nNo documents have been uploaded for this company yet. Answer based on the structured data above."}

## Instructions
- Be concise, precise, and professional
- When referencing terms from documents, cite the relevant section
- Format currency as $XM or $XK for readability
- If you cannot find information in the provided context, say so clearly
- You can help interpret term sheets, calculate dilution, explain investment structures, and summarise key terms`;

  // ── Build augmented messages ────────────────────────────────────────────────
  // If we have PDFs, prepend a synthetic exchange so Claude has the documents
  // loaded for the whole conversation without cluttering the visible history.
  const augmentedMessages: CoreMessage[] = [
    ...(fileParts.length > 0
      ? [
          {
            role: "user" as const,
            content: [
              ...fileParts,
              {
                type: "text" as const,
                text: "I'm sharing the investment documents for this company. Please review them carefully for our conversation.",
              },
            ],
          },
          {
            role: "assistant" as const,
            content: `I've reviewed the ${fileParts.length} investment document${fileParts.length > 1 ? "s" : ""}. I'm ready to answer questions about the investment terms, structure, and any details in the documents. What would you like to know?`,
          },
        ]
      : []),
    ...messages,
  ];

  // ── Stream ─────────────────────────────────────────────────────────────────
  const result = streamText({
    model: anthropic("claude-sonnet-4-5"),
    system: systemPrompt,
    messages: augmentedMessages,
    maxTokens: 2048,
    temperature: 0.2,
  });

  return result.toDataStreamResponse();
}
