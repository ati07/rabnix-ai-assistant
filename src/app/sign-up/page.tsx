import { Suspense } from "react";
import Link from "next/link";
import { Bot, CheckCircle2, Sparkles } from "lucide-react";
import { AuthForm } from "@/components/auth/auth-form";
import { ThemeToggle } from "@/components/dashboard/theme-toggle";

export const metadata = {
  title: "Create Account — Rabnix AI Assistant",
  description: "Start your 7-day free trial of Rabnix Pro to automate customer conversations and bookings on WhatsApp and web.",
};

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground antialiased lg:flex-row">
      {/* Left Branding Side (Desktop) */}
      <div className="relative hidden w-full flex-col justify-between border-r border-border/60 bg-muted/20 p-10 lg:flex lg:w-1/2">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Bot className="size-5" />
            </div>
            <span className="text-base font-bold tracking-tight">Rabnix AI</span>
          </Link>
          <ThemeToggle />
        </div>

        <div className="my-auto max-w-lg space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
            <Sparkles className="size-3.5" /> 7-Day Full Pro Access (Free)
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl text-foreground">
            Start automating customer chats &amp; bookings in 5 minutes.
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Create your account to unlock full Pro features: official WhatsApp Cloud API, custom RAG knowledge upload, team invite seats, and conflict-free calendar booking.
          </p>

          <div className="space-y-3 pt-2">
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />
              <span>Full Pro trial for 7 days — zero credit card required</span>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />
              <span>Multi-user team invites with role-based access</span>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />
              <span>Embeddable web chat snippet ready out-of-the-box</span>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />
              <span>AES-256 encrypted credential and token storage</span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} Rabnix AI</span>
          <div className="flex gap-4">
            <Link href="/" className="hover:underline">Home</Link>
            <Link href="/sign-in" className="hover:underline">Sign In</Link>
          </div>
        </div>
      </div>

      {/* Right Form Side */}
      <div className="flex flex-1 flex-col items-center justify-center p-6 sm:p-10">
        <div className="flex w-full justify-between pb-6 lg:hidden">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Bot className="size-4" />
            </div>
            <span className="font-bold">Rabnix AI</span>
          </Link>
          <ThemeToggle />
        </div>

        <div className="w-full max-w-md">
          <Suspense fallback={<div className="text-center text-sm text-muted-foreground py-12">Loading registration...</div>}>
            <AuthForm mode="sign-up" />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
