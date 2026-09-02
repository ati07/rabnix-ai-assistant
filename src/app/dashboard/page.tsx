import Link from "next/link";
import { count, eq } from "drizzle-orm";
import {
  ArrowRight,
  Bot,
  Building2,
  BookOpen,
  Calendar,
  CheckCircle2,
  FileText,
  MessagesSquare,
  Plus,
  Settings,
  ShieldCheck,
  Smartphone,
  Sparkles,
  TrendingUp,
  UserCheck,
  Users,
  Zap,
} from "lucide-react";
import { db } from "@/lib/db";
import {
  appointments,
  businessConfig,
  conversations,
  customers,
  documents,
  whatsappConnections,
} from "@/lib/db/schema";
import { requireTenant } from "@/lib/tenant";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default async function DashboardOverviewPage() {
  const tenant = await requireTenant();

  const [
    config,
    connection,
    [docsCount],
    [convosCount],
    [customersCount],
    [apptsCount],
  ] = await Promise.all([
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
    db
      .select({ n: count() })
      .from(customers)
      .where(eq(customers.tenantId, tenant.id)),
    db
      .select({ n: count() })
      .from(appointments)
      .where(eq(appointments.tenantId, tenant.id)),
  ]);

  const waStatus = connection?.status ?? "disconnected";
  const hasBusinessConfig = Boolean(config?.persona || (config?.services?.length ?? 0) > 0);
  const hasDocs = (docsCount?.n ?? 0) > 0;
  const hasWa = waStatus === "connected";

  // Calculate setup readiness percentage
  const checklist = [
    {
      title: "Business Profile & Services",
      desc: "Define your business persona, working hours, pricing, and FAQ knowledge.",
      done: hasBusinessConfig,
      href: "/dashboard/business",
      actionText: hasBusinessConfig ? "Edit Profile" : "Configure Now",
      icon: Building2,
    },
    {
      title: "Knowledge Base Documents",
      desc: "Upload PDFs, policy documents, or pricing sheets for fact-grounded answers.",
      done: hasDocs,
      href: "/dashboard/knowledge",
      actionText: hasDocs ? "Manage Docs" : "Upload Document",
      icon: BookOpen,
    },
    {
      title: "Connect WhatsApp Channel",
      desc: "Link your WhatsApp Business Cloud API or scan QR code to enable live AI chats.",
      done: hasWa,
      href: "/dashboard/whatsapp",
      actionText: hasWa ? "Manage Connection" : "Connect WhatsApp",
      icon: Smartphone,
    },
    {
      title: "Embed Web Chat Widget",
      desc: "Install the embeddable chat widget on your website to capture inbound leads.",
      done: true,
      href: "/dashboard/chatbot",
      actionText: "Get Embed Code",
      icon: Bot,
    },
  ];

  const completedSteps = checklist.filter((i) => i.done).length;
  const readinessPercent = Math.round((completedSteps / checklist.length) * 100);

  return (
    <div className="space-y-8">
      {/* Hero Welcome Banner */}
      <div className="relative overflow-hidden rounded-2xl border border-border/80 bg-gradient-to-br from-card via-card to-primary/5 p-6 sm:p-8 shadow-xs">
        <div className="relative z-10 flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2 max-w-2xl">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="gap-1.5 py-1 px-2.5 text-xs font-semibold bg-background/80 border-primary/30 text-primary">
                <Sparkles className="size-3.5 text-primary" />
                Rabnix Autonomous Workspace
              </Badge>
              <Badge variant="secondary" className="text-xs">
                {readinessPercent === 100 ? "100% Ready" : `${readinessPercent}% Configured`}
              </Badge>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              Welcome back, {tenant.name}
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
              Your AI assistant is trained to respond autonomously on WhatsApp and your website, book appointments with zero conflicts, and capture verified customer leads.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <Button asChild size="default" className="shadow-xs gap-2">
              <Link href="/dashboard/business">
                <Sparkles className="size-4" />
                Tune AI Brain
              </Link>
            </Button>
            <Button asChild variant="outline" size="default" className="gap-2">
              <Link href="/dashboard/knowledge">
                <Plus className="size-4" />
                Add Knowledge
              </Link>
            </Button>
          </div>
        </div>

        {/* Setup Progress Bar */}
        <div className="relative z-10 mt-6 pt-5 border-t border-border/60">
          <div className="flex items-center justify-between text-xs font-medium mb-2">
            <span className="text-muted-foreground">Setup &amp; Training Readiness</span>
            <span className="text-foreground font-semibold">{completedSteps} of {checklist.length} Completed</span>
          </div>
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${readinessPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* Primary KPI Metrics Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-border/60 bg-card/80 transition-all hover:border-primary/40 hover:shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Conversations
            </CardTitle>
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <MessagesSquare className="size-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight text-foreground">{convosCount?.n ?? 0}</div>
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Live</span> across WhatsApp &amp; Web
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/80 transition-all hover:border-primary/40 hover:shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Captured Customers
            </CardTitle>
            <div className="flex size-8 items-center justify-center rounded-lg bg-sky-500/10 text-sky-500">
              <UserCheck className="size-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight text-foreground">{customersCount?.n ?? 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Tagged &amp; synced into CRM
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/80 transition-all hover:border-primary/40 hover:shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Appointments
            </CardTitle>
            <div className="flex size-8 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-500">
              <Calendar className="size-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight text-foreground">{apptsCount?.n ?? 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Conflict-free locked bookings
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/80 transition-all hover:border-primary/40 hover:shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Knowledge Indexed
            </CardTitle>
            <div className="flex size-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500">
              <FileText className="size-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight text-foreground">{docsCount?.n ?? 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Verified documents active
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Two-Column Layout */}
      <div className="grid gap-8 lg:grid-cols-12">
        {/* Left Column: Interactive Setup Steps & Live Channels */}
        <div className="space-y-8 lg:col-span-8">
          {/* Setup Checklist */}
          <Card className="border-border/70">
            <CardHeader className="pb-4 border-b border-border/50">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-semibold">Workspace Launch Checklist</CardTitle>
                  <CardDescription className="text-xs mt-0.5">
                    Follow these four core steps to ensure your AI answers accurately and securely.
                  </CardDescription>
                </div>
                <Badge variant={readinessPercent === 100 ? "default" : "outline"} className="text-xs">
                  {completedSteps}/4 Steps
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0 divide-y divide-border/40">
              {checklist.map((item, idx) => {
                const Icon = item.icon;
                return (
                  <div
                    key={idx}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 transition-colors hover:bg-muted/30"
                  >
                    <div className="flex items-start gap-3.5">
                      <div
                        className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border ${
                          item.done
                            ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                            : "bg-muted border-border text-muted-foreground"
                        }`}
                      >
                        {item.done ? (
                          <CheckCircle2 className="size-4.5" />
                        ) : (
                          <Icon className="size-4" />
                        )}
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-medium text-foreground">{item.title}</h4>
                          {item.done && (
                            <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                              Ready
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed max-w-xl">
                          {item.desc}
                        </p>
                      </div>
                    </div>

                    <div className="sm:shrink-0 self-end sm:self-center">
                      <Button asChild variant={item.done ? "outline" : "default"} size="sm" className="text-xs gap-1">
                        <Link href={item.href}>
                          <span>{item.actionText}</span>
                          <ArrowRight className="size-3" />
                        </Link>
                      </Button>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Connected Channels Overview */}
          <div className="grid gap-4 sm:grid-cols-2">
            {/* WhatsApp Card */}
            <Card className="border-border/70 bg-card">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                      <Smartphone className="size-4" />
                    </div>
                    <div>
                      <CardTitle className="text-sm font-semibold">WhatsApp Channel</CardTitle>
                      <CardDescription className="text-xs">Meta Cloud API or QR</CardDescription>
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={`text-xs gap-1 ${
                      hasWa
                        ? "border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5"
                        : "border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-500/5"
                    }`}
                  >
                    <span className={`size-1.5 rounded-full ${hasWa ? "bg-emerald-500 animate-pulse" : "bg-amber-500"}`} />
                    {hasWa ? "Connected" : "Disconnected"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {hasWa
                    ? "Your WhatsApp phone number is connected and answering incoming customer queries automatically 24/7."
                    : "Connect your official WhatsApp Business phone number or scan QR code to enable WhatsApp autonomous replies."}
                </p>
                <Button asChild variant="outline" size="sm" className="w-full text-xs gap-1.5">
                  <Link href="/dashboard/whatsapp">
                    <span>{hasWa ? "Manage Connection" : "Connect Number"}</span>
                    <ArrowRight className="size-3" />
                  </Link>
                </Button>
              </CardContent>
            </Card>

            {/* Web Chatbot Card */}
            <Card className="border-border/70 bg-card">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex size-8 items-center justify-center rounded-lg bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/30">
                      <Bot className="size-4" />
                    </div>
                    <div>
                      <CardTitle className="text-sm font-semibold">Web Chat Widget</CardTitle>
                      <CardDescription className="text-xs">Embed on your website</CardDescription>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-xs gap-1 border-sky-500/30 text-sky-600 dark:text-sky-400 bg-sky-500/5">
                    <span className="size-1.5 rounded-full bg-sky-500" />
                    Available
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Add one line of script to your website or share direct web chat links to capture visitors immediately.
                </p>
                <Button asChild variant="outline" size="sm" className="w-full text-xs gap-1.5">
                  <Link href="/dashboard/chatbot">
                    <span>Configure &amp; Copy Code</span>
                    <ArrowRight className="size-3" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Right Column: Quick Navigation & Assistant Simulator */}
        <div className="space-y-6 lg:col-span-4">
          {/* Quick Actions Card */}
          <Card className="border-border/70">
            <CardHeader className="pb-3 border-b border-border/50">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Zap className="size-4 text-primary" />
                Quick Operations
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 space-y-1">
              <Link
                href="/dashboard/conversations"
                className="flex items-center justify-between p-2.5 rounded-lg text-xs font-medium text-foreground hover:bg-muted transition-colors"
              >
                <span className="flex items-center gap-2">
                  <MessagesSquare className="size-4 text-muted-foreground" />
                  Live Conversations
                </span>
                <ArrowRight className="size-3 text-muted-foreground" />
              </Link>

              <Link
                href="/dashboard/customers"
                className="flex items-center justify-between p-2.5 rounded-lg text-xs font-medium text-foreground hover:bg-muted transition-colors"
              >
                <span className="flex items-center gap-2">
                  <Users className="size-4 text-muted-foreground" />
                  Customer Directory &amp; Leads
                </span>
                <ArrowRight className="size-3 text-muted-foreground" />
              </Link>

              <Link
                href="/dashboard/analytics"
                className="flex items-center justify-between p-2.5 rounded-lg text-xs font-medium text-foreground hover:bg-muted transition-colors"
              >
                <span className="flex items-center gap-2">
                  <TrendingUp className="size-4 text-muted-foreground" />
                  Performance Analytics
                </span>
                <ArrowRight className="size-3 text-muted-foreground" />
              </Link>

              <Link
                href="/dashboard/staff"
                className="flex items-center justify-between p-2.5 rounded-lg text-xs font-medium text-foreground hover:bg-muted transition-colors"
              >
                <span className="flex items-center gap-2">
                  <ShieldCheck className="size-4 text-muted-foreground" />
                  Staff &amp; Human Handoff
                </span>
                <ArrowRight className="size-3 text-muted-foreground" />
              </Link>

              <Link
                href="/dashboard/billing"
                className="flex items-center justify-between p-2.5 rounded-lg text-xs font-medium text-foreground hover:bg-muted transition-colors"
              >
                <span className="flex items-center gap-2">
                  <Settings className="size-4 text-muted-foreground" />
                  Workspace Plan &amp; Billing
                </span>
                <ArrowRight className="size-3 text-muted-foreground" />
              </Link>
            </CardContent>
          </Card>

          {/* Safety & Grounding Card */}
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-2.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-primary">
              <ShieldCheck className="size-4 text-primary" />
              Grounded AI Guardrails Active
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Rabnix will never invent prices, services, or fake calendar bookings. Responses are strictly grounded in your configured business documents and real-time database locks.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
