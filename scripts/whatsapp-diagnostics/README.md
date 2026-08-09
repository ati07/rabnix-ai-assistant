# WhatsApp Cloud API — diagnostic scripts

One-off Node scripts used to debug the official WhatsApp Cloud API bring-up.
They are **not** part of the app build. Each reads the repo-root `.env` directly,
decrypts the stored access token **in memory**, and hits Meta's Graph API or the
local Postgres DB.

**Contract: these scripts never print secret values** (access token, API keys).
Keep it that way if you edit them.

Run from the repo root:

```bash
node scripts/whatsapp-diagnostics/<script>.mjs
```

| Script | What it does |
|---|---|
| `_env.mjs` | Shared helpers (`loadEnv`, `decryptToken`, `loadCloudApiContext`). Not run directly. |
| `health.mjs` | Reports `health_status.can_send_message` for phone / WABA / business + review/verification status. Start here when a send is blocked. |
| `debug-token.mjs` | Inspects the token (scopes/expiry via `/debug_token`) and reproduces the exact send so failures show Meta's raw error. `TEST_TO=<e164>` overrides the recipient. |
| `check-waba.mjs` | Lists apps subscribed to the WABA. Inbound only works if **our** app is listed. |
| `subscribe-waba.mjs` | Subscribes our app to the WABA (the fix for "shows in Meta but never reaches our webhook"). Verify with `check-waba.mjs`. |
| `test-gemini.mjs` | Probes Gemini model availability + free-tier quota. Pass model names as args, else checks a default set. |
| `fix-model.mjs` | Nulls out `business_config.llm_model` so the provider uses the env/default model instead of a pinned (possibly retired) one. |

Requires `postgres` (already a project dependency). Depend on `.env` keys:
`DATABASE_URL`, `ENCRYPTION_KEY`, `WHATSAPP_API_VERSION`, `GEMINI_API_KEY`.
