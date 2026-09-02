import { PDFParse } from "pdf-parse";
import { ingestDocument } from "@/lib/ai/rag";
import { requireTenant } from "@/lib/tenant";
import {
  canAddDocument,
  KNOWLEDGE_LIMIT_MESSAGE,
} from "@/lib/billing/subscription";

export const runtime = "nodejs";

const MAX_BYTES = 20 * 1024 * 1024; // 20 MB

export async function POST(req: Request) {
  let tenant;
  try {
    tenant = await requireTenant();
  } catch {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ ok: false, error: "No file provided." }, { status: 400 });
  }
  if (file.type && file.type !== "application/pdf") {
    return Response.json({ ok: false, error: "Only PDF files are supported." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ ok: false, error: "File is larger than 20 MB." }, { status: 400 });
  }
  if (!(await canAddDocument(tenant.id))) {
    return Response.json({ ok: false, error: KNOWLEDGE_LIMIT_MESSAGE }, { status: 402 });
  }

  try {
    const data = new Uint8Array(await file.arrayBuffer());
    const parser = new PDFParse({ data });
    let text: string;
    try {
      const parsed = await parser.getText();
      text = (parsed.text ?? "").trim();
    } finally {
      await parser.destroy();
    }
    if (text.length < 20) {
      return Response.json(
        { ok: false, error: "Could not extract text — the PDF may be scanned images." },
        { status: 422 },
      );
    }

    const result = await ingestDocument(tenant.id, {
      title: file.name.replace(/\.pdf$/i, ""),
      text,
      sourceType: "upload",
      mimeType: "application/pdf",
      sizeBytes: file.size,
    });

    return Response.json({ ok: true, chunkCount: result.chunkCount });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to process PDF.";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
