import { randomUUID } from "node:crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { staff, staffInvites, tenants, users } from "@/lib/db/schema";
import { generateToken, hashToken } from "@/lib/tokens";
import { clientEnv } from "@/lib/env";
import { isEmailConfigured, sendEmail } from "@/lib/email";

/**
 * Team invites. An owner invites someone by email; we store only the SHA-256
 * hash of an opaque token and email a link carrying the raw token. On accept we
 * link (or create) a `staff` row for the invited tenant. Invites are single-use
 * (`acceptedAt`) and expire.
 */

export type StaffInvite = typeof staffInvites.$inferSelect;
export type InviteRole = "owner" | "staff";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/** Typed invite error so callers can branch on `.code`. */
export class InviteError extends Error {
  constructor(
    public code: "invalid" | "expired" | "accepted" | "email_taken",
    message: string,
  ) {
    super(message);
    this.name = "InviteError";
  }
}

/** Absolute accept URL for an invite token. */
export function inviteUrl(token: string): string {
  const base = clientEnv.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "");
  return `${base}/invite/${token}`;
}

/**
 * Create a pending invite for `email` to join `tenantId`. Returns the raw token
 * (email this, never persist it) alongside the stored row. Any earlier pending
 * invite for the same email+tenant is superseded (deleted) so only one link is
 * ever live at a time.
 */
export async function createInvite(input: {
  tenantId: string;
  email: string;
  role: InviteRole;
  invitedByUserId: string;
}): Promise<{ invite: StaffInvite; token: string }> {
  const email = input.email.trim().toLowerCase();

  // Supersede any un-accepted invite for the same person on this tenant.
  await db
    .delete(staffInvites)
    .where(
      and(
        eq(staffInvites.tenantId, input.tenantId),
        eq(staffInvites.email, email),
        isNull(staffInvites.acceptedAt),
      ),
    );

  const token = generateToken();
  const [invite] = await db
    .insert(staffInvites)
    .values({
      id: randomUUID(),
      tenantId: input.tenantId,
      email,
      role: input.role,
      tokenHash: hashToken(token),
      invitedByUserId: input.invitedByUserId,
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    })
    .returning();

  return { invite, token };
}

/**
 * Resolve a still-valid invite by its raw token, or null when unknown, expired,
 * or already accepted. Also returns the tenant name for display on the accept
 * page.
 */
export async function getValidInvite(
  token: string,
): Promise<{ invite: StaffInvite; tenantName: string } | null> {
  const invite = await db.query.staffInvites.findFirst({
    where: and(
      eq(staffInvites.tokenHash, hashToken(token)),
      isNull(staffInvites.acceptedAt),
      gt(staffInvites.expiresAt, new Date()),
    ),
  });
  if (!invite) return null;

  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, invite.tenantId),
  });
  if (!tenant) return null;

  return { invite, tenantName: tenant.name };
}

/**
 * Accept an invite as `userId`: link (or create) the tenant `staff` row and mark
 * the invite consumed. Idempotent-ish — a token already accepted throws so the
 * UI can message it. Returns the tenant the user just joined.
 */
export async function acceptInvite(input: {
  token: string;
  userId: string;
}): Promise<{ tenantId: string }> {
  const hash = hashToken(input.token);
  const invite = await db.query.staffInvites.findFirst({
    where: eq(staffInvites.tokenHash, hash),
  });
  if (!invite) throw new InviteError("invalid", "This invite link is not valid.");
  if (invite.acceptedAt) {
    throw new InviteError("accepted", "This invite has already been used.");
  }
  if (invite.expiresAt.getTime() <= Date.now()) {
    throw new InviteError("expired", "This invite link has expired.");
  }

  const user = await db.query.users.findFirst({
    where: eq(users.id, input.userId),
  });
  if (!user) throw new InviteError("invalid", "Your account could not be found.");

  // Link an existing un-claimed staff row for this email if the owner already
  // added one, otherwise create a fresh membership. Never clobber a row that's
  // already tied to a different user.
  const existing = await db.query.staff.findFirst({
    where: and(
      eq(staff.tenantId, invite.tenantId),
      sql`lower(${staff.email}) = ${invite.email}`,
    ),
  });

  if (existing && !existing.userId) {
    await db
      .update(staff)
      .set({ userId: user.id, role: invite.role })
      .where(eq(staff.id, existing.id));
  } else if (!existing) {
    await db.insert(staff).values({
      id: randomUUID(),
      tenantId: invite.tenantId,
      userId: user.id,
      name: user.name,
      email: invite.email,
      role: invite.role,
      notifyChannels: ["dashboard"],
    });
  }
  // (existing && existing.userId) → already a member; just consume the invite.

  await db
    .update(staffInvites)
    .set({ acceptedAt: new Date() })
    .where(eq(staffInvites.id, invite.id));

  return { tenantId: invite.tenantId };
}

/** Revoke a pending invite belonging to `tenantId` (owner action). */
export async function revokeInvite(input: {
  id: string;
  tenantId: string;
}): Promise<void> {
  await db
    .delete(staffInvites)
    .where(
      and(eq(staffInvites.id, input.id), eq(staffInvites.tenantId, input.tenantId)),
    );
}

/**
 * Best-effort delivery of the invite email. Returns whether an email was sent;
 * when no provider is configured the caller should surface the link directly so
 * the owner can share it manually.
 */
export async function sendInviteEmail(input: {
  to: string;
  tenantName: string;
  inviterName: string;
  token: string;
}): Promise<boolean> {
  if (!isEmailConfigured()) return false;

  const url = inviteUrl(input.token);
  await sendEmail({
    to: input.to,
    subject: `You're invited to join ${input.tenantName}`,
    text:
      `${input.inviterName} invited you to join ${input.tenantName} on Rabnix.\n\n` +
      `Accept your invite:\n${url}\n\n` +
      `This link expires in 7 days.`,
    html:
      `<p>${escapeHtml(input.inviterName)} invited you to join ` +
      `<strong>${escapeHtml(input.tenantName)}</strong> on Rabnix.</p>` +
      `<p><a href="${url}">Accept your invite</a></p>` +
      `<p style="color:#6b7280;font-size:13px">This link expires in 7 days.</p>`,
  });
  return true;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
