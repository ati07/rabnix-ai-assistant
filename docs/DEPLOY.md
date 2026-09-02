# Deployment

This app has **two deployables**. Understand this before deploying.

| Piece | What it does | Where it runs |
| --- | --- | --- |
| **Next.js web app** | Dashboard, landing, API webhooks, WhatsApp **Cloud API**, web widget | **Vercel** (serverless) |
| **Worker** (`npm run worker`) | Baileys (QR-scan) WhatsApp sockets + reminder/follow-up dispatch (polls every 15–30s) | A separate **always-on** host (Railway / Render / Fly / VPS). **Cannot run on Vercel.** |

WhatsApp **Cloud API works on Vercel alone** (Meta calls `/api/whatsapp/cloud/webhook`).
The worker is only needed for Baileys numbers and automatic reminder sending — defer it until required.

---

## Database (Neon Postgres)

- Neon only **hosts** Postgres. It does **not** manage migrations — we do, via drizzle-kit.
- Use the **pooled** connection string (host contains `-pooler`). The driver already sets
  `prepare: false` for pooler compatibility (`src/lib/db/index.ts`).

### Migration workflow — run migrations only when the SCHEMA changes

Normal UI/logic/deploys need **no** migration — just `git push` and Vercel redeploys.
Only when you edit `src/lib/db/schema.ts`:

```bash
# 1. generate the migration file from the schema change
npm run db:generate            # writes drizzle/xxxx.sql
git add drizzle/ src/lib/db/schema.ts
git commit -m "db: <what changed>"

# 2. apply it to the cloud DB (DATABASE_URL must point at Neon)
#    PowerShell:  $env:DATABASE_URL = "postgresql://...neon-pooler..."
#    bash:        export DATABASE_URL="postgresql://...neon-pooler..."
npm run db:migrate

# 3. push — Vercel redeploys against the now-migrated DB
git push
```

**Order matters:** migrate the DB *before* the code that expects the new column goes live,
or requests 500 on the missing column.

`db:migrate` uses whatever `DATABASE_URL` is set to (drizzle-kit reads `.env.local` then `.env`).
Vercel does **not** run migrations automatically.

---

## Deploy the Next.js app to Vercel

1. Push `main` to GitHub (already the remote).
2. Vercel → **Add New → Project** → import the repo. Framework auto-detects as **Next.js**;
   leave build/output defaults. (No `vercel.json` needed.)
3. Add **Environment Variables** (Production). `.env` is gitignored, so nothing carries over.

   **Required**
   - `DATABASE_URL` — Neon **pooled** URL
   - `GEMINI_API_KEY` — default LLM provider
   - `ENCRYPTION_KEY` — 32-byte secret (encrypts tenant tokens at rest)
   - `META_APP_SECRET` — verifies inbound WhatsApp webhook signatures
   - `NEXT_PUBLIC_APP_URL` — the live https origin (see step 5); baked in at build time

   **Optional (only if the feature is used)**
   - `DEFAULT_LLM_PROVIDER` (default `gemini`), `GEMINI_MODEL`, `ANTHROPIC_API_KEY`
   - `RESEND_API_KEY` + `EMAIL_FROM` (email reminders / invites)
   - `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`,
     `RAZORPAY_PLAN_*`, `NEXT_PUBLIC_RAZORPAY_KEY_ID` (billing)
   - `WHATSAPP_API_VERSION` (default `v21.0`)

   **Do NOT set** — vestigial, ignored by the code:
   `CLERK_*` (auth is custom), `OPENAI_API_KEY`, `EMBEDDING_*` (knowledge uses Postgres FTS).

4. Deploy.
5. **Fix the public URL:** after the first deploy, copy the `https://<app>.vercel.app` URL,
   set `NEXT_PUBLIC_APP_URL` to it, and **redeploy** (it's inlined at build time).
   Update again when you attach a custom domain.
6. **Webhooks** (point external services at the live app):
   - Meta WhatsApp Cloud API → `https://<app>.vercel.app/api/whatsapp/cloud/webhook`
   - Razorpay → `https://<app>.vercel.app/api/billing/webhook`

---

## Deferred until you add the worker

On a Vercel-only deploy these stay dormant:

1. **Baileys (QR-scan) WhatsApp numbers** — Cloud API works without the worker; Baileys does not.
2. **Automatic reminder / follow-up sending** — dispatched by the worker's poll loop.
   Later, either run the worker on an always-on host, or add a **Vercel Cron** route that
   calls the dispatch logic on a schedule.

---

## Secrets note

Live keys (Razorpay `rzp_live_*`, DB password, provider keys, `ENCRYPTION_KEY`) live only in
`.env` locally (gitignored) and in the Vercel dashboard. Never commit them. Live Razorpay keys
charge real cards — use test keys until you're ready to take real payments.
