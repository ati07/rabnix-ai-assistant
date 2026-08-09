import { loadEnv } from "./_env.mjs";

/**
 * Null out business_config.llm_model for all tenants so the provider falls back
 * to env GEMINI_MODEL / the code default instead of a pinned model that may 404
 * (e.g. gemini-2.5-flash is retired for new accounts). Idempotent.
 */
const env = loadEnv();
const { default: postgres } = await import("postgres");
const sql = postgres(env.DATABASE_URL, { max: 1 });
try {
  const res = await sql`
    update business_config set llm_model = null
    where llm_model is not null
    returning tenant_id`;
  console.log(`Cleared llm_model for ${res.length} tenant(s).`);
} catch (e) {
  console.error("ERROR:", e.message);
} finally {
  await sql.end();
}
