import { loadCloudApiContext } from "./_env.mjs";

/**
 * List which Meta apps the WABA is subscribed to. Inbound webhooks only fire if
 * OUR app is here — during bring-up the WABA was subscribed to Meta's sample
 * "WA DevX Webhook Events" app, so messages never reached our webhook.
 */
const { sql, cfg, token, base } = await loadCloudApiContext();
try {
  const r = await fetch(`${base}/${cfg.wabaId}/subscribed_apps`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  console.log("=== GET /{wabaId}/subscribed_apps ===");
  console.log("HTTP", r.status, JSON.stringify(await r.json(), null, 2));
} catch (e) {
  console.error("ERROR:", e.message);
} finally {
  await sql.end();
}
