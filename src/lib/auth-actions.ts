"use server";

import { z } from "zod";
import {
  AuthError,
  createEmailVerificationToken,
  createSession,
  createUser,
  destroySession,
  getSessionUser,
  verifyCredentials,
} from "@/lib/auth";
import { sendVerificationEmail } from "@/lib/email/verification";

export type AuthActionResult = { ok: true } | { ok: false; error: string };

// E.164: a leading "+", country digit 1-9, then up to 14 more digits. The phone
// input normalizes to this shape before submitting.
const e164 = z
  .string()
  .trim()
  .regex(/^\+[1-9]\d{7,14}$/, "Enter a valid phone number with country code.");

const signUpSchema = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(120),
  email: z.string().trim().email("Enter a valid email address."),
  phone: e164,
  password: z.string().min(8, "Password must be at least 8 characters."),
});

const signInSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

/** Issue a fresh verification token and email it. Best-effort — never throws. */
async function issueVerification(user: {
  id: string;
  email: string;
  name: string;
}): Promise<void> {
  try {
    const token = await createEmailVerificationToken(user.id);
    await sendVerificationEmail({ to: user.email, name: user.name, token });
  } catch (err) {
    // Don't fail the request over email delivery — the user can resend from the
    // verify screen once the provider is reachable.
    console.error("[auth] verification email failed:", err);
  }
}

/**
 * Create an account, email a verification link, and start a session. The
 * dashboard stays locked (see dashboard/layout) until the email is confirmed.
 */
export async function signUpAction(
  input: z.input<typeof signUpSchema>,
): Promise<AuthActionResult> {
  const parsed = signUpSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  try {
    const user = await createUser(parsed.data);
    await issueVerification(user);
    await createSession(user.id);
    return { ok: true };
  } catch (err) {
    if (err instanceof AuthError) return { ok: false, error: err.message };
    console.error("[auth] sign-up failed:", err);
    return { ok: false, error: "Could not create your account. Please try again." };
  }
}

/** Verify credentials and start a session. */
export async function signInAction(
  input: z.input<typeof signInSchema>,
): Promise<AuthActionResult> {
  const parsed = signInSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  try {
    const user = await verifyCredentials(parsed.data.email, parsed.data.password);
    if (!user) return { ok: false, error: "Incorrect email or password." };
    await createSession(user.id);
    return { ok: true };
  } catch (err) {
    console.error("[auth] sign-in failed:", err);
    return { ok: false, error: "Could not sign you in. Please try again." };
  }
}

/** Re-send the verification email to the currently signed-in, unverified user. */
export async function resendVerificationAction(): Promise<AuthActionResult> {
  try {
    const user = await getSessionUser();
    if (!user) return { ok: false, error: "Please sign in again." };
    if (user.emailVerified) return { ok: true };
    await issueVerification(user);
    return { ok: true };
  } catch (err) {
    console.error("[auth] resend verification failed:", err);
    return { ok: false, error: "Could not resend the email. Please try again." };
  }
}

/** End the current session. */
export async function signOutAction(): Promise<AuthActionResult> {
  try {
    await destroySession();
    return { ok: true };
  } catch (err) {
    console.error("[auth] sign-out failed:", err);
    return { ok: false, error: "Could not sign you out." };
  }
}
