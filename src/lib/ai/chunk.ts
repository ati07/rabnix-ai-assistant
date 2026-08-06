/**
 * Split long text into overlapping chunks for embedding + retrieval.
 *
 * Strategy: pack whole paragraphs into ~`maxChars` windows, keeping a small
 * `overlapChars` tail between consecutive chunks so context isn't cut mid-idea.
 * Paragraphs longer than the window are hard-split. Sizes are in characters —
 * we approximate tokens as chars/4 for the stored `tokenCount`.
 */

export interface Chunk {
  content: string;
  tokenCount: number;
}

export interface ChunkOptions {
  /** Target max characters per chunk (~500 tokens). */
  maxChars?: number;
  /** Characters of overlap carried into the next chunk (~50 tokens). */
  overlapChars?: number;
}

const DEFAULT_MAX = 2000;
const DEFAULT_OVERLAP = 200;

export function chunkText(text: string, options: ChunkOptions = {}): Chunk[] {
  const maxChars = options.maxChars ?? DEFAULT_MAX;
  const overlapChars = Math.min(options.overlapChars ?? DEFAULT_OVERLAP, maxChars - 1);

  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  // Split into paragraphs, then hard-split any that exceed the window.
  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .flatMap((p) => (p.length > maxChars ? hardSplit(p, maxChars) : [p]));

  const chunks: string[] = [];
  let current = "";

  for (const para of paragraphs) {
    if (!current) {
      current = para;
    } else if (current.length + 2 + para.length <= maxChars) {
      current += "\n\n" + para;
    } else {
      chunks.push(current);
      const tail = overlapChars > 0 ? current.slice(-overlapChars) : "";
      current = tail ? `${tail}\n\n${para}` : para;
    }
  }
  if (current) chunks.push(current);

  return chunks.map((content) => ({
    content,
    tokenCount: Math.ceil(content.length / 4),
  }));
}

/** Break an oversized paragraph on whitespace near the window boundary. */
function hardSplit(text: string, maxChars: number): string[] {
  const parts: string[] = [];
  let rest = text;
  while (rest.length > maxChars) {
    let cut = rest.lastIndexOf(" ", maxChars);
    if (cut <= 0) cut = maxChars; // no space — split hard.
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}
