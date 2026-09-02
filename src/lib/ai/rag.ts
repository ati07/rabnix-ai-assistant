import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { documentChunks, documents } from "@/lib/db/schema";
import { chunkText } from "./chunk";

/**
 * Knowledge ingestion + retrieval over `documents` / `document_chunks`.
 *
 * ITERATION 1 uses Postgres built-in full-text search (no pgvector / no
 * embeddings): ingestion just chunks and stores the text; retrieval ranks
 * chunks with `websearch_to_tsquery` + `ts_rank`, with an `ILIKE` fallback for
 * short or rare-term queries. Swap in vector search later without changing callers.
 */

export interface IngestInput {
  title: string;
  text: string;
  sourceType?: "upload" | "url" | "text";
  mimeType?: string;
  sizeBytes?: number;
}

export interface IngestResult {
  documentId: string;
  chunkCount: number;
}

/**
 * Ingest one document's text: create the `documents` row, chunk + store the
 * chunks. Marks the document `ready`, or `error` (with the message) on failure.
 */
export async function ingestDocument(
  tenantId: string,
  input: IngestInput,
): Promise<IngestResult> {
  const [doc] = await db
    .insert(documents)
    .values({
      tenantId,
      title: input.title,
      sourceType: input.sourceType ?? "text",
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      status: "processing",
    })
    .returning({ id: documents.id });

  try {
    const chunks = chunkText(input.text);

    if (chunks.length > 0) {
      await db.insert(documentChunks).values(
        chunks.map((c, i) => ({
          tenantId,
          documentId: doc.id,
          chunkIndex: i,
          content: c.content,
          tokenCount: c.tokenCount,
        })),
      );
    }

    await db
      .update(documents)
      .set({ status: "ready" })
      .where(eq(documents.id, doc.id));

    return { documentId: doc.id, chunkCount: chunks.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(documents)
      .set({ status: "error", error: message })
      .where(eq(documents.id, doc.id));
    throw err;
  }
}

export interface RetrievedChunk {
  content: string;
  documentId: string;
  /** Relevance score (`ts_rank`); higher is better. 0 for ILIKE fallback hits. */
  score: number;
}

export interface SearchOptions {
  limit?: number;
}

/**
 * Search a tenant's knowledge base with Postgres full-text search, ranked by
 * relevance. Falls back to a substring match when FTS yields nothing.
 */
export async function searchKnowledge(
  tenantId: string,
  query: string,
  options: SearchOptions = {},
): Promise<RetrievedChunk[]> {
  const q = query.trim();
  if (!q) return [];
  const limit = options.limit ?? 5;

  const tsVector = sql`to_tsvector('simple', ${documentChunks.content})`;
  const tsQuery = sql`websearch_to_tsquery('simple', ${q})`;
  const rank = sql<number>`ts_rank(${tsVector}, ${tsQuery})`;

  const ranked = await db
    .select({
      content: documentChunks.content,
      documentId: documentChunks.documentId,
      score: rank,
    })
    .from(documentChunks)
    .where(and(eq(documentChunks.tenantId, tenantId), sql`${tsVector} @@ ${tsQuery}`))
    .orderBy(desc(rank))
    .limit(limit);

  if (ranked.length > 0) return ranked;

  // Fallback: match any query word as a substring (handles typos / rare terms).
  const words = q.split(/\s+/).filter((w) => w.length >= 3).slice(0, 6);
  if (words.length === 0) return [];

  const fallback = await db
    .select({
      content: documentChunks.content,
      documentId: documentChunks.documentId,
    })
    .from(documentChunks)
    .where(
      and(
        eq(documentChunks.tenantId, tenantId),
        or(...words.map((w) => ilike(documentChunks.content, `%${w}%`))),
      ),
    )
    .limit(limit);

  return fallback.map((r) => ({ ...r, score: 0 }));
}
