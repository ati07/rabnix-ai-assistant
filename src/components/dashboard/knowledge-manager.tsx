"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, Globe, Loader2, Trash2, Type, Upload } from "lucide-react";
import { toast } from "sonner";
import {
  deleteDocument,
  ingestTextDocument,
  ingestWebsiteDocument,
} from "@/app/dashboard/knowledge/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export interface KnowledgeDoc {
  id: string;
  title: string;
  sourceType: string;
  status: string;
  sizeBytes: number | null;
  chunkCount: number;
  error: string | null;
  createdAt: string;
}

const SOURCE_ICON: Record<string, typeof FileText> = {
  upload: FileText,
  url: Globe,
  text: Type,
};

export function KnowledgeManager({ documents }: { documents: KnowledgeDoc[] }) {
  const router = useRouter();

  return (
    <div className="space-y-6">
      <AddKnowledge onDone={() => router.refresh()} />
      <DocumentList documents={documents} onChange={() => router.refresh()} />
    </div>
  );
}

function AddKnowledge({ onDone }: { onDone: () => void }) {
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);

  // Paste text
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  // Website
  const [url, setUrl] = useState("");
  // File
  const fileRef = useRef<HTMLInputElement>(null);

  function submitText() {
    startTransition(async () => {
      const res = await ingestTextDocument(title, text);
      if (res.ok) {
        toast.success("Added to knowledge base");
        setTitle("");
        setText("");
        onDone();
      } else {
        toast.error(res.error);
      }
    });
  }

  function submitUrl() {
    startTransition(async () => {
      const res = await ingestWebsiteDocument(url);
      if (res.ok) {
        toast.success("Website content added");
        setUrl("");
        onDone();
      } else {
        toast.error(res.error);
      }
    });
  }

  async function submitFile() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      toast.error("Choose a PDF first.");
      return;
    }
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/knowledge/upload", { method: "POST", body });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (data.ok) {
        toast.success("PDF processed and added");
        if (fileRef.current) fileRef.current.value = "";
        onDone();
      } else {
        toast.error(data.error ?? "Upload failed");
      }
    } catch {
      toast.error("Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add knowledge</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="text">
          <TabsList>
            <TabsTrigger value="text">
              <Type className="size-4" /> Paste text
            </TabsTrigger>
            <TabsTrigger value="url">
              <Globe className="size-4" /> Website
            </TabsTrigger>
            <TabsTrigger value="pdf">
              <Upload className="size-4" /> PDF
            </TabsTrigger>
          </TabsList>

          <TabsContent value="text" className="space-y-3 pt-4">
            <div className="space-y-2">
              <Label htmlFor="k-title">Title</Label>
              <Input
                id="k-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Pricing & packages"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="k-text">Content</Label>
              <Textarea
                id="k-text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={6}
                placeholder="Paste any information about your business the AI should know…"
              />
            </div>
            <Button onClick={submitText} disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" />} Add text
            </Button>
          </TabsContent>

          <TabsContent value="url" className="space-y-3 pt-4">
            <div className="space-y-2">
              <Label htmlFor="k-url">Page URL</Label>
              <Input
                id="k-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://yourbusiness.com/about"
              />
              <p className="text-sm text-muted-foreground">
                We fetch the page and store its readable text.
              </p>
            </div>
            <Button onClick={submitUrl} disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" />} Fetch &amp; add
            </Button>
          </TabsContent>

          <TabsContent value="pdf" className="space-y-3 pt-4">
            <div className="space-y-2">
              <Label htmlFor="k-file">PDF file</Label>
              <Input id="k-file" ref={fileRef} type="file" accept="application/pdf" />
              <p className="text-sm text-muted-foreground">
                Text-based PDFs only (scanned images can&apos;t be read). Max 20 MB.
              </p>
            </div>
            <Button onClick={submitFile} disabled={uploading}>
              {uploading && <Loader2 className="size-4 animate-spin" />} Upload &amp; process
            </Button>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function DocumentList({
  documents,
  onChange,
}: {
  documents: KnowledgeDoc[];
  onChange: () => void;
}) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function remove(id: string) {
    setDeletingId(id);
    startTransition(async () => {
      await deleteDocument(id);
      setDeletingId(null);
      onChange();
    });
  }

  if (documents.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          No documents yet. Add your first one above.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Documents ({documents.length})</CardTitle>
      </CardHeader>
      <CardContent className="divide-y p-0">
        {documents.map((d) => {
          const Icon = SOURCE_ICON[d.sourceType] ?? FileText;
          return (
            <div key={d.id} className="flex items-center gap-3 px-6 py-3">
              <Icon className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{d.title}</p>
                <p className="text-sm text-muted-foreground">
                  {d.chunkCount} chunk{d.chunkCount === 1 ? "" : "s"} ·{" "}
                  {new Date(d.createdAt).toLocaleDateString()}
                  {d.error ? ` · ${d.error}` : ""}
                </p>
              </div>
              <StatusBadge status={d.status} />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => remove(d.id)}
                disabled={deletingId === d.id}
                aria-label="Delete document"
              >
                {deletingId === d.id ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Trash2 className="size-4" />
                )}
              </Button>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "ready") return <Badge variant="secondary">Ready</Badge>;
  if (status === "error") return <Badge variant="destructive">Error</Badge>;
  return <Badge variant="outline">{status}</Badge>;
}
