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
  DATABASE_URL: z.string().url(),

  CLERK_SECRET_KEY: z.string().min(1).optional(),

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

  // ITERATION 1: knowledge retrieval uses Postgres full-text search — no
  // embeddings provider is needed. Reintroduce EMBEDDING_*/GEMINI_API_KEY when
  // semantic vector search is added back.
});

const clientSchema = z.object({
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1).optional(),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
});

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

/** Server-only env. Do not import into client components. */
export const env = parsedServer.data;

/** Safe to use in client components. */
export const clientEnv = parsedClient.data;
