import Link from "next/link";
import {
  ArrowRight,
  Calendar,
  CheckCircle2,
  FileText,
  Headphones,
  Lock,
  MessageSquare,
  Users,
} from "lucide-react";
import { getSessionUser } from "@/lib/tenant";
import { LandingHeader } from "@/components/landing/landing-header";
import { LandingInteractivePreview } from "@/components/landing/interactive-preview";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default async function Home() {
  const user = await getSessionUser();
  const isLoggedIn = Boolean(user);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground antialiased selection:bg-primary selection:text-primary-foreground">
      {/* Global Header */}
      <LandingHeader isLoggedIn={isLoggedIn} />

      {/* Hero Section */}
      <section className="relative overflow-hidden pt-12 pb-20 md:pt-20 md:pb-28">
        {/* Subtle background glow effect */}
        <div className="pointer-events-none absolute inset-0 -z-10 flex items-center justify-center opacity-40 dark:opacity-20">
          <div className="h-[450px] w-[700px] rounded-full bg-primary/20 blur-[120px]" />
        </div>

        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 text-center">
          {/* Top Announcement Pill */}
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3.5 py-1.5 text-xs font-medium text-primary mb-6 transition-all hover:bg-primary/10">
            <span className="flex size-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-semibold">Rabnix v1.2 Live</span>
            <span className="text-muted-foreground">·</span>
            <span>WhatsApp Cloud API + Embedded Web Widget</span>
            <ArrowRight className="size-3" />
          </div>

          {/* Main Headline */}
          <h1 className="mx-auto max-w-4xl text-3xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl text-foreground">
            Deploy 24/7 AI Business Employees on{" "}
            <span className="bg-gradient-to-r from-emerald-600 via-teal-600 to-primary bg-clip-text text-transparent dark:from-emerald-400 dark:via-teal-300 dark:to-primary">
              WhatsApp &amp; Web
            </span>
          </h1>

          {/* Subtitle */}
          <p className="mx-auto mt-6 max-w-2xl text-base text-muted-foreground sm:text-lg lg:text-xl leading-relaxed">
            Rabnix trains directly on your business knowledge base and policies. It answers customer questions with zero hallucinations, books appointments with conflict prevention, updates your CRM, and alerts your team when a human touch is needed.
          </p>

          {/* Call to Actions */}
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
            {isLoggedIn ? (
              <Button asChild size="lg" className="h-12 px-8 text-base shadow-md">
                <Link href="/dashboard">
                  Enter Your Workspace <ArrowRight className="size-4 ml-2" />
                </Link>
              </Button>
            ) : (
              <>
                <Button asChild size="lg" className="h-12 px-8 text-base shadow-md">
                  <Link href="/sign-up">
                    Start 7-Day Free Trial <ArrowRight className="size-4 ml-2" />
                  </Link>
                </Button>
                <Button asChild variant="outline" size="lg" className="h-12 px-8 text-base">
                  <Link href="/sign-in">Sign In to Dashboard</Link>
                </Button>
              </>
            )}
          </div>

          {/* Quick Trust Checks */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="size-4 text-emerald-500" /> 7-Day Pro Trial (No CC Required)
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="size-4 text-emerald-500" /> Official WhatsApp Cloud API
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="size-4 text-emerald-500" /> Zero Double-Booking Guarantee
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="size-4 text-emerald-500" /> Strict Data Isolation
            </span>
          </div>

          {/* Interactive Live Preview Component */}
          <div className="mt-14">
            <LandingInteractivePreview />
          </div>
        </div>
      </section>

      {/* Metrics Strip */}
      <section className="border-y border-border/60 bg-muted/30 py-10">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 gap-6 md:grid-cols-4 text-center">
            <div>
              <p className="text-3xl font-extrabold tracking-tight text-foreground md:text-4xl">&lt; 2s</p>
              <p className="mt-1 text-xs text-muted-foreground font-medium">Median WhatsApp Reply Latency</p>
            </div>
            <div>
              <p className="text-3xl font-extrabold tracking-tight text-emerald-600 dark:text-emerald-400 md:text-4xl">94.8%</p>
              <p className="mt-1 text-xs text-muted-foreground font-medium">Autonomous AI Resolution</p>
            </div>
            <div>
              <p className="text-3xl font-extrabold tracking-tight text-foreground md:text-4xl">100%</p>
              <p className="mt-1 text-xs text-muted-foreground font-medium">Conflict-Free Booking Locks</p>
            </div>
            <div>
              <p className="text-3xl font-extrabold tracking-tight text-foreground md:text-4xl">24 / 7</p>
              <p className="mt-1 text-xs text-muted-foreground font-medium">Round-the-Clock Availability</p>
            </div>
          </div>
        </div>
      </section>

      {/* Core Capabilities Section */}
      <section id="features" className="py-20 md:py-28">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <Badge variant="outline" className="mb-3 text-xs uppercase tracking-wider">
              Autonomous Operating System
            </Badge>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Everything Your Business Needs to Automate Front-Office Operations
            </h2>
            <p className="mt-4 text-muted-foreground text-base sm:text-lg">
              Not a generic chatbot builder. Rabnix acts as a fully trained digital employee with autonomous tool execution, strict database safeguards, and multi-channel reach.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {/* Feature 1 */}
            <Card className="flex flex-col justify-between border-border/80 transition-all hover:border-primary/40 hover:shadow-lg">
              <CardHeader>
                <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary mb-2">
                  <MessageSquare className="size-5" />
                </div>
                <CardTitle className="text-lg">WhatsApp Cloud API &amp; Web Widget</CardTitle>
                <CardDescription>
                  Meet your customers wherever they are. Connect your official WhatsApp Business number or drop a 1-line script onto your website for embedded chat.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0 text-xs text-muted-foreground">
                <div className="rounded-md bg-muted/50 p-2.5 space-y-1">
                  <div className="flex items-center gap-1.5 font-medium text-foreground">
                    <CheckCircle2 className="size-3.5 text-emerald-500" /> Unified Inbox
                  </div>
                  <p>All chats route into your single workspace conversation viewer with real-time sync.</p>
                </div>
              </CardContent>
            </Card>

            {/* Feature 2 */}
            <Card className="flex flex-col justify-between border-border/80 transition-all hover:border-primary/40 hover:shadow-lg">
              <CardHeader>
                <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary mb-2">
                  <FileText className="size-5" />
                </div>
                <CardTitle className="text-lg">RAG Knowledge Base (Zero AI Slop)</CardTitle>
                <CardDescription>
                  Upload PDFs, brochures, pricing sheets, or FAQs. The AI indexes and retrieves exact facts, guaranteeing no fake promises or hallucinated pricing.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0 text-xs text-muted-foreground">
                <div className="rounded-md bg-muted/50 p-2.5 space-y-1">
                  <div className="flex items-center gap-1.5 font-medium text-foreground">
                    <CheckCircle2 className="size-3.5 text-emerald-500" /> Grounded Fact Retrieval
                  </div>
                  <p>Postgres full-text search with automatic chunking and document verification.</p>
                </div>
              </CardContent>
            </Card>

            {/* Feature 3 */}
            <Card className="flex flex-col justify-between border-border/80 transition-all hover:border-primary/40 hover:shadow-lg">
              <CardHeader>
                <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary mb-2">
                  <Calendar className="size-5" />
                </div>
                <CardTitle className="text-lg">Smart Booking &amp; Slot Management</CardTitle>
                <CardDescription>
                  Define service durations, operating hours, and staff availability. The AI checks open slots and books appointments transactionally with zero overlaps.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0 text-xs text-muted-foreground">
                <div className="rounded-md bg-muted/50 p-2.5 space-y-1">
                  <div className="flex items-center gap-1.5 font-medium text-foreground">
                    <CheckCircle2 className="size-3.5 text-emerald-500" /> Anti-Double Booking
                  </div>
                  <p>Database-level unique constraints and automated customer reminders.</p>
                </div>
              </CardContent>
            </Card>

            {/* Feature 4 */}
            <Card className="flex flex-col justify-between border-border/80 transition-all hover:border-primary/40 hover:shadow-lg">
              <CardHeader>
                <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary mb-2">
                  <Headphones className="size-5" />
                </div>
                <CardTitle className="text-lg">1-Click Human Takeover</CardTitle>
                <CardDescription>
                  When a customer requests a human or an edge-case arises, Rabnix instantly pauses AI replies and notifies your team via dashboard, WhatsApp, or email.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0 text-xs text-muted-foreground">
                <div className="rounded-md bg-muted/50 p-2.5 space-y-1">
                  <div className="flex items-center gap-1.5 font-medium text-foreground">
                    <CheckCircle2 className="size-3.5 text-emerald-500" /> Smooth Handover
                  </div>
                  <p>Staff can reply directly from the dashboard and return control to AI anytime.</p>
                </div>
              </CardContent>
            </Card>

            {/* Feature 5 */}
            <Card className="flex flex-col justify-between border-border/80 transition-all hover:border-primary/40 hover:shadow-lg">
              <CardHeader>
                <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary mb-2">
                  <Users className="size-5" />
                </div>
                <CardTitle className="text-lg">Built-in CRM &amp; Lead Tracker</CardTitle>
                <CardDescription>
                  Every customer who reaches out is organized with contact details, tags, lead stage, and full booking history. Export to CSV in a single click.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0 text-xs text-muted-foreground">
                <div className="rounded-md bg-muted/50 p-2.5 space-y-1">
                  <div className="flex items-center gap-1.5 font-medium text-foreground">
                    <CheckCircle2 className="size-3.5 text-emerald-500" /> Auto Profile Sync
                  </div>
                  <p>AI extracts customer names, emails, and preferences during the flow.</p>
                </div>
              </CardContent>
            </Card>

            {/* Feature 6 */}
            <Card className="flex flex-col justify-between border-border/80 transition-all hover:border-primary/40 hover:shadow-lg">
              <CardHeader>
                <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary mb-2">
                  <Lock className="size-5" />
                </div>
                <CardTitle className="text-lg">Multi-Tenant &amp; AES-256 Encrypted</CardTitle>
                <CardDescription>
                  Strict data isolation by design. Your API keys, Meta Cloud tokens, and customer records are encrypted at rest with zero cross-tenant leakage.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0 text-xs text-muted-foreground">
                <div className="rounded-md bg-muted/50 p-2.5 space-y-1">
                  <div className="flex items-center gap-1.5 font-medium text-foreground">
                    <CheckCircle2 className="size-3.5 text-emerald-500" /> Enterprise-Grade Privacy
                  </div>
                  <p>Isolated schema queries, custom auth session tokens, and team invite controls.</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="border-t border-border/60 bg-muted/20 py-20 md:py-28">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <Badge variant="outline" className="mb-3 text-xs uppercase tracking-wider">
              Effortless Setup
            </Badge>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              From Zero to Live AI Assistant in 3 Steps
            </h2>
            <p className="mt-4 text-muted-foreground text-base sm:text-lg">
              No machine learning engineers or complex webhook programming needed.
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-3">
            {/* Step 1 */}
            <div className="relative rounded-xl border border-border/60 bg-card p-6 shadow-xs">
              <div className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold text-sm mb-4">
                1
              </div>
              <h3 className="text-lg font-semibold text-foreground">Configure Business Profile</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                Enter your business name, timezone, operating hours, service list, pricing, and custom AI persona (e.g. friendly clinic receptionist).
              </p>
            </div>

            {/* Step 2 */}
            <div className="relative rounded-xl border border-border/60 bg-card p-6 shadow-xs">
              <div className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold text-sm mb-4">
                2
              </div>
              <h3 className="text-lg font-semibold text-foreground">Upload Knowledge Base</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                Drag-and-drop PDFs, service brochures, FAQs, or refund policies. The system automatically chunks and indexes your facts.
              </p>
            </div>

            {/* Step 3 */}
            <div className="relative rounded-xl border border-border/60 bg-card p-6 shadow-xs">
              <div className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold text-sm mb-4">
                3
              </div>
              <h3 className="text-lg font-semibold text-foreground">Connect WhatsApp or Web</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                Connect via Meta Cloud API or copy your embeddable web chat snippet. Your assistant immediately begins answering and booking 24/7.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Industry Solutions */}
      <section id="channels" className="py-20 md:py-28">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <Badge variant="outline" className="mb-3 text-xs uppercase tracking-wider">
              Tailored For Service Businesses
            </Badge>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Engineered for High-Touch Customer Communication
            </h2>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-lg border border-border/60 bg-card p-5">
              <h4 className="font-semibold text-foreground">🏥 Clinics &amp; Healthcare</h4>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Triage patient inquiries, explain appointment prep guidelines, and schedule doctor visits without keeping receptionists on hold.
              </p>
            </div>

            <div className="rounded-lg border border-border/60 bg-card p-5">
              <h4 className="font-semibold text-foreground">💇 Salons &amp; Luxury Spas</h4>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Showcase service packages, check stylist availability in real time, and send automated appointment reminder notifications.
              </p>
            </div>

            <div className="rounded-lg border border-border/60 bg-card p-5">
              <h4 className="font-semibold text-foreground">🏢 Real Estate &amp; Builders</h4>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Qualify incoming buyer leads, share project brochures and pricing PDFs, and schedule site visits directly into your calendar.
              </p>
            </div>

            <div className="rounded-lg border border-border/60 bg-card p-5">
              <h4 className="font-semibold text-foreground">🏋 Gyms &amp; Fitness Centers</h4>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Answer membership inquiries, book trial workout sessions, and share trainer schedules and class timings automatically.
              </p>
            </div>

            <div className="rounded-lg border border-border/60 bg-card p-5">
              <h4 className="font-semibold text-foreground">🎓 Coaching &amp; Education</h4>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Guide prospective students through course details, fee structures, batch schedules, and free demo class bookings.
              </p>
            </div>

            <div className="rounded-lg border border-border/60 bg-card p-5">
              <h4 className="font-semibold text-foreground">💼 Legal &amp; Professional Services</h4>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Capture case details, share consultation policies, and schedule introductory discovery meetings with senior partners.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="border-t border-border/60 bg-muted/20 py-20 md:py-28">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <Badge variant="outline" className="mb-3 text-xs uppercase tracking-wider">
              Transparent Pricing
            </Badge>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Simple, Predictable Plans for Growing Teams
            </h2>
            <p className="mt-4 text-muted-foreground text-base sm:text-lg">
              Start with a full 7-day Pro free trial. Upgrade or switch anytime.
            </p>
          </div>

          <div className="grid gap-8 lg:grid-cols-3 items-stretch">
            {/* Basic Plan */}
            <Card className="flex flex-col justify-between border-border/80 bg-card">
              <CardHeader>
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Basic
                </div>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-3xl font-extrabold text-foreground">₹999</span>
                  <span className="text-sm text-muted-foreground">/ month</span>
                </div>
                <CardDescription className="mt-2">
                  Ideal for businesses looking for an AI web chatbot widget.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-2.5 text-xs text-muted-foreground">
                  <li className="flex items-center gap-2 text-foreground font-medium">
                    <CheckCircle2 className="size-4 text-emerald-500 shrink-0" /> Web Chat Widget (Embeddable)
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="size-4 text-emerald-500 shrink-0" /> Up to 3 Staff Members
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="size-4 text-emerald-500 shrink-0" /> 25 Knowledge Base Documents
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="size-4 text-emerald-500 shrink-0" /> Automated Appointment Booking
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="size-4 text-emerald-500 shrink-0" /> CRM &amp; Lead Management
                  </li>
                  <li className="flex items-center gap-2 text-muted-foreground/60">
                    <span className="size-4 text-center">—</span> WhatsApp Integration (Pro Only)
                  </li>
                </ul>

                <Button asChild variant="outline" className="w-full mt-6">
                  <Link href="/sign-up">Start Free Trial</Link>
                </Button>
              </CardContent>
            </Card>

            {/* Pro Plan (Highlighted) */}
            <Card className="relative flex flex-col justify-between border-2 border-primary bg-card shadow-xl shadow-primary/5">
              <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-0.5 text-xs font-semibold text-primary-foreground">
                Most Popular · 7-Day Free Trial
              </div>
              <CardHeader>
                <div className="text-xs font-semibold uppercase tracking-wider text-primary">
                  Pro (WhatsApp + Web)
                </div>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-3xl font-extrabold text-foreground">₹1,499</span>
                  <span className="text-sm text-muted-foreground">/ month</span>
                </div>
                <CardDescription className="mt-2">
                  Complete multi-channel AI automation on WhatsApp &amp; Web.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-2.5 text-xs text-muted-foreground">
                  <li className="flex items-center gap-2 text-foreground font-medium">
                    <CheckCircle2 className="size-4 text-emerald-500 shrink-0" /> Official WhatsApp Cloud API
                  </li>
                  <li className="flex items-center gap-2 text-foreground font-medium">
                    <CheckCircle2 className="size-4 text-emerald-500 shrink-0" /> Embeddable Web Chat Widget
                  </li>
                  <li className="flex items-center gap-2 text-foreground font-medium">
                    <CheckCircle2 className="size-4 text-emerald-500 shrink-0" /> Unlimited Team Members &amp; Seats
                  </li>
                  <li className="flex items-center gap-2 text-foreground font-medium">
                    <CheckCircle2 className="size-4 text-emerald-500 shrink-0" /> Unlimited Knowledge Documents
                  </li>
                  <li className="flex items-center gap-2 text-foreground font-medium">
                    <CheckCircle2 className="size-4 text-emerald-500 shrink-0" /> 1-Click Human Takeover &amp; Alerts
                  </li>
                  <li className="flex items-center gap-2 text-foreground font-medium">
                    <CheckCircle2 className="size-4 text-emerald-500 shrink-0" /> Advanced Analytics &amp; CSV Exports
                  </li>
                </ul>

                <Button asChild className="w-full mt-6 shadow-md">
                  <Link href="/sign-up">Start 7-Day Free Pro Trial</Link>
                </Button>
              </CardContent>
            </Card>

            {/* Lifetime Deal */}
            <Card className="flex flex-col justify-between border-border/80 bg-card">
              <CardHeader>
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Lifetime Deal
                </div>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-3xl font-extrabold text-foreground">₹20,000</span>
                  <span className="text-sm text-muted-foreground">/ one-time</span>
                </div>
                <CardDescription className="mt-2">
                  Pay once and own Pro forever — zero monthly or annual renewal fees.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-2.5 text-xs text-muted-foreground">
                  <li className="flex items-center gap-2 text-foreground font-medium">
                    <CheckCircle2 className="size-4 text-emerald-500 shrink-0" /> Everything in Pro Tier Forever
                  </li>
                  <li className="flex items-center gap-2 text-foreground font-medium">
                    <CheckCircle2 className="size-4 text-emerald-500 shrink-0" /> Official WhatsApp + Web Widget
                  </li>
                  <li className="flex items-center gap-2 text-foreground font-medium">
                    <CheckCircle2 className="size-4 text-emerald-500 shrink-0" /> No Monthly Subscriptions
                  </li>
                  <li className="flex items-center gap-2 text-foreground font-medium">
                    <CheckCircle2 className="size-4 text-emerald-500 shrink-0" /> Unlimited Workspaces &amp; RAG
                  </li>
                  <li className="flex items-center gap-2 text-foreground font-medium">
                    <CheckCircle2 className="size-4 text-emerald-500 shrink-0" /> All Future Updates Included
                  </li>
                </ul>

                <Button asChild variant="outline" className="w-full mt-6">
                  <Link href="/sign-up">Get Lifetime Access</Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="py-20 md:py-28">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <Badge variant="outline" className="mb-3 text-xs uppercase tracking-wider">
              Answers &amp; Clarity
            </Badge>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Frequently Asked Questions
            </h2>
          </div>

          <div className="space-y-4">
            <div className="rounded-lg border border-border/60 bg-card p-5">
              <h3 className="text-base font-semibold text-foreground">
                Do I need a separate WhatsApp Business phone number?
              </h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                Yes, for the official WhatsApp Cloud API, you register a dedicated phone number (mobile or landline) through your Meta Business Manager. Alternatively, you can use our embeddable web chat widget without any Meta account required.
              </p>
            </div>

            <div className="rounded-lg border border-border/60 bg-card p-5">
              <h3 className="text-base font-semibold text-foreground">
                How does Rabnix prevent double-booking appointments?
              </h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                Rabnix manages appointment slots with transactional locks in Postgres. Before confirming any booking with a customer, the AI executes a database availability check tool to guarantee the selected staff member and timeframe are vacant.
              </p>
            </div>

            <div className="rounded-lg border border-border/60 bg-card p-5">
              <h3 className="text-base font-semibold text-foreground">
                Can human staff intervene in ongoing AI conversations?
              </h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                Absolutely. With our 1-Click Human Takeover feature, any team member can pause the AI and reply directly from the dashboard. When you&apos;re done, simply hit &quot;Hand back to AI&quot; to resume autonomous answering.
              </p>
            </div>

            <div className="rounded-lg border border-border/60 bg-card p-5">
              <h3 className="text-base font-semibold text-foreground">
                What AI models power Rabnix?
              </h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                Rabnix is built on an enterprise provider-agnostic core, featuring Google Gemini 2.5/Flash as default and Anthropic Claude as an alternate, equipped with intelligent tool calling and vector retrieval.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Bottom CTA Banner */}
      <section className="border-t border-border/60 bg-primary/5 py-16">
        <div className="mx-auto max-w-4xl px-4 text-center">
          <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl text-foreground">
            Ready to Automate Customer Inquiries &amp; Bookings?
          </h2>
          <p className="mt-4 text-base text-muted-foreground sm:text-lg">
            Join hundreds of clinics, spas, and service businesses delivering instant 24/7 replies on WhatsApp and web.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
            <Button asChild size="lg" className="h-12 px-8 text-base shadow-md">
              <Link href="/sign-up">
                Start 7-Day Free Pro Trial <ArrowRight className="size-4 ml-2" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="h-12 px-8 text-base">
              <Link href="/sign-in">Sign In to Existing Workspace</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/60 bg-background py-10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground font-bold text-xs">
              R
            </div>
            <span className="font-semibold text-foreground">Rabnix AI Assistant</span>
            <span>© {new Date().getFullYear()} All rights reserved.</span>
          </div>
          <div className="flex items-center gap-6">
            <Link href="/sign-in" className="hover:text-foreground">
              Sign In
            </Link>
            <Link href="/sign-up" className="hover:text-foreground">
              Create Account
            </Link>
            <Link href="/dashboard" className="hover:text-foreground">
              Workspace Console
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
