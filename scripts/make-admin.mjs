import { readFileSync } from "node:fs";

/**
 * Promote an existing user to `platform_admin` so they can reach `/admin`.
 *
 * Bootstrap step: sign up normally first, then run this against that email.
 * Never prints secrets.
 *
 *   node scripts/make-admin.mjs you@example.com
 *
 * To demote, pass --revoke:
 *   node scripts/make-admin.mjs you@example.com --revoke
 *
 * The database is chosen in this order (first that is set wins):
 *   1. --url=<postgres connection string>   (best for PRODUCTION — Vercel/Neon/etc.)
 *   2. $DATABASE_URL from the environment
 *   3. DATABASE_URL in the repo-root .env    (local dev default)
 *
 * Production example (from your machine, against the prod DB):
 *   node scripts/make-admin.mjs you@example.com --url="postgres://…prod…"
 */

function loadEnv(path = "./.env") {
  try {
    return Object.fromEntries(
      readFileSync(path, "utf8")
        .split(/\r?\n/)
        .filter((l) => l && !l.trimStart().startsWith("#") && l.includes("="))
        .map((l) => {
          const i = l.indexOf("=");
          return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
        }),
    );
  } catch {
    return {}; // no .env (e.g. CI) — rely on --url or $DATABASE_URL
  }
}

const args = process.argv.slice(2);
const urlArg = args.find((a) => a.startsWith("--url="))?.slice("--url=".length);
const revoke = args.includes("--revoke");
// First positional (non-flag) arg is the email.
const email = args.find((a) => !a.startsWith("--"))?.trim().toLowerCase();
if (!email) {
  console.error(
    'Usage: node scripts/make-admin.mjs <email> [--revoke] [--url="postgres://…"]',
  );
  process.exit(1);
}

const dbUrl = urlArg || process.env.DATABASE_URL || loadEnv().DATABASE_URL;
if (!dbUrl) {
  console.error(
    "No database URL. Pass --url=…, set $DATABASE_URL, or add DATABASE_URL to .env.",
  );
  process.exit(1);
}

const { default: postgres } = await import("postgres");
const sql = postgres(dbUrl, { max: 1 });

try {
  const role = revoke ? "user" : "platform_admin";
  const rows = await sql`
    update users set role = ${role}, updated_at = now()
    where lower(email) = ${email}
    returning id, name, email, role`;
  if (rows.length === 0) {
    console.error(`No user found with email ${email}. Sign up first, then re-run.`);
    process.exit(1);
  }
  const u = rows[0];
  console.log(`✓ ${u.email} (${u.name}) is now role="${u.role}".`);
} finally {
  await sql.end();
}
