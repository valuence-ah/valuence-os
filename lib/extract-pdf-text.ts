// ─── PDF Text Extractor ────────────────────────────────────────────────────────
// Two-pass extraction:
//   1. pdf-parse   — fast, works for text-layer PDFs
//   2. Claude vision — fallback for image-based / design PDFs (Canva, Figma, etc.)

import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";

export async function extractPdfText(buffer: Buffer): Promise<string> {
  // ── Pass 1: pdf-parse ─────────────────────────────────────────────────────
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require("pdf-parse");
    const data = await pdfParse(buffer, { max: 0 });
    const text = (data.text ?? "").trim();
    if (text.length > 100) {
      return text.slice(0, 50000);
    }
  } catch (err) {
    console.error("pdf-parse error:", err);
  }

  // ── Pass 2: Claude vision (handles image-only PDFs) ───────────────────────
  console.log("pdf-parse returned no usable text — falling back to Claude vision");
  try {
    const { text } = await generateText({
      model: anthropic("claude-opus-4-5"),
      maxTokens: 4000,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "file",
              data: buffer,
              mimeType: "application/pdf",
            },
            {
              type: "text",
              text: "Extract and transcribe ALL text content from every slide/page of this PDF. Include headings, body text, bullet points, captions, and any other visible text. Preserve the structure. Output the raw extracted text only — no commentary.",
            },
          ],
        },
      ],
    });
    return text.slice(0, 50000);
  } catch (err) {
    console.error("Claude PDF vision error:", err);
    return "";
  }
}
