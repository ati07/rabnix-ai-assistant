import { findByPublicKey, isOriginAllowed } from "@/lib/chat/web-config";

export const runtime = "nodejs";

/**
 * Public widget render config for a given `publicKey`.
 *
 * Returns only presentation fields — never tenant ids or secrets. 404 when the
 * key is unknown or the widget is disabled, so a disabled/rotated key can't be
 * probed for existence.
 *
 * CORS: this endpoint is called cross-origin by `widget.js` running on the
 * tenant's own site (to style the launcher before the same-origin iframe loads),
 * so it allows any origin. Safe because the payload is public presentation data.
 * (`/message` and `/history` are called from *inside* the iframe — same-origin —
 * and deliberately stay locked to the app origin.)
 *
 * This is also the ONLY place the embedding site's origin is visible (the iframe's
 * own requests carry the app origin, not the host page's), so the optional
 * `allowedOrigins` allow-list is enforced here: a disallowed origin gets a 404 so
 * `widget.js` renders nothing on that site. Note it's a soft, loader-level gate,
 * not hard security — the public `/message` API is reachable directly regardless.
 */

// Simple GET with no custom headers isn't preflighted, so `Allow-Origin` is
// all that's needed; `OPTIONS` is provided for completeness/robustness.
const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
} as const;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  const config = await findByPublicKey(key);

  if (!config || !config.enabled) {
    return Response.json({ error: "Not found" }, { status: 404, headers: CORS_HEADERS });
  }

  // Loader-level allow-list: the host page's origin is only visible here.
  if (!isOriginAllowed(config, req.headers.get("origin"))) {
    return Response.json({ error: "Not found" }, { status: 404, headers: CORS_HEADERS });
  }

  return Response.json(
    {
      greeting: config.greeting,
      themeColor: config.themeColor,
      launcherLabel: config.launcherLabel,
    },
    { headers: CORS_HEADERS },
  );
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
