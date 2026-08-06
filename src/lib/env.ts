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

  DEFAULT_LLM_PROVIDER: z.enum(["anthropic", "openai"]).default("anthropic"),
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),

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
