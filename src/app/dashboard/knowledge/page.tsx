import { count, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { documentChunks, documents } from "@/lib/db/schema";
import { requireTenant } from "@/lib/tenant";
import {
  KnowledgeManager,
  type KnowledgeDoc,
} from "@/components/dashboard/knowledge-manager";

export default async function KnowledgePage() {
  const tenant = await requireTenant();

  const rows = await db
    .select({
      id: documents.id,
      title: documents.title,
      sourceType: documents.sourceType,
      status: documents.status,
      sizeBytes: documents.sizeBytes,
      error: documents.error,
      createdAt: documents.createdAt,
      chunkCount: count(documentChunks.id),
    })
    .from(documents)
    .leftJoin(documentChunks, eq(documentChunks.documentId, documents.id))
    .where(eq(documents.tenantId, tenant.id))
    .groupBy(documents.id)
    .orderBy(desc(documents.createdAt));

  const docs: KnowledgeDoc[] = rows.map((r) => ({
    id: r.id,
    title: r.title,
    sourceType: r.sourceType,
    status: r.status,
    sizeBytes: r.sizeBytes,
    chunkCount: Number(r.chunkCount),
    error: r.error,
    createdAt: r.createdAt.toISOString(),
  }));

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold">Knowledge base</h1>
      <p className="mt-1 mb-6 text-muted-foreground">
        Add PDFs, notes, or a website URL. Your assistant searches this to answer customers.
      </p>
      <KnowledgeManager documents={docs} />
    </div>
  );
}
