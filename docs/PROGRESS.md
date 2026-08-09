# Rabnix AI Assistant — Progress & Architecture

> **Purpose of this doc:** the single place to re-orient when returning to the
> project. It records what the app is, what's built, how the pieces fit, how to
> run it, and what's left. Keep it updated as work lands.
>
> **Status as of 2026-08-10:** all planned build phases are complete. The app
> builds and typechecks clean. **Official WhatsApp Cloud API** is exercised
> end-to-end on a Meta test number (inbound → brain → Gemini → dashboard). A
> third **embeddable web chat widget** channel is now live, with **human handover
> working across web and WhatsApp**. The only remaining gap is **outbound WhatsApp
> send on Baileys/templates**, gated by Meta account state (business verification
> / payment / production number), not by our code.

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

### Web chat widget (embeddable) — a third `web` channel
- **Why** — a fully-working customer channel with no Meta dependency: any tenant
  drops a `<script>` on their site and anonymous visitors chat with the same AI
  brain. Reuses `handleIncomingMessage` (no brain changes); `web` conversations
  show up in the existing Conversations dashboard.
- **Schema** — `web` added to `channel_type`; `web_chat_configs` table (one row
  per tenant, resolved by rotatable `publicKey`, never `tenantId`).
- **Public routes** (no auth, not under `/dashboard`) —
  `src/app/api/chat/[key]/{config,message,history}`. `history` is
  `dynamic=force-dynamic` + `cache-control: no-store` (polled live).
- **Iframe UI** — `src/app/embed/[key]/page.tsx` + `src/components/chat/chat-window.tsx`
  (visitor `sessionId` in `localStorage` = `customerId`; polls `/history` every 4s).
- **Loader** — `public/widget.js` (vanilla; derives app origin from its own
  `<script src>`, so all `/api/chat/*` calls are same-origin → no CORS).
- **Dashboard** — `src/app/dashboard/chatbot/{page,actions}.tsx` +
  `chatbot-settings.tsx` (enable, greeting, theme, launcher, copyable embed
  snippet, rotate key). Embed snippet uses `NEXT_PUBLIC_APP_URL` — it MUST be a
  live reachable origin or the embedded widget silently fails.
- **Test harness** — `scripts/web-chat-test/` (`test-widget.html`, `e2e.mts`).

### Human handover (all channels)
- **AI pause** — `human`/`closed` conversation status makes the brain persist the
  inbound message but return `reply:null`. Channel-agnostic.
- **Staff controls** — `src/components/dashboard/conversation-reply.tsx` (Take
  over / Hand back + composer; polls the thread live for any non-closed
  conversation) → `src/app/dashboard/conversations/[id]/actions.ts`
  (`sendStaffReply`, `setConversationStatus`).
- **Delivery** (`deliverToCustomer`) — `web`: no-op (widget polls). `cloud_api`:
  sent directly via `sendCloudApiToTenant` (stateless Graph, no worker needed).
  `baileys` (or a failed cloud_api send): enqueued as a `reminders` row the
  worker drains over the live socket.

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
- **Cloud API — WABA must be subscribed to *our* app.** Inbound webhooks only
  fire if `POST /{wabaId}/subscribed_apps` lists our Meta app. During bring-up the
  WABA was subscribed to Meta's sample "WA DevX Webhook Events" app instead, so
  messages reached Meta's test UI but never our webhook. Verify with
  `GET /{wabaId}/subscribed_apps`. Also: the phone/WABA/business are **separate
  Meta entities**, each with its own `can_send_message` in `GET
  /{id}?fields=health_status` — check all three when a send fails.
- **Cloud API — inbound resolves tenant from the DB, not `.env`.** The webhook
  looks up `whatsapp_connections.cloud_api_config.phoneNumberId`; the access token
  is decrypted from `accessTokenCipher` (never in `.env`). A `phone_number_id`
  that isn't in the DB → "no Cloud API connection" and a silent drop.
- **Committing** (when asked): the Bash tool is **bash, not PowerShell** — don't
  use `@'...'@` here-strings; write the message to a file and `git commit -F`.
  CRLF warnings from git are benign. End commit messages with the
  `Co-Authored-By: Claude Opus 4.8` trailer.

---

## 10. What's left / next steps

### ▶ RESUME HERE (last session: 2026-08-10)

**Web chat widget + cross-channel human handover are built, merged to `main`, and
working end-to-end.** This gives a fully-functional customer channel with no Meta
dependency (see [Web chat widget](#web-chat-widget-embeddable--a-third-web-channel)
and [Human handover](#human-handover-all-channels)). The widget, the live-updating
dashboard, and handover on both web and WhatsApp Cloud API were all verified.

**What got done this session (2026-08-10):**
- ✅ **Web widget verified end-to-end** — `scripts/web-chat-test/e2e.mts` exercises
  config/message/history + the full handover flow (takeover pauses AI, staff reply
  surfaces in history, hand-back resumes AI) against the live server + DB. 13/13.
- ✅ **Live visitor widget** — `/history` was served from browser cache, so staff
  replies didn't appear. Fixed with `no-store` on both client fetch and route.
- ✅ **Live dashboard thread** — `conversation-reply.tsx` only polled during human
  takeover, so staff saw nothing while the AI auto-replied. Now polls every 5s for
  any non-closed conversation (`7bcf131`).
- ✅ **Cloud API handover delivery (the big one)** — staff replies/takeover notices
  were enqueued as `reminders` rows drained ONLY by the worker, but a Cloud API
  tenant runs no worker (AI replies go out inline in the webhook) → handover sat
  `pending` forever. Fixed: `deliverToCustomer` sends `cloud_api` directly via
  `sendCloudApiToTenant`; only `baileys`/failed-send uses the queue (`7bcf131`).
- ✅ **Gemini rotation hardening** — removed retired `gemini-2.5-flash` (404) from
  the chain and made unavailable-model errors skip-and-rotate instead of 500ing
  (`570853b`).
- ⚠️ **Two stale `pending` handover reminders** to `917565091186` remain in the DB
  (pre-fix test messages). Left undelivered on purpose (a day old / would confuse
  the customer). Safe to delete; a running worker would otherwise send them stale.

**Note:** `NEXT_PUBLIC_APP_URL` in `.env` is a Cloudflare quick-tunnel that dies on
restart. For local widget testing it must be `http://localhost:3000` or a fresh
live tunnel, else the embedded widget silently fails to load.

---

### ▶ Earlier session (2026-08-09)

**Cloud API is wired up and working end-to-end on a Meta *test* number.** Meta
account access was restored, the webhook delivers, the brain replies with Gemini,
and replies persist to the dashboard. Everything below the "outbound send" line
is external Meta/Google account state, not code.

**What got done this session (all landed in the working tree):**
- ✅ **Inbound working.** Root cause of "messages not showing" was that the WABA
  was subscribed to Meta's *sample* app, not ours. Fixed by
  `POST /{wabaId}/subscribed_apps` with our app. Inbound resolves the tenant by
  `phone_number_id` from the DB (`whatsapp_connections.cloud_api_config`), NOT
  from `.env`. See the [WABA subscription gotcha](#9-gotchas--things-to-remember).
- ✅ **Duplicate-processing / "model turn" 400 fixed.** Meta re-sends slow
  webhooks → concurrent brain runs → history ending on an assistant turn (Gemini
  rejects it). Fixed with idempotency in `brain.ts` (`.returning()` +
  bail when `onConflictDoNothing` inserts nothing) and a trailing-model-turn
  guard in `gemini.ts`.
- ✅ **Gemini network resilience.** `gemini.ts` now retries transient failures
  (`ECONNRESET`/5xx/`fetch failed`) with backoff; 4xx (incl. 429) surface
  immediately.
- ✅ **Gemini model / quota.** Free-tier `gemini-flash-latest` (→ `gemini-3.6-flash`)
  is only ~20 req/day. `.env` `GEMINI_MODEL` is set to `gemini-3-flash-preview`
  (confirmed working). Real fix for volume = enable billing on the Gemini project.
- ✅ **Business profile filled** for the RABNIX tenant (from rabnix.com): display
  name, type, timezone `Asia/Kolkata`, languages en+hi, 6 services, 7 FAQs,
  policies, persona, hours Mon–Fri 09:00–21:00. Edit at `/dashboard/business`.
- ✅ **Conversations detail scroll fix** (`conversations/[id]/page.tsx`): message
  thread is a `Card` with `CardContent` capped at `max-h-[70vh] overflow-y-auto`
  so long threads scroll inside the box. Also set `body` to `h-full` in
  `src/app/layout.tsx`.

**⛔ Remaining gap — outbound WhatsApp send (Meta account state, not code):**
Reproduced the raw Graph send and queried `health_status`: WABA self-reports
`can_send_message: BLOCKED` — `141006` (payment method), `141010` (business not
verified), `131000` (incomplete business profile: Legal Name / Country /
Website). Phone-number and App entities are AVAILABLE. Also the temporary access
token keeps expiring (code `190`) — needs a **permanent System User token**.

**To reach production (get a real WhatsApp number that can message customers):**
1. **Business verification** (Business Settings → Security Center) + complete the
   business profile (Legal Name, Country, Website) + add a **payment method** to
   the WABA. These clear `141010` / `131000` / `141006`.
2. **Permanent token:** create a System User with `whatsapp_business_messaging` +
   `whatsapp_business_management`, generate a non-expiring token, re-save it in
   `/dashboard/whatsapp` (Cloud API tab). Stops the `190` expiries.
3. **Add + register a production phone number** in WhatsApp Manager (SMS/voice
   OTP; the number must not be active on the consumer WhatsApp app). It gets a
   new `phone_number_id` → put that in `/dashboard/whatsapp`. Register it for
   Cloud API with a 6-digit PIN.
4. **Stable public webhook URL:** replace the ephemeral `trycloudflare` quick
   tunnel with a fixed HTTPS domain (deploy, or a named tunnel); update
   `NEXT_PUBLIC_APP_URL` + the Meta callback URL. Set `META_APP_SECRET` (still
   empty) so inbound signatures are verified in prod.

Note: `sendCloudApiText` sends plain text only — fine inside the 24h customer
window; cold/reminder (business-initiated) messages need **approved templates**
(not built yet — see follow-ups).

---

Nothing on the original phase plan is outstanding. Candidate follow-ups (none
started):

- **WhatsApp message templates** — `sendCloudApiText` is plain-text only, which
  only works inside the 24h customer window. Business-initiated / reminder
  messages need approved templates + a template-send path in `cloud-api.ts`.
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
7bcf131  Fix web chat live updates and cross-channel handover delivery
570853b  Harden Gemini model rotation against retired models
(merge)  Web chat widget (embeddable `web` channel) + human handover
dc0088c  Add Google Gemini as default LLM provider
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
