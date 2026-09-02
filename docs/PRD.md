# Rabnix AI Assistant — Product Requirements Document

**Version:** 1.1 (merged canonical) · **Status:** Draft
**Last Updated:** 2026-08-06
**Product Owner:** Atiurrahman Ansari

> This PRD merges the product/governance PRD (v1.0) with the engineering
> architecture draft. Conflicts were resolved with the Product Owner on
> 2026-08-06 (see §22 Decision Log): **Postgres + Drizzle**, **hybrid WhatsApp
> (Baileys now → official Cloud API later)**, **built-in calendar (Google later)**.

---

## 1. Executive Summary

Rabnix AI Assistant is a **multi-tenant SaaS** for building and deploying
AI-powered **business assistants** — not a chatbot builder, but a platform for
creating "AI business employees" that understand a business, follow its rules, and
execute real workflows (answering, booking, CRM, escalation).

The MVP targets **WhatsApp only**. The architecture is channel-agnostic so
Instagram, Messenger, Telegram, web chat, email, and voice can be added later
without rework.

## 2. Vision & Mission

- **Vision:** Become the operating platform for AI-powered business assistants
  across communication channels.
- **Mission:** Let businesses automate customer communication and operations with
  AI — no programming required. Owners "train" the AI like a new employee.

## 3. Problem

SMBs lose time and leads answering repetitive questions, scheduling appointments,
qualifying leads, and handling routine admin. Existing chatbots are hard to
configure, lack real business understanding, and can't take meaningful actions.

## 4. Goals

The MVP lets a business, with no developer help:
connect WhatsApp · configure an AI provider · train the assistant on its business ·
upload knowledge · manage conversations · **book appointments** · maintain
**customer records (CRM)** · escalate to human staff · view basic analytics.

## 5. Success Metrics

- Stable multi-tenant architecture with strict data isolation.
- Secure authentication.
- Working WhatsApp integration.
- AI answers **only from approved business context** (config + RAG).
- Appointment booking works, with **no double-booking**.
- Human takeover works.
- Owners complete onboarding without a developer.
- Median WhatsApp reply latency < ~5s; % of chats resolved without handoff.

## 6. Target Customers

**Primary:** Clinics, Physiotherapy Centers, Hospitals, Diagnostic Centers.
**Secondary:** Salons, Restaurants, Gyms, Real Estate, Coaching Institutes,
service providers.

> Because primary customers are healthcare, compliance and reliability are
> first-class. This is why the **official WhatsApp Cloud API** is the intended
> production channel (Baileys is prototyping only — see §11).

## 7. User Roles

| Role | Responsibilities |
|---|---|
| **Platform Administrator** (us) | Operate the SaaS: workspace admin, system config, health. |
| **Business Owner** | Configure integrations, train the AI, manage settings, invite staff, review analytics. |
| **Staff Member** | View/take over conversations, manage appointments and CRM records. |
| **Customer** | Chats with the assistant over WhatsApp. |

## 8. Scope

### In MVP
Authentication · Workspace management · Business onboarding · Knowledge base
(**with RAG**) · WhatsApp integration · AI provider configuration · AI conversation
engine (**with tool use**) · Built-in CRM · Built-in calendar + appointment
management · **Reminders (customer + staff)** · Conversation management · Human
takeover · Analytics dashboard · Settings.

### Out of Scope (MVP)
Instagram · Messenger · Telegram · Voice AI · Email *automation* (transactional
staff emails are in) · White-label · Mobile app · Workflow/API marketplace ·
Payment gateway · Billing system · Advanced permissions beyond basic roles ·
Google Calendar sync (fast-follow).

## 9. Core Modules

Authentication · Workspace · Dashboard · Business Onboarding · Knowledge Base
(RAG) · WhatsApp Integration · AI Provider Configuration · AI Conversation Engine ·
Built-in CRM · Calendar & Appointment Management · Reminders · Conversation
Management · Human Takeover · Analytics · Settings.

Each module gets a spec under `docs/01-features` before implementation (§18).

## 10. AI Philosophy

- The AI **never invents** business information; every answer is grounded in
  **approved business context**: business profile, knowledge base (RAG), business
  rules, services, CRM data, conversation history.
- The AI **never accesses the database directly.** All reads/actions go through the
  application's **business layer** via validated **tools** (function calling).
- The AI decides: answer · ask a clarifying question · call a tool · escalate.

## 11. Product Principles

Simplicity over complexity · Configuration over customization · AI assists (does
not replace) business rules · Security by default · Multi-tenant from day one ·
Reusable components · Feature-based architecture · **Production-ready code only**
(this is why Baileys is prototyping-only and the official Cloud API is the
production target).

## 12. Feature Requirements

### 12.1 Onboarding & Tenancy (Workspace)
Clerk auth; each **workspace = tenant = Clerk Organization**. First org creation
bootstraps a `tenant` + empty `business_config`. All data scoped by `tenantId`.

### 12.2 Business Configuration
Business type, display name, timezone, hours, services (name/description/price/
duration/availability), FAQs, policies, languages, persona/tone, optional
system-prompt override, per-tenant LLM provider+model, `autoReplyEnabled` toggle.

### 12.3 Knowledge Base (RAG)
Upload PDF/text/URL/pasted text → extract → chunk → embed → `document_chunks`
(pgvector). At reply time, retrieve top-k relevant chunks and inject into context.
Structured config is authoritative for facts; RAG supplements.

### 12.4 AI Conversation Engine (channel- & provider-agnostic)
Single entry `handleIncomingMessage(tenant, from, text)`. Builds a system prompt
from config + retrieved chunks + recent history. `LLMProvider` interface
(Anthropic default, OpenAI). Runs a **tool-use loop**; persists messages;
updates conversations.

### 12.5 WhatsApp Integration (hybrid, abstracted)
`WhatsAppChannel` interface (`sendMessage`, inbound → brain).
**v1: Baileys (unofficial)** — QR pairing, runs in the **persistent worker**, per-
tenant session persistence. **Production/next: Cloud API (official)** — verified
webhook Route Handler, templates. Owner sees connection status.

### 12.6 Built-in CRM
`customers` per tenant (name, phone, tags, notes, custom fields, last-seen).
Auto-created/updated from conversations. AI can read CRM as context and update
records via tools. Staff can view/edit.

### 12.7 Calendar & Appointment Management (built-in)
Our DB is the **source of truth** for availability and bookings (enables
transactional **no-double-booking**). Services define duration + availability
rules. Behind a `CalendarProvider` interface so **Google Calendar sync** can be
added later without touching the brain.

### 12.8 AI Actions & Scheduling (tool use)
Tools the LLM may call (our code validates + executes):
`search_knowledge`, `get_customer` / `update_customer`, `check_availability`,
`book_appointment` / `reschedule` / `cancel`, `notify_staff`, `schedule_reminder`,
`escalate_to_human`.

### 12.9 Staff Notifications
On booking or handoff, notify staff via **WhatsApp message + in-dashboard
notification feed + email** (owner-configurable channels).

### 12.10 Reminders (customer + staff)
`schedule_reminder` writes to `reminders`; the **worker's scheduler** fires due
reminders. Customers reminded before appointments (e.g. 24h + 1h); staff get an
upcoming-appointment digest.

### 12.11 Conversation Management & Human Takeover
Live conversation viewer; manual reply. Status `open → needs_human → closed`.
When `needs_human`, AI stops auto-replying and staff take over.

### 12.12 Analytics
Basic dashboard: conversation volume, resolution/handoff rate, bookings, reply
latency, active customers.

## 13. Architecture

Two deployables sharing one Postgres:

- **Next.js app** — dashboard, auth, config APIs, RAG ingestion, CRM, analytics,
  Cloud API webhooks.
- **Persistent worker (Node service)** — holds Baileys sockets **and** runs the
  reminder scheduler.
- **Shared core** — channel/provider-agnostic brain + `LLMProvider`,
  `WhatsAppChannel`, `CalendarProvider` interfaces + tool implementations.

**Why two deployables:** unofficial WhatsApp needs a long-lived socket/session and
the scheduler needs an always-on process — neither fits serverless functions.

## 14. Technical Stack

| Concern | Choice |
|---|---|
| Framework | **Next.js 16** (App Router, React 19). ⚠️ Modified fork — **Middleware is renamed to Proxy** (`proxy.ts`); read `node_modules/next/dist/docs/` before writing Next code. |
| Language | TypeScript |
| Styling / UI | Tailwind CSS v4 · **shadcn/ui** · Lucide icons · next-themes · Sonner (toasts) |
| Forms / validation | React Hook Form · **Zod** |
| Client state / data | **Zustand** · **TanStack Query** |
| Auth | **Clerk** (Organizations = workspaces/tenants) |
| Database + vector | **Supabase Postgres + pgvector** |
| ORM / migrations | **Drizzle** + drizzle-kit |
| AI | Provider-agnostic — **Anthropic Claude** default, OpenAI optional |
| Embeddings | OpenAI `text-embedding-3-small` (1536-dim), platform key (decoupled from chat provider) |
| WhatsApp | Baileys (v1 proto) → **WhatsApp Cloud API** (production) |
| Worker host | Persistent Node service (Railway/Fly) — local first |

> Note: this replaces the v1.0 stack's **MongoDB + Prisma** (weak for RAG vector
> search and transactional booking) and adds RAG, TanStack Query, Zustand, RHF.

## 15. Data Model

**Implemented:** `tenants`, `users`, `business_config`, `whatsapp_connections`,
`documents`, `document_chunks` (vector), `conversations`, `messages`.
**Planned:** `customers` (CRM), `staff`, `appointments`, `reminders`,
`notifications`. All business rows carry `tenantId`. See `src/lib/db/schema.ts`.

## 16. Non-Functional Requirements

- **Isolation:** every query tenant-scoped; verified no cross-tenant leakage.
- **Booking integrity:** transactional slot reservation (unique constraint) — no
  double-booking.
- **Latency:** target < ~5s to first WhatsApp reply.
- **Secrets:** WhatsApp session data & Cloud API tokens encrypted at rest.
- **Reliability:** worker reconnects sessions and resumes the scheduler on restart.
- **Compliance:** healthcare-sensitive; prefer official API for production.

## 17. Documentation Structure (`docs/`)

`00-overview` (this PRD) · `01-features` (per-module specs) · `02-database` ·
`03-api` · `04-prompts` · `05-decisions` (ADRs) · `06-assets`.

## 18. Development Process

Per feature: **Spec → Review → Approval → Implementation → Code Review → Testing →
Approval → Commit → Merge.** No implementation before its spec is approved.

## 19. Milestones

1. Project Foundation · 2. Authentication · 3. Workspace · 4. Dashboard ·
5. Business Onboarding · 6. Knowledge Base (RAG) · 7. WhatsApp Integration ·
8. AI Conversation Engine (tool use) · 9. Built-in CRM · 10. Calendar &
Appointments · 11. Staff Notifications & Reminders · 12. Analytics.

## 20. Future Roadmap (post-MVP)

Official Cloud API hardening · Google Calendar sync · Instagram · Messenger ·
Telegram · Voice AI · Email automation · White-label · Workflow builder ·
Marketplace · Advanced reporting · Payments · Billing · Mobile app.

## 21. Definition of Success

A business can: create an account → create a workspace → train an AI assistant →
connect WhatsApp → configure an AI provider → upload knowledge → answer customer
questions **from that knowledge** → book appointments (no double-booking) → store
customer info (CRM) → get reminders → transfer to human staff → view analytics.

## 22. Decision Log

| Date | Decision |
|---|---|
| 2026-08-06 | **Postgres + Drizzle** (not MongoDB + Prisma) — RAG vector search + transactional booking + relational integrity. |
| 2026-08-06 | **Hybrid WhatsApp** — Baileys for prototyping, official Cloud API for production. |
| 2026-08-06 | **Built-in calendar** as source of truth; Google Calendar sync deferred. |
| 2026-08-06 | **AI actions in v1** — booking, multi-channel staff notify, customer+staff reminders. |
| 2026-08-06 | Embeddings via platform OpenAI key, decoupled from per-tenant chat provider. |

## 23. Open Questions

- Multi-language quality — which languages guaranteed at launch?
- Pricing model — flat per-tenant vs per-conversation (billing is post-MVP).
- Doc file storage — Supabase Storage vs local (v1 local).

## 24. Version History

| Version | Date | Description |
|---|---|---|
| 1.0 | 2026-08-06 | Initial product/governance PRD (MongoDB+Prisma, Google Calendar). |
| 1.1 | 2026-08-06 | Merged canonical: + RAG, two-deployable worker, tool-use scheduling, CRM/analytics stack; resolved DB/WhatsApp/calendar forks (§22). |
