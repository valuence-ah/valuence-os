// ─── Embeddings Utility ───────────────────────────────────────────────────────
// Uses Voyage AI (Anthropic's embedding partner) to generate 1536-dim vectors.
// Model: voyage-large-2 (1536 dimensions, matches the pgvector schema)
//
// To enable: add VOYAGE_API_KEY to .env.local
// Get a key at: https://dash.voyageai.com

const VOYAGE_API = "https://api.voyageai.com/v1/embeddings";
const VOYAGE_MODEL = "voyage-large-2";

interface VoyageResponse {
  data: { embedding: number[] }[];
}

/**
 * Generates a single embedding vector for a piece of text.
 * Returns null if VOYAGE_API_KEY is not configured or the call fails.
 */
export async function embedText(text: string): Promise<number[] | null> {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) return null;

  // Truncate to ~8000 tokens (safe limit for voyage-large-2)
  const truncated = text.slice(0, 24000);

  try {
    const res = await fetch(VOYAGE_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: VOYAGE_MODEL,
        input: [truncated],
      }),
    });

    if (!res.ok) {
      console.error(`[embedText] Voyage API error: ${res.status}`);
      return null;
    }

    const data = (await res.json()) as VoyageResponse;
    return data.data?.[0]?.embedding ?? null;
  } catch (err) {
    console.error("[embedText] Error:", err);
    return null;
  }
}

/**
 * Generates embeddings for multiple texts in one API call (batch).
 * Returns an array of the same length; null entries indicate failures.
 */
export async function embedBatch(texts: string[]): Promise<(number[] | null)[]> {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) return texts.map(() => null);

  const truncated = texts.map((t) => t.slice(0, 24000));

  try {
    const res = await fetch(VOYAGE_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: VOYAGE_MODEL,
        input: truncated,
      }),
    });

    if (!res.ok) {
      console.error(`[embedBatch] Voyage API error: ${res.status}`);
      return texts.map(() => null);
    }

    const data = (await res.json()) as VoyageResponse;
    return data.data?.map((d) => d.embedding ?? null) ?? texts.map(() => null);
  } catch (err) {
    console.error("[embedBatch] Error:", err);
    return texts.map(() => null);
  }
}
