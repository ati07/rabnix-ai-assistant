import {
  randomBytes,
  randomUUID,
  scrypt as scryptCb,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { cookies, headers } from "next/headers";
import { and, eq, gt, isNull, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { passwordResetTokens, sessions, users } from "@/lib/db/schema";
import { SESSION_COOKIE, SESSION_TTL_DAYS } from "@/lib/auth-cookie";
import { generateToken, hashToken } from "@/lib/tokens";

/**
 * Self-hosted email/password auth — no third-party auth library. Built only on
 * Node's `crypto`:
 *   • passwords: scrypt with a per-user random salt, timing-safe comparison;
 *   • sessions: an opaque 256-bit random token in an httpOnly cookie, of which
 *     only the SHA-256 hash is stored in `sessions` (a DB leak can't forge a
 *     session);
 *   • password resets: single-use SHA-256-hashed tokens.
 */

const scrypt = promisify(scryptCb);
const SCRYPT_KEYLEN = 64;
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1 hour
const isProd = process.env.NODE_ENV === "production";

export type AuthUser = typeof users.$inferSelect;

// ── Passwords ────────────────────────────────────────────────────────────

/** Hash a plaintext password → `scrypt$<saltB64>$<hashB64>` (safe to store). */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scrypt(password, salt, SCRYPT_KEYLEN)) as Buffer;
  return `scrypt$${salt.toString("base64")}$${derived.toString("base64")}`;
}

/** Constant-time verify of a plaintext password against a stored hash. */
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [scheme, saltB64, hashB64] = stored.split("$");
  if (scheme !== "scrypt" || !saltB64 || !hashB64) return false;
  const salt = Buffer.from(saltB64, "base64");
  const expected = Buffer.from(hashB64, "base64");
  const derived = (await scrypt(password, salt, expected.length)) as Buffer;
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}

// ── Sign up / in ─────────────────────────────────────────────────────────

/** Create a new user. Throws {@link AuthError} with code "email_taken". */
export async function createUser(input: {
  name: string;
  email: string;
  password: string;
}): Promise<AuthUser> {
  const email = input.email.trim().toLowerCase();
  const existing = await db.query.users.findFirst({
    where: eq(users.email, email),
  });
  if (existing) throw new AuthError("email_taken", "That email is already registered.");

  const [row] = await db
    .insert(users)
    .values({
      id: randomUUID(),
      name: input.name.trim() || email.split("@")[0],
      email,
      passwordHash: await hashPassword(input.password),
    })
    .returning();
  return row;
}

/**
 * Verify credentials. Returns the user on success, or null on any failure
 * (unknown email / wrong password) — callers must not distinguish the two.
 */
export async function verifyCredentials(
  email: string,
  password: string,
): Promise<AuthUser | null> {
  const row = await db.query.users.findFirst({
    where: eq(users.email, email.trim().toLowerCase()),
  });
  // Always run a hash to keep timing uniform whether or not the user exists.
  const stored = row?.passwordHash ?? "scrypt$AAAAAAAAAAAAAAAAAAAAAA==$AAAA";
  const ok = await verifyPassword(password, stored);
  if (!row || !ok) return null;
  return row;
}

// ── Sessions ─────────────────────────────────────────────────────────────

/** Create a session for `userId` and set the httpOnly session cookie. */
export async function createSession(userId: string): Promise<void> {
  const token = generateToken();
  const hash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

  const hdrs = await headers();
  await db.insert(sessions).values({
    id: randomUUID(),
    userId,
    tokenHash: hash,
    expiresAt,
    ipAddress:
      hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: hdrs.get("user-agent") ?? null,
  });

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

/**
 * Resolve the current request's user from the session cookie, or null when
 * signed out / expired / banned. Expired or banned sessions are cleaned up.
 */
export async function getSessionUser(): Promise<AuthUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await db.query.sessions.findFirst({
    where: eq(sessions.tokenHash, hashToken(token)),
  });
  if (!session) return null;

  if (session.expiresAt.getTime() <= Date.now()) {
    await db.delete(sessions).where(eq(sessions.id, session.id));
    return null;
  }

  const user = await db.query.users.findFirst({
    where: eq(users.id, session.userId),
  });
  if (!user) return null;

  // Enforce suspension (permanent, or until banExpires passes).
  if (user.banned && (!user.banExpires || user.banExpires.getTime() > Date.now())) {
    return null;
  }
  return user;
}

/** Destroy the current session (DB row + cookie). Safe when already signed out. */
export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
    store.delete(SESSION_COOKIE);
  }
}

// ── Password reset ─────────────────────────────────────────────────────────

/**
 * Issue a single-use reset token for `email`. Returns the raw token to email,
 * or null when no such user (callers must reveal nothing either way).
 */
export async function createPasswordResetToken(
  email: string,
): Promise<{ user: AuthUser; token: string } | null> {
  const user = await db.query.users.findFirst({
    where: eq(users.email, email.trim().toLowerCase()),
  });
  if (!user) return null;

  const token = generateToken();
  const hash = hashToken(token);
  await db.insert(passwordResetTokens).values({
    id: randomUUID(),
    userId: user.id,
    tokenHash: hash,
    expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
  });
  return { user, token };
}

/**
 * Consume a reset token and set a new password. Returns true on success, false
 * when the token is unknown/expired/already used. Invalidates all sessions.
 */
export async function resetPasswordWithToken(
  token: string,
  newPassword: string,
): Promise<boolean> {
  const record = await db.query.passwordResetTokens.findFirst({
    where: and(
      eq(passwordResetTokens.tokenHash, hashToken(token)),
      isNull(passwordResetTokens.usedAt),
      gt(passwordResetTokens.expiresAt, new Date()),
    ),
  });
  if (!record) return false;

  await db
    .update(users)
    .set({ passwordHash: await hashPassword(newPassword), updatedAt: new Date() })
    .where(eq(users.id, record.userId));
  await db
    .update(passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(eq(passwordResetTokens.id, record.id));
  // Force re-login everywhere after a password change.
  await db.delete(sessions).where(eq(sessions.userId, record.userId));
  return true;
}

/** Best-effort GC of expired sessions/reset tokens (call opportunistically). */
export async function pruneExpiredAuthRows(): Promise<void> {
  const now = new Date();
  await db.delete(sessions).where(lt(sessions.expiresAt, now));
  await db.delete(passwordResetTokens).where(lt(passwordResetTokens.expiresAt, now));
}

/** Typed auth error so callers can branch on `.code` (e.g. "email_taken"). */
export class AuthError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}
