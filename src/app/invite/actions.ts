"use server";

import { z } from "zod";
import {
  AuthError,
  createSession,
  createUser,
  getSessionUser,
} from "@/lib/auth";
import { acceptInvite, getValidInvite, InviteError } from "@/lib/invites";

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Accept an invite as the already-signed-in user. The accept page uses this
 * when a session already exists.
 */
export async function acceptInviteAction(token: string): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) {
    return { ok: false, error: "Please sign in to accept this invite." };
  }
  try {
    await acceptInvite({ token, userId: user.id });
    return { ok: true };
  } catch (err) {
    if (err instanceof InviteError) return { ok: false, error: err.message };
    console.error("[invite] accept failed:", err);
    return { ok: false, error: "Could not accept this invite. Please try again." };
  }
}

const signUpAndAcceptSchema = z.object({
  token: z.string().min(1),
  name: z.string().trim().max(120).optional().default(""),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

/**
 * Create an account for the invited email and accept in one step. The email is
 * taken from the invite (not user-supplied) so the new account always matches
 * who was invited.
 */
export async function signUpAndAcceptAction(
  input: z.input<typeof signUpAndAcceptSchema>,
): Promise<ActionResult> {
  const parsed = signUpAndAcceptSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const valid = await getValidInvite(parsed.data.token);
  if (!valid) {
    return { ok: false, error: "This invite link is invalid or has expired." };
  }

  try {
    const user = await createUser({
      name: parsed.data.name,
      email: valid.invite.email,
      password: parsed.data.password,
    });
    await createSession(user.id);
    await acceptInvite({ token: parsed.data.token, userId: user.id });
    return { ok: true };
  } catch (err) {
    if (err instanceof AuthError && err.code === "email_taken") {
      return {
        ok: false,
        error: "An account with this email already exists. Sign in to accept the invite.",
      };
    }
    if (err instanceof InviteError) return { ok: false, error: err.message };
    console.error("[invite] sign-up-and-accept failed:", err);
    return { ok: false, error: "Could not complete sign-up. Please try again." };
  }
}
