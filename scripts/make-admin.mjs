import { readFileSync } from "node:fs";

/**
 * Promote an existing user to `platform_admin` so they can reach `/admin`.
 *
 * Bootstrap step: sign up normally first, then run this against that email.
 * Reads the repo-root .env directly (no app build needed) and never prints
 * secrets.
 *
 *   node scripts/make-admin.mjs you@example.com
 *
 * To demote, pass --revoke:
 *   node scripts/make-admin.mjs you@example.com --revoke
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
const revoke = process.argv.includes("--revoke");
if (!email) {
  console.error("Usage: node scripts/make-admin.mjs <email> [--revoke]");
  process.exit(1);
}

const env = loadEnv();
const { default: postgres } = await import("postgres");
const sql = postgres(env.DATABASE_URL, { max: 1 });

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
