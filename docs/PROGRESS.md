# Rabnix AI Assistant — Progress & Architecture

> **Purpose of this doc:** the single place to re-orient when returning to the
> project. It records what the app is, what's built, how the pieces fit, how to
> run it, and what's left. Keep it updated as work lands.
>
> **Status as of 2026-08-06:** all planned build phases are complete. The app
> builds, typechecks, and lints clean. Not yet exercised end-to-end against live
> WhatsApp/email credentials (needs `.env` secrets — see [Environment](#environment)).

---

## 1. What this app is

A **multi-tenant SaaS** where any business (clinic, real-estate, school, shop,
restaurant, …) connects WhatsApp and an AI assistant understands its business
logic and auto-replies to customers — answering questions, booking
appointments, notifying staff, and escalating to a human when needed.

- **Tenant = a Clerk Organization = a Workspace.** Every business-owned row
  carries `tenantId`; that is the isolation boundary for the entire app.
- The AI is **channel-agnostic** and **provider-agnostic** by design (see
  [Architectural seams](#5-architectural-seams)).

---

## 2. Architecture at a glance

Two deployables sharing one Postgres database:

| Deployable | What it is | Responsible for |
|---|---|---|
| **Web app** (`next dev` / `next start`) | Next.js 16 App Router | Dashboard UI, server actions, Cloud API webhook, knowledge upload |
| **Worker** (`npm run worker`) | Standalone Node process (`tsx src/worker/index.ts`) | Holds long-lived Baileys sockets (one per tenant), routes inbound msgs through the brain, runs the reminder scheduler |

**Why two:** Baileys (unofficial WhatsApp) needs a persistent socket + session
state that can't live in serverless route handlers. The official **Cloud API is
webhook-driven**, so it needs *no* worker — inbound arrives at a Next API route
and outbound is a stateless Graph call.

Locked decisions (still governing):
- **WhatsApp hybrid:** Baileys now + official Cloud API, both behind one
  `WhatsAppChannel` seam. Tenants pick per workspace.
- **AI provider-agnostic:** Google **Gemini** (`gemini-2.5-flash`) is the active
  default via an `LLMProvider` interface. Anthropic Claude (`claude-opus-4-8`)
  remains implemented as an alternate — switch per tenant via
  `business_config.llm_provider`, or deployment-wide via `DEFAULT_LLM_PROVIDER`.
- **Knowledge = structured config + Postgres full-text search.** NO embeddings /
  pgvector in iteration 1. (If semantic search returns, use Gemini, not OpenAI.)
- **Drizzle ORM + postgres.js**, **Clerk** auth, **dev local first**.

---

## 3. Tech stack

- **Next.js 16.3** (App Router, React 19, Turbopack). ⚠️ Modified Next — see
  [Gotchas](#8-gotchas--things-to-remember).
- **TypeScript**, **Tailwind v4**, **shadcn/ui** (Radix) components.
- **Drizzle ORM 0.45** + **postgres.js** → Postgres (Supabase in prod, local in dev).
- **Clerk** (`@clerk/nextjs`) auth with Organizations enabled.
- **Google GenAI SDK** (`@google/genai`) for the LLM (default); **Anthropic SDK**
  (`@anthropic-ai/sdk`) as an alternate provider.
- **Baileys** (unofficial WhatsApp) + **WhatsApp Cloud API** (official, via `fetch`).
- **Resend** transactional email (via `fetch`, no SDK).
- **zod** validation, **sonner** toasts, **lucide-react** icons.
- No date library and no chart library (kept lean — timezone math and charts are hand-rolled).

---

## 4. Feature status & file map

Everything below is **implemented**. Paths are the source of truth.

### Foundation
- **Auth / tenancy** — `src/lib/tenant.ts` (`getActiveTenant`/`requireTenant`;
  tenant auto-created from the active Clerk org). Route protection in
  `src/proxy.ts` (only `/dashboard(.*)` is protected; webhook is public).
- **DB schema** — `src/lib/db/schema.ts`; client in `src/lib/db/index.ts`.
  Migrations via drizzle-kit (`npm run db:generate` / `db:migrate` / `db:push`).
- **Env** — `src/lib/env.ts` (zod-validated server + client env).

### AI brain
- **Orchestrator** — `src/lib/ai/brain.ts` (`handleIncomingMessage`): persists
  inbound msg, builds the tenant system prompt, runs the provider tool-use loop,
  persists the reply, returns text for the channel to send. Channel-agnostic.
- **Provider seam** — `src/lib/ai/provider.ts` (interface) +
  `providers/index.ts` (`getProvider`) +
  `providers/gemini.ts` (**default**, `@google/genai` function-calling loop) +
  `providers/anthropic.ts` (alternate; adaptive thinking, `effort: high`,
  prompt caching). Each provider runs the same manual agentic tool-use loop.
- **System prompt** — `src/lib/ai/prompt.ts` (built from business config).
- **Tools (declarations)** — `src/lib/ai/tools.ts`.
- **Tools (executor)** — `src/lib/ai/actions.ts` (`makeToolExecutor`): dispatches
  `search_knowledge`, `get_customer`, `update_customer`, `check_availability`,
  `book_appointment`, `notify_staff`, `schedule_reminder`, `escalate_to_human`.
  All tenant-scoped.

### Knowledge base (RAG, FTS)
- **Retrieval** — `src/lib/ai/rag.ts` (`searchKnowledge`, Postgres FTS).
- **Chunking** — `src/lib/ai/chunk.ts`.
- **Upload/ingest** — `src/app/api/knowledge/upload/route.ts` (PDF via
  **pdf-parse v2** `PDFParse` class).
- **UI** — `src/app/dashboard/knowledge/{page,actions}.tsx` +
  `src/components/dashboard/knowledge-manager.tsx`.

### Business config
- `src/app/dashboard/business/{page,actions}.tsx` +
  `src/components/dashboard/business-config-form.tsx` (hours, services, FAQs,
  persona, timezone, business type).

### WhatsApp — two channels behind one seam
- **Seam** — `src/lib/whatsapp/channel.ts` (`WhatsAppChannel`, `ChannelHandlers`,
  `InboundWAMessage`, `ConnectionStatus`).
- **Baileys (unofficial, QR)** — `src/lib/whatsapp/baileys-channel.ts`,
  auth persisted to Postgres via `db-auth-state.ts`, `logger.ts`.
  Status route: `src/app/api/whatsapp/status/route.ts`.
- **Cloud API (official, webhook)** — `src/lib/whatsapp/cloud-api.ts` (stateless
  Graph send, webhook parsing, tenant resolution by phone_number_id / verify
  token, `X-Hub-Signature-256` verification). Webhook route:
  `src/app/api/whatsapp/cloud/webhook/route.ts` (GET verify handshake, POST
  inbound). Config saved encrypted via `src/app/dashboard/whatsapp/cloud-actions.ts`.
- **UI** — `src/app/dashboard/whatsapp/page.tsx` (tabbed: Cloud API + QR) +
  `whatsapp-connect.tsx` (QR) + `cloud-api-setup.tsx` (Cloud API form).
- **Secret storage** — `src/lib/crypto.ts` (AES-256-GCM; Cloud API access tokens
  encrypted at rest with `ENCRYPTION_KEY`).

### CRM
- `src/app/dashboard/customers/{page,actions}.tsx`,
  `customers/[id]/page.tsx`, `customers-list.tsx`, `customer-profile.tsx`.
  Searchable list + editable profile with appointment history and linked
  conversations.

### Staff & notifications
- **Staff** — `src/app/dashboard/staff/{page,actions}.tsx` +
  `staff-manager.tsx` (roles, per-channel notify prefs: dashboard/whatsapp/email).
- **Notifications feed** — `src/app/dashboard/notifications/{page,actions}.tsx` +
  `notifications-feed.tsx`.

### Scheduling & reminders
- **Scheduler** — `src/lib/scheduling/reminders.ts` (`dispatchDueReminders`),
  channel-agnostic: injected `WhatsAppSender` + optional `EmailSender`.
- **Runs in** — `src/worker/index.ts` (polls every 15s). Delivers WhatsApp via
  the live Baileys socket **or** stateless Cloud API, and email via Resend.

### Email
- `src/lib/email/index.ts` (`sendEmail` via Resend REST; `isEmailConfigured`).
  Gated on `RESEND_API_KEY` + `EMAIL_FROM`.

### Analytics
- `src/app/dashboard/analytics/page.tsx` + `components/dashboard/analytics/daily-volume.tsx`.
  KPIs (conversations, messages, new customers, appointments, handoffs, AI
  resolution %), daily message-volume chart, appointments-by-status, top
  services, channel split. Window selector `?days=7|30|90`. Timezone-correct
  day bucketing via `src/lib/time.ts` `dateKeyInZone`.

### Shared libs
- `src/lib/time.ts` — Intl-based timezone math (no date lib):
  `zonedTimeToUtc`, `weekdayKeyInZone`, `formatInZone`, `dateKeyInZone`,
  `parseHhMm`, `parseDate`, `parseDurationMinutes`.
- `src/lib/utils.ts` — `cn()`.

---

## 5. Architectural seams

The interfaces that keep the app swappable — respect these when extending:

1. **`WhatsAppChannel`** (`src/lib/whatsapp/channel.ts`) — inbound emits
   `InboundWAMessage`; outbound is `sendText`. Baileys implements it as a class;
   Cloud API is functional (webhook + Graph). The brain never knows which.
2. **`LLMProvider`** (`src/lib/ai/provider.ts`) — one method to run a tool-use
   turn. Swap models/providers here; default is Gemini `gemini-2.5-flash`
   (Anthropic `claude-opus-4-8` available as an alternate).
3. **`ToolExecutor`** (`src/lib/ai/actions.ts`) — the brain calls tools through
   `makeToolExecutor(ctx)`; every tool is tenant-scoped via `ToolContext`.
4. **Reminder senders** (`src/lib/scheduling/reminders.ts`) — `WhatsAppSender` /
   `EmailSender` are injected by the worker, so the scheduler is transport-free.

**Rule:** outbound sending lives in the worker/webhook, not in the brain. The
brain returns text and enqueues `reminders` rows; the scheduler delivers them.

---

## 6. Data model (Postgres, `src/lib/db/schema.ts`)

Core tables (all tenant-scoped unless noted):

- `tenants` — a workspace (maps to a Clerk org). Root of tenancy.
- `business_config` — persona, services, hours, FAQs, timezone, business type.
- `whatsapp_connections` — one per channel type per tenant. `channelType` =
  `baileys | cloud_api`; holds Baileys `sessionData` or encrypted
  `cloudApiConfig` (`phoneNumberId`, `wabaId`, `verifyToken`, `accessTokenCipher`).
- `documents` + `document_chunks` — knowledge base; FTS GIN index on chunk content.
- `conversations` + `messages` — chat history (dedup by `externalId`).
- `customers` — CRM (unique per `tenantId + phone`).
- `staff` — team members + `notifyChannels`.
- `appointments` — bookings; unique index prevents double-booking a staff slot.
- `reminders` — scheduler queue (`pending`→`sent`/`failed`); WhatsApp + email.
- `notifications` — dashboard feed + record of staff notifications.

Enums: `channel_type`, `connection_status`, `conversation_status`,
`message_direction`, `message_role`, appointment status/source, reminder
target/status, notify channel, staff role, business type.

---

## 7. Environment

Config is validated in `src/lib/env.ts`. Template: `.env.example` (gitignored
along with `.env` — the whole `.env*` pattern is ignored by the project).

**Required**
- `DATABASE_URL` — Postgres connection string.
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` — Clerk (enable Orgs).
- `GEMINI_API_KEY` — the LLM (default provider). Free tier at
  https://aistudio.google.com/apikey. `GEMINI_MODEL` overrides the model
  (default `gemini-2.5-flash`).

**Feature-gated (optional; features degrade gracefully when unset)**
- `ANTHROPIC_API_KEY` — only if switching a tenant to the Anthropic provider.
  Needs API credits on console.anthropic.com — a Claude.ai subscription does
  **not** fund the API (they are separate wallets).
- `DEFAULT_LLM_PROVIDER` — `gemini` (default) | `anthropic` | `openai`.
- `ENCRYPTION_KEY` — **required to use Cloud API** (encrypts access tokens at
  rest). Generate: `openssl rand -base64 32`.
- `META_APP_SECRET` — optional; verifies inbound webhook signatures in prod.
- `WHATSAPP_API_VERSION` — Graph API version (default `v21.0`).
- `RESEND_API_KEY` + `EMAIL_FROM` — enable email reminders. `EMAIL_FROM` must be
  a verified sender, e.g. `Rabnix <hello@yourdomain.com>`.
- `NEXT_PUBLIC_APP_URL` — must be publicly reachable for Meta webhooks in prod.

---

## 8. How to run (dev)

```bash
# 1. Install
npm install

# 2. Configure — copy .env.example to .env and fill DATABASE_URL, Clerk, GEMINI_API_KEY
#    (add ENCRYPTION_KEY / RESEND_* / META_APP_SECRET to exercise those features)

# 3. Database
npm run db:push          # or db:generate + db:migrate

# 4. Web app  (dashboard + Cloud API webhook)
npm run dev              # http://localhost:3000

# 5. Worker  (only needed for Baileys QR + reminder delivery)
npm run worker           # scan the QR it prints, or view it in the dashboard
```

Cloud-API-only tenants do **not** need the worker for inbound (webhook handles
it) — but the worker still delivers their reminders, so run it in production.

**To go live on official WhatsApp:** set `ENCRYPTION_KEY` + public
`NEXT_PUBLIC_APP_URL`, fill the Cloud API tab in the dashboard, then in Meta →
WhatsApp → Configuration paste the shown webhook URL + verify token and
subscribe to the `messages` field.

---

## 9. Gotchas & things to remember

- **The project is ESM** (`"type": "module"` in `package.json`). Required
  because `baileys@7` pulls in `whatsapp-rust-bridge`, an ESM-only package (its
  `exports` define only an `import` condition). Without `type: module`, `tsx`
  runs the worker through Node's CJS resolver and throws
  `ERR_PACKAGE_PATH_NOT_EXPORTED: No "exports" main defined … whatsapp-rust-bridge`.
  Keep tooling/config files ESM-compatible.
- **This is a modified Next.js 16.** Middleware is renamed to **`proxy.ts`**.
  `params`/`searchParams` in pages are **Promises** (`await` them). Read the
  local docs in `node_modules/next/dist/docs/` before writing Next-specific code
  (per `AGENTS.md`). The `AGENTS.md` self-writing block is re-added by `next dev`
  — commit it with your work rather than stripping it.
- **pdf-parse is v2** (`PDFParse` class), not v1. `new PDFParse({ data }).getText()`,
  `.destroy()` in `finally`.
- **No embeddings in iteration 1** — knowledge is Postgres FTS. Don't reach for
  pgvector/OpenAI.
- **Drizzle GROUP BY on a `sql` expression** can mismatch SELECT vs GROUP BY
  qualifiers (Postgres 42803). Group by output-column **ordinals** (`sql\`1\``)
  instead. (Fixed in analytics — see commit `40446f9`.)
- **Server actions**: authenticate + derive tenant from session (`requireTenant`),
  never trust a client-supplied tenantId; validate inputs with zod; return
  `ActionResult = { ok: true } | { ok: false; error }`.
- **Secrets**: never print secret values; access tokens are stored encrypted and
  never returned to the client.
- **Committing** (when asked): the Bash tool is **bash, not PowerShell** — don't
  use `@'...'@` here-strings; write the message to a file and `git commit -F`.
  CRLF warnings from git are benign. End commit messages with the
  `Co-Authored-By: Claude Opus 4.8` trailer.

---

## 10. What's left / next steps

Nothing on the original phase plan is outstanding. Candidate follow-ups (none
started):

- **Exercise end-to-end** with real `.env` secrets (Cloud API + email).
- **Staff invites** — connect `staff.clerkUserId` to real Clerk org invitations.
- **Analytics depth** — response-time / time-to-first-reply, CSV export.
- **Tests** — highest-value units: timezone math (`src/lib/time.ts`), webhook
  parsing (`cloud-api.ts`), reminder scheduler (`reminders.ts`), crypto round-trip.
- **Semantic search** — reintroduce embeddings (Gemini) + a vector index if FTS
  proves insufficient.

---

## 11. Commit history (build milestones)

```
40446f9  Fix analytics daily query GROUP BY error (42803)
d33186d  Add analytics dashboard module
168dbf7  Add official WhatsApp Cloud API channel
1d5b112  Wire email delivery for reminders (Resend)
0908c22  Add built-in CRM module (customers list + detail)
c1a53b3  Add staff management + notifications feed UI
2e928ad  Phase 4b-4d: wire AI action tools + reminder scheduler
7415be0  Phase 5: multi-tenant dashboard + AI/WhatsApp foundation
8c132b4  Initial commit: scaffold Next.js 16 app
```

For deeper product context, see `docs/PRD.md`.
```
```
