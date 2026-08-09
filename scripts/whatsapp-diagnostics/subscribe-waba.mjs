import { loadCloudApiContext } from "./_env.mjs";

/**
 * Subscribe OUR app to the WABA so inbound webhooks are delivered. This is the
 * fix for "message shows in Meta but never reaches our webhook". Run once; verify
 * afterwards with check-waba.mjs. Uses the app identity behind the stored token.
 */
const { sql, cfg, token, base } = await loadCloudApiContext();
try {
  const r = await fetch(`${base}/${cfg.wabaId}/subscribed_apps`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  console.log("=== POST /{wabaId}/subscribed_apps ===");
  console.log("HTTP", r.status, JSON.stringify(await r.json(), null, 2));
} catch (e) {
  console.error("ERROR:", e.message);
} finally {
  await sql.end();
}
