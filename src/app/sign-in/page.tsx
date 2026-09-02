import { Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import { CheckCircle2, Sparkles } from "lucide-react";
import { AuthForm } from "@/components/auth/auth-form";
import { ThemeToggle } from "@/components/dashboard/theme-toggle";

export const metadata = {
  title: "Sign In — Rabnix AI Assistant",
  description: "Sign in to your Rabnix workspace to manage your AI assistant, WhatsApp chats, and appointments.",
};

export default function SignInPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground antialiased lg:flex-row">
      {/* Left Branding Side (Desktop) */}
      <div className="relative hidden w-full flex-col justify-between border-r border-border/60 bg-muted/20 p-10 lg:flex lg:w-1/2">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <Image
              src="/logo.png"
              alt="Rabnix AI"
              width={36}
              height={36}
              priority
              className="size-9 rounded-xl"
            />
            <span className="text-base font-bold tracking-tight">Rabnix AI</span>
          </Link>
          <ThemeToggle />
        </div>

        <div className="my-auto max-w-lg space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-semibold text-primary">
            <Sparkles className="size-3.5" /> Multi-Tenant AI Workforce
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl text-foreground">
            Automate WhatsApp replies &amp; appointment bookings 24/7.
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Rabnix connects directly to your verified business documents and calendar slots. Zero hallucinations, instant conflict-free bookings, and smooth human escalations.
          </p>

          <div className="space-y-3 pt-2">
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />
              <span>Official WhatsApp Cloud API &amp; Web Chat widget</span>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />
              <span>Full-Text RAG on uploaded PDFs &amp; business policies</span>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />
              <span>1-Click human takeover with WhatsApp &amp; email alerts</span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} Rabnix AI</span>
          <div className="flex gap-4">
            <Link href="/" className="hover:underline">Home</Link>
            <Link href="/sign-up" className="hover:underline">Create Account</Link>
          </div>
        </div>
      </div>

      {/* Right Form Side */}
      <div className="flex flex-1 flex-col items-center justify-center p-6 sm:p-10">
        <div className="flex w-full justify-between pb-6 lg:hidden">
          <Link href="/" className="flex items-center gap-2">
            <Image
              src="/logo.png"
              alt="Rabnix AI"
              width={32}
              height={32}
              className="size-8 rounded-lg"
            />
            <span className="font-bold">Rabnix AI</span>
          </Link>
          <ThemeToggle />
        </div>

        <div className="w-full max-w-md">
          <Suspense fallback={<div className="text-center text-sm text-muted-foreground py-12">Loading authentication...</div>}>
            <AuthForm mode="sign-in" />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
