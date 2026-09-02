import { readFileSync } from "node:fs";

/**
 * DEV ONLY — reset a tenant's billing so you can re-test the purchase flows.
 *
 * Finds the tenant(s) OWNED by the given email, deletes their subscription
 * row(s) (drops Lifetime / recurring), and by default **expires the trial** so
 * the workspace lands on the real **Free** (locked) plan. Reads the repo-root
 * .env directly; never prints secrets.
 *
 *   node scripts/reset-billing.mjs you@example.com            # → Free (locked)
 *   node scripts/reset-billing.mjs you@example.com --trial    # → fresh 7-day Pro trial
 */

function loadEnv(path = "./.env") {
  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split(/\r?\n/)
      .filter((l) => l && !l.trimStart().startsWith("#") && l.includes("="))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
      }),
  );
}

const email = process.argv[2]?.trim().toLowerCase();
const freshTrial = process.argv.includes("--trial");
if (!email) {
  console.error("Usage: node scripts/reset-billing.mjs <email> [--trial]");
  process.exit(1);
}

const env = loadEnv();
const { default: postgres } = await import("postgres");
const sql = postgres(env.DATABASE_URL, { max: 1 });

try {
  const tenants = await sql`
    select t.id, t.name, t.slug
    from tenants t
    join users u on u.id = t.owner_user_id
    where lower(u.email) = ${email}`;
  if (tenants.length === 0) {
    console.error(`No tenant owned by ${email}. Nothing to reset.`);
    process.exit(1);
  }

  for (const t of tenants) {
    const del = await sql`delete from subscriptions where tenant_id = ${t.id} returning id`;
    await sql`
      update tenants
      set trial_ends_at = ${freshTrial ? sql`now() + interval '7 days'` : sql`now()`}
      where id = ${t.id}`;
    const state = freshTrial ? "fresh 7-day Pro trial" : "Free (trial expired)";
    console.log(`✓ ${t.name} (${t.slug}): removed ${del.length} subscription row(s) → ${state}.`);
  }
} finally {
  await sql.end();
}
