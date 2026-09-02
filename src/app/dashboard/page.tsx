import Link from "next/link";
import { count, eq } from "drizzle-orm";
import { ArrowRight } from "lucide-react";
import { db } from "@/lib/db";
import {
  businessConfig,
  conversations,
  documents,
  whatsappConnections,
} from "@/lib/db/schema";
import { requireTenant } from "@/lib/tenant";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function DashboardOverviewPage() {
  const tenant = await requireTenant();

  const [config, connection, [docs], [convos]] = await Promise.all([
    db.query.businessConfig.findFirst({
      where: eq(businessConfig.tenantId, tenant.id),
    }),
    db.query.whatsappConnections.findFirst({
      where: eq(whatsappConnections.tenantId, tenant.id),
    }),
    db
      .select({ n: count() })
      .from(documents)
      .where(eq(documents.tenantId, tenant.id)),
    db
      .select({ n: count() })
      .from(conversations)
      .where(eq(conversations.tenantId, tenant.id)),
  ]);

  const waStatus = connection?.status ?? "disconnected";
  const configured = Boolean(config?.persona || (config?.services?.length ?? 0) > 0);

  const cards = [
    {
      title: "Business profile",
      href: "/dashboard/business",
      value: configured ? "Configured" : "Needs setup",
      tone: configured ? "ready" : "todo",
      hint: "Hours, services, FAQs, and persona your AI uses.",
    },
    {
      title: "Knowledge base",
      href: "/dashboard/knowledge",
      value: `${docs.n} document${docs.n === 1 ? "" : "s"}`,
      tone: docs.n > 0 ? "ready" : "todo",
      hint: "PDFs, notes, and website content the AI can search.",
    },
    {
      title: "WhatsApp",
      href: "/dashboard/whatsapp",
      value: waStatus === "connected" ? "Connected" : "Not connected",
      tone: waStatus === "connected" ? "ready" : "todo",
      hint: "Link your number so the assistant can reply to customers.",
    },
    {
      title: "Conversations",
      href: "/dashboard/conversations",
      value: `${convos.n} total`,
      tone: "neutral",
      hint: "Every customer chat the assistant has handled.",
    },
  ] as const;

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-semibold">Welcome, {tenant.name}</h1>
      <p className="mt-1 text-muted-foreground">
        Set up your business, add knowledge, and connect WhatsApp to go live.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {cards.map((c) => (
          <Link key={c.href} href={c.href} className="group">
            <Card className="h-full transition-colors group-hover:border-foreground/30">
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base font-medium">{c.title}</CardTitle>
                <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-semibold">{c.value}</span>
                  {c.tone === "ready" && <Badge variant="secondary">Ready</Badge>}
                  {c.tone === "todo" && <Badge variant="outline">To do</Badge>}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{c.hint}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
