"use server";

import { z } from "zod";
import {
  AuthError,
  createSession,
  createUser,
  destroySession,
  verifyCredentials,
} from "@/lib/auth";

export type AuthActionResult = { ok: true } | { ok: false; error: string };

const signUpSchema = z.object({
  name: z.string().trim().max(120).optional().default(""),
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

const signInSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

/** Create an account and start a session. Tenant is lazily created on first dashboard load. */
export async function signUpAction(
  input: z.input<typeof signUpSchema>,
): Promise<AuthActionResult> {
  const parsed = signUpSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  try {
    const user = await createUser(parsed.data);
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
