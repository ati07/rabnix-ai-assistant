import { loadCloudApiContext } from "./_env.mjs";

/**
 * Inspect the stored access token (scopes, expiry, type) via /debug_token, then
 * reproduce the exact send the app makes so send failures surface with Meta's raw
 * error. Set TEST_TO to the E.164 recipient (defaults below). Never prints the token.
 */
const TEST_TO = process.env.TEST_TO || "917565091186";

const { sql, cfg, token, base } = await loadCloudApiContext();
try {
  const dbg = await fetch(
    `${base}/debug_token?input_token=${token}&access_token=${token}`,
  );
  console.log("=== debug_token ===");
  console.log("HTTP", dbg.status, JSON.stringify(await dbg.json(), null, 2));

  const send = await fetch(`${base}/${cfg.phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: TEST_TO,
      type: "text",
      text: { preview_url: false, body: "Rabnix diagnostic test ✅" },
    }),
  });
  console.log("\n=== POST /{phoneNumberId}/messages ===");
  console.log("HTTP", send.status, JSON.stringify(await send.json(), null, 2));
} catch (e) {
  console.error("ERROR:", e.message);
} finally {
  await sql.end();
}
