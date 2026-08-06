"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { documents } from "@/lib/db/schema";
import { requireTenant } from "@/lib/tenant";
import { ingestDocument } from "@/lib/ai/rag";

export type ActionResult = { ok: true } | { ok: false; error: string };

/** Ingest a pasted block of text as a knowledge document. */
export async function ingestTextDocument(
  title: string,
  text: string,
): Promise<ActionResult> {
  const tenant = await requireTenant();

  const cleanTitle = title.trim();
  const cleanText = text.trim();
  if (!cleanTitle) return { ok: false, error: "Title is required." };
  if (cleanText.length < 10) return { ok: false, error: "Add a bit more text." };

  try {
    await ingestDocument(tenant.id, {
      title: cleanTitle,
      text: cleanText,
      sourceType: "text",
    });
    revalidatePath("/dashboard/knowledge");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Ingestion failed." };
  }
}

/** Fetch a public web page and ingest its readable text. */
export async function ingestWebsiteDocument(url: string): Promise<ActionResult> {
  const tenant = await requireTenant();

  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return { ok: false, error: "Enter a valid URL." };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, error: "Only http/https URLs are supported." };
  }

  try {
    const res = await fetch(parsed.toString(), {
      headers: { "user-agent": "RabnixBot/1.0 (+knowledge-ingest)" },
      redirect: "follow",
    });
    if (!res.ok) {
      return { ok: false, error: `Could not fetch page (HTTP ${res.status}).` };
    }
    const html = await res.text();
    const { title, text } = extractReadableText(html);
    if (text.length < 20) {
      return { ok: false, error: "No readable text found on that page." };
    }

    await ingestDocument(tenant.id, {
      title: title || parsed.hostname,
      text,
      sourceType: "url",
      mimeType: "text/html",
      sizeBytes: text.length,
    });
    revalidatePath("/dashboard/knowledge");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Fetch failed." };
  }
}

/** Delete a document (and its chunks, via cascade). Tenant-scoped. */
export async function deleteDocument(id: string): Promise<ActionResult> {
  const tenant = await requireTenant();
  await db
    .delete(documents)
    .where(and(eq(documents.id, id), eq(documents.tenantId, tenant.id)));
  revalidatePath("/dashboard/knowledge");
  return { ok: true };
}

/** Strip a rough readable-text version + <title> out of an HTML document. */
function extractReadableText(html: string): { title: string; text: string } {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? decodeEntities(titleMatch[1]).trim() : "";

  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/(p|div|section|article|li|h[1-6]|br|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");

  return { title, text: collapse(decodeEntities(text)) };
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'");
}

function collapse(s: string): string {
  return s
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}
