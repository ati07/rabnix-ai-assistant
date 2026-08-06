import Link from "next/link";
import { Show, SignInButton, SignUpButton } from "@clerk/nextjs";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-6 dark:bg-black">
      <main className="flex w-full max-w-2xl flex-col items-center gap-8 text-center">
        <div className="flex flex-col gap-4">
          <h1 className="text-4xl font-semibold tracking-tight text-black dark:text-zinc-50">
            Rabnix AI Assistant
          </h1>
          <p className="text-lg leading-8 text-zinc-600 dark:text-zinc-400">
            AI business assistants that understand your business and reply to your
            customers on WhatsApp — booking appointments, answering questions, and
            escalating to your team when needed.
          </p>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row">
          <Show when="signed-out">
            <SignInButton>
              <button className="h-12 rounded-full bg-foreground px-6 text-background transition-colors hover:opacity-90">
                Sign in
              </button>
            </SignInButton>
            <SignUpButton>
              <button className="h-12 rounded-full border border-black/[.12] px-6 transition-colors hover:bg-black/[.04] dark:border-white/[.18] dark:hover:bg-white/[.06]">
                Create account
              </button>
            </SignUpButton>
          </Show>
          <Show when="signed-in">
            <Link
              href="/dashboard"
              className="flex h-12 items-center rounded-full bg-foreground px-6 text-background transition-colors hover:opacity-90"
            >
              Go to dashboard
            </Link>
          </Show>
        </div>
      </main>
    </div>
  );
}
