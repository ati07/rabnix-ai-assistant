import { loadCloudApiContext } from "./_env.mjs";

/**
 * Report the send-readiness of every Meta entity involved in Cloud API sending:
 * phone number, WABA, and business. `health_status.can_send_message` self-reports
 * BLOCKED with error codes (141006 payment, 141010 not verified, 131000 profile).
 */
async function get(base, path, token) {
  const r = await fetch(`${base}/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  console.log(`\n=== GET /${path} ===`);
  console.log("HTTP", r.status, JSON.stringify(await r.json(), null, 2));
}

const { sql, cfg, token, base } = await loadCloudApiContext();
try {
  await get(base, `${cfg.phoneNumberId}?fields=health_status`, token);
  await get(
    base,
    `${cfg.phoneNumberId}?fields=status,name_status,code_verification_status,platform_type,quality_rating,throughput,account_mode`,
    token,
  );
  await get(base, `${cfg.wabaId}?fields=health_status`, token);
  await get(
    base,
    `${cfg.wabaId}?fields=account_review_status,business_verification_status,ownership_type,name`,
    token,
  );
} catch (e) {
  console.error("ERROR:", e.message);
} finally {
  await sql.end();
}
