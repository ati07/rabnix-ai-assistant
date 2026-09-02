import { z } from "zod";

/**
 * Centralised, validated environment access.
 *
 * Server-only secrets live in `serverSchema`. Anything the browser needs must be
 * prefixed `NEXT_PUBLIC_` and go in `clientSchema` (Next.js inlines those at build).
 *
 * Import `env` in server code only. For client components read `clientEnv`.
 */

const serverSchema = z.object({
  DATABASE_URL: z
    .string()
    .url()
    .default("postgresql://postgres:postgres@localhost:5432/rabnix"),

  DEFAULT_LLM_PROVIDER: z
    .enum(["gemini", "anthropic", "openai"])
    .default("gemini"),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default("gemini-flash-latest"),
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),

  // Transactional email (Resend). Both required to enable email delivery;
  // when unset, email reminders are marked failed with a clear reason.
  // EMAIL_FROM must be a verified sender, e.g. "Rabnix <hello@yourdomain.com>".
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),

  // Official WhatsApp Cloud API. ENCRYPTION_KEY (any strong secret) is required
  // to store tenant access tokens at rest — encryption fails loudly without it.
  // META_APP_SECRET, if set, verifies inbound webhook signatures.
  ENCRYPTION_KEY: z.string().optional(),
  META_APP_SECRET: z.string().optional(),
  WHATSAPP_API_VERSION: z.string().default("v21.0"),

  // Billing (Razorpay Subscriptions). KEY_ID/KEY_SECRET authorize API calls
  // (HTTP Basic); WEBHOOK_SECRET verifies inbound webhook signatures (HMAC).
  // The two PLAN ids come from Razorpay Dashboard → Subscriptions → Plans and
  // map our Pro tier's monthly/yearly billing. All optional so dev boots without
  // billing; when unset, checkout is disabled and everyone stays on Free.
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  RAZORPAY_PLAN_BASIC_MONTHLY: z.string().optional(),
  RAZORPAY_PLAN_BASIC_YEARLY: z.string().optional(),
  RAZORPAY_PLAN_PRO_MONTHLY: z.string().optional(),
  RAZORPAY_PLAN_PRO_YEARLY: z.string().optional(),

  // ITERATION 1: knowledge retrieval uses Postgres full-text search — no
  // embeddings provider is needed. Reintroduce EMBEDDING_*/GEMINI_API_KEY when
  // semantic vector search is added back.
});

const clientSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  // Razorpay Checkout needs the public key id in the browser. Non-secret.
  NEXT_PUBLIC_RAZORPAY_KEY_ID: z.string().optional(),
});

/**
 * Production hardening: several vars are `.optional()` so local dev and tests
 * boot with a minimal `.env`, but a real deployment must not start half-wired
 * (missing auth, no LLM key, an open webhook). When `NODE_ENV=production` we
 * fail fast at boot instead of throwing on the first request.
 *
 * Note: `next build` also runs with `NODE_ENV=production`. We skip the check
 * during the build phase so `npm run build` works without runtime secrets —
 * the enforcement fires on the running server (`next start` / the worker) where
 * these vars are actually needed.
 */
const IS_BUILD_PHASE = process.env.NEXT_PHASE === "phase-production-build";
const IS_PROD = process.env.NODE_ENV === "production" && !IS_BUILD_PHASE;

/** The env var that funds each LLM provider. */
const PROVIDER_KEY_VAR: Record<string, string> = {
  gemini: "GEMINI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
};

function productionRequirements(): string[] {
  if (!IS_PROD) return [];
  const missing: string[] = [];
  const require = (name: string, value: string | undefined) => {
    if (!value) missing.push(name);
  };

  // The default provider must have a funded key (tenants may override, but the
  // deployment default must work out of the box).
  const provider = process.env.DEFAULT_LLM_PROVIDER ?? "gemini";
  const keyVar = PROVIDER_KEY_VAR[provider];
  if (keyVar) require(`${keyVar} (DEFAULT_LLM_PROVIDER=${provider})`, process.env[keyVar]);

  // Cloud API is the production WhatsApp channel: tokens are stored encrypted
  // (ENCRYPTION_KEY) and inbound webhooks must be signature-verified
  // (META_APP_SECRET) once the URL is public.
  require("ENCRYPTION_KEY", process.env.ENCRYPTION_KEY);
  require("META_APP_SECRET", process.env.META_APP_SECRET);

  // The public origin must be a real HTTPS URL (Meta webhooks + embed widget).
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl || appUrl.startsWith("http://localhost")) {
    missing.push("NEXT_PUBLIC_APP_URL (must be a public https:// origin)");
  }

  return missing;
}

function format(errors: z.ZodError) {
  return errors.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
}

const parsedServer = serverSchema.safeParse(process.env);
if (!parsedServer.success) {
  throw new Error(
    `Invalid server environment variables:\n${format(parsedServer.error)}`,
  );
}

const parsedClient = clientSchema.safeParse(process.env);
if (!parsedClient.success) {
  throw new Error(
    `Invalid client environment variables:\n${format(parsedClient.error)}`,
  );
}

const missingInProd = productionRequirements();
if (missingInProd.length > 0) {
  throw new Error(
    `Missing required production environment variables (NODE_ENV=production):\n` +
      missingInProd.map((m) => `  - ${m}`).join("\n"),
  );
}

/** Server-only env. Do not import into client components. */
export const env = parsedServer.data;

/** Safe to use in client components. */
export const clientEnv = parsedClient.data;
