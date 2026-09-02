/**
 * End-to-end smoke test for the web chat widget + live handover.
 *
 * Exercises the public HTTP surface exactly as the browser widget does, plus the
 * DB-side staff actions (takeover, staff reply, hand back) so we can prove the
 * live-update path without a browser. Read-only against config; creates one
 * throwaway `web` conversation for a random session id and cleans it up.
 *
 * Run:  npx tsx scripts/web-chat-test/e2e.mts
 * Env:  APP_URL (default http://localhost:3000), CHAT_KEY (falls back to the
 *       seeded RABNIX key used in test-widget.html).
 */
import "dotenv/config";
import postgres from "postgres";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
// Falls back to the current RABNIX web_chat_configs.public_key. This rotates
// when the key is regenerated in the dashboard — pass CHAT_KEY=… to override, or
// query `select public_key from web_chat_configs` for the live value.
const CHAT_KEY =
  process.env.CHAT_KEY ??
  "wc_26d344c1964ae47a4dd504bfadaaeae01567dcfe22bd3924";
const SESSION = `web_e2e_${Date.now()}`;

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    pass++;
    console.log(`  ✅ ${name}`);
  } else {
    fail++;
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function getJson(path: string) {
  const res = await fetch(`${APP_URL}${path}`, { cache: "no-store" });
  return { res, body: await res.json().catch(() => null) };
}
async function history() {
  const { body } = await getJson(
    `/api/chat/${CHAT_KEY}/history?sessionId=${encodeURIComponent(SESSION)}`,
  );
  return body?.messages ?? [];
}

async function main() {
  console.log(`\nWidget E2E → ${APP_URL}  key=${CHAT_KEY.slice(0, 10)}…  session=${SESSION}\n`);

  // 1. Config
  console.log("1) config endpoint");
  const cfg = await getJson(`/api/chat/${CHAT_KEY}/config`);
  check("config 200", cfg.res.status === 200, `got ${cfg.res.status}`);
  check("config has greeting", typeof cfg.body?.greeting === "string");

  // 2. Send a message → AI reply
  console.log("2) send message → AI reply");
  const msgRes = await fetch(`${APP_URL}/api/chat/${CHAT_KEY}/message`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId: SESSION, text: "Hi, what do you offer?" }),
  });
  const msgBody = await msgRes.json().catch(() => null);
  check("message 200", msgRes.status === 200, `got ${msgRes.status}`);
  check("AI replied (non-empty)", Boolean(msgBody?.reply), JSON.stringify(msgBody));

  // 3. History reflects the exchange + is no-store
  console.log("3) history restore + no-store");
  const h1res = await fetch(
    `${APP_URL}/api/chat/${CHAT_KEY}/history?sessionId=${encodeURIComponent(SESSION)}`,
    { cache: "no-store" },
  );
  const h1 = (await h1res.json()).messages;
  check("cache-control: no-store", h1res.headers.get("cache-control") === "no-store", h1res.headers.get("cache-control") ?? "(none)");
  check("history has 2 messages", h1.length === 2, `len=${h1.length}`);
  check("last is assistant", h1.at(-1)?.role === "assistant");

  // ── DB-side staff flow (proves the live-update path) ──────────────────────
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
  try {
    const [conv] = await sql`
      select id, tenant_id, status from conversations
      where channel_type = 'web' and customer_id = ${SESSION} limit 1`;
    check("web conversation row created", Boolean(conv), "none found");

    // 4. Staff takes over → status human
    console.log("4) staff takeover pauses AI");
    await sql`update conversations set status = 'human' where id = ${conv.id}`;
    const pausedRes = await fetch(`${APP_URL}/api/chat/${CHAT_KEY}/message`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: SESSION, text: "Are you a real person?" }),
    });
    const pausedBody = await pausedRes.json();
    check("AI paused (reply null)", pausedBody?.reply === null, JSON.stringify(pausedBody));
    const hPaused = await history();
    check("paused inbound still recorded", hPaused.some((m: {content:string}) => m.content === "Are you a real person?"));

    // 5. Staff reply is inserted (mimics sendStaffReply) → widget poll would see it
    console.log("5) staff reply appears in history (live-update path)");
    const beforeLen = (await history()).length;
    await sql`
      insert into messages (tenant_id, conversation_id, direction, role, content, meta)
      values (${conv.tenant_id}, ${conv.id}, 'outbound', 'assistant', 'Yes! Staff here, happy to help.', ${sql.json({ by: "staff" })})`;
    const afterLen = (await history()).length;
    const last = (await history()).at(-1);
    check("history grew by 1", afterLen === beforeLen + 1, `before=${beforeLen} after=${afterLen}`);
    check("staff reply visible as assistant bubble", last?.content === "Yes! Staff here, happy to help." && last?.role === "assistant");

    // 6. Hand back → AI resumes
    console.log("6) hand back to AI");
    await sql`update conversations set status = 'open' where id = ${conv.id}`;
    const resumeRes = await fetch(`${APP_URL}/api/chat/${CHAT_KEY}/message`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: SESSION, text: "Great, thanks!" }),
    });
    const resumeBody = await resumeRes.json();
    check("AI resumed (reply non-null)", Boolean(resumeBody?.reply), JSON.stringify(resumeBody));

    // Cleanup: remove the throwaway conversation + its messages.
    await sql`delete from messages where conversation_id = ${conv.id}`;
    await sql`delete from conversations where id = ${conv.id}`;
    console.log("\n(cleaned up throwaway conversation)");
  } finally {
    await sql.end();
  }

  console.log(`\n── Result: ${pass} passed, ${fail} failed ──\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("E2E crashed:", err);
  process.exit(1);
});
