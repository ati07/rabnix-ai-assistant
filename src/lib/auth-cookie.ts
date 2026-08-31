/**
 * Session cookie name — kept in its own dependency-free module so the proxy
 * (which must stay light) can import it without pulling in the DB client.
 */
export const SESSION_COOKIE = "rabnix_session";

/** How long a session (and its cookie) lives, in days. */
export const SESSION_TTL_DAYS = 30;
