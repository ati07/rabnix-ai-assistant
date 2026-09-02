import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { MailCheck, TriangleAlert } from "lucide-react";
import { getSessionUser } from "@/lib/tenant";
import { verifyEmailWithToken } from "@/lib/auth";
import { isEmailConfigured } from "@/lib/email";
import { ThemeToggle } from "@/components/dashboard/theme-toggle";
import { VerifyEmailActions } from "@/components/auth/verify-email-actions";

export const metadata = {
  title: "Confirm your email — Rabnix AI",
};

// Always render fresh: this page mutates verification state and reads the session.
export const dynamic = "force-dynamic";

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  const user = await getSessionUser();
  if (!user) redirect("/sign-in?redirect=/verify-email");
  if (user.emailVerified) redirect("/dashboard");

  // A link was clicked — try to consume the token. Success unlocks the
  // dashboard; a bad/expired token falls through to the resend screen.
  let invalidToken = false;
  if (token) {
    const verifiedUserId = await verifyEmailWithToken(token);
    if (verifiedUserId) redirect("/dashboard");
    invalidToken = true;
  }

  const configured = isEmailConfigured();

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground antialiased">
      <header className="flex items-center justify-between p-6">
        <Link href="/" className="flex items-center gap-2.5">
          <Image
            src="/logo.png"
            alt="Rabnix AI"
            width={32}
            height={32}
            priority
            className="size-8 rounded-lg"
          />
          <span className="text-sm font-bold tracking-tight">Rabnix AI</span>
        </Link>
        <ThemeToggle />
      </header>

      <main className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-md rounded-2xl border border-border/80 bg-card p-8 shadow-xl">
          <div className="flex flex-col items-center text-center">
            {invalidToken ? (
              <div className="flex size-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <TriangleAlert className="size-6" />
              </div>
            ) : (
              <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <MailCheck className="size-6" />
              </div>
            )}

            <h1 className="mt-4 text-xl font-bold tracking-tight">
              {invalidToken ? "This link has expired" : "Confirm your email"}
            </h1>

            <p className="mt-2 text-sm text-muted-foreground">
              {invalidToken ? (
                <>
                  That verification link is invalid or has already been used.
                  Send yourself a fresh one below.
                </>
              ) : (
                <>
                  We sent a confirmation link to{" "}
                  <span className="font-medium text-foreground">{user.email}</span>
                  . Click it to activate your account and open your dashboard.
                </>
              )}
            </p>
          </div>

          <div className="mt-6">
            <VerifyEmailActions email={user.email} />
          </div>

          {!configured && (
            <p className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400">
              Email delivery isn&apos;t configured on this environment yet, so the
              link may not arrive. Set <code>RESEND_API_KEY</code> and{" "}
              <code>EMAIL_FROM</code>, then resend.
            </p>
          )}

          <p className="mt-6 text-center text-xs text-muted-foreground">
            Wrong address or need help? Contact{" "}
            <a
              href="mailto:hello@rabnix.com"
              className="font-medium text-foreground hover:underline"
            >
              hello@rabnix.com
            </a>
          </p>
        </div>
      </main>
    </div>
  );
}
