"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { signInAction, signUpAction } from "@/lib/auth-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import Image from "next/image";
import { ArrowRight } from "lucide-react";

/**
 * Email/password sign-in & sign-up form. One component, two modes. Submits to
 * our own server actions (custom auth), which set the session cookie. On success
 * it redirects to `?redirect=` (set by the proxy) or `/dashboard`.
 */
export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const router = useRouter();
  const params = useSearchParams();
  const redirectTo = params.get("redirect") || "/dashboard";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const isSignUp = mode === "sign-up";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const result = isSignUp
        ? await signUpAction({ name: name.trim(), email, password })
        : await signInAction({ email, password });

      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      router.push(redirectTo);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="w-full max-w-md border-border/80 bg-card shadow-xl dark:border-border/60">
      <CardHeader className="space-y-1.5 pb-4">
        <div className="flex items-center gap-2 mb-2">
          <Image
            src="/logo.png"
            alt="Rabnix AI"
            width={32}
            height={32}
            className="size-8 rounded-lg"
          />
          <span className="text-sm font-semibold tracking-tight">Rabnix AI</span>
        </div>
        <CardTitle className="text-xl font-bold tracking-tight">
          {isSignUp ? "Create your workspace account" : "Welcome back to Rabnix"}
        </CardTitle>
        <CardDescription className="text-xs">
          {isSignUp
            ? "Get started with your 7-day free Pro trial. No credit card required."
            : "Sign in to manage your AI assistant, WhatsApp chats, and CRM."}
        </CardDescription>
      </CardHeader>
      <form onSubmit={onSubmit}>
        <CardContent className="flex flex-col gap-4">
          {isSignUp && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name" className="text-xs font-medium">Full Name</Label>
              <Input
                id="name"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Dr. Rajesh Sharma"
                className="h-10 text-sm"
              />
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email" className="text-xs font-medium">Work Email</Label>
            <Input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@business.com"
              className="h-10 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="password" className="text-xs font-medium">Password</Label>
              {!isSignUp && (
                <Link
                  href="/forgot-password"
                  className="text-xs text-muted-foreground hover:text-foreground hover:underline transition-colors"
                >
                  Forgot password?
                </Link>
              )}
            </div>
            <Input
              id="password"
              type="password"
              required
              minLength={8}
              autoComplete={isSignUp ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={isSignUp ? "At least 8 characters" : "••••••••"}
              className="h-10 text-sm"
            />
          </div>
        </CardContent>
        <CardFooter className="mt-2 flex flex-col gap-3.5">
          <Button type="submit" className="w-full h-10 font-medium shadow-xs" disabled={loading}>
            {loading ? (
              "Please wait…"
            ) : isSignUp ? (
              <span className="flex items-center gap-1.5">
                Create Account <ArrowRight className="size-4" />
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                Sign in to Workspace <ArrowRight className="size-4" />
              </span>
            )}
          </Button>
          <div className="text-center text-xs text-muted-foreground">
            {isSignUp ? "Already have an account? " : "New to Rabnix? "}
            <Link
              href={isSignUp ? "/sign-in" : "/sign-up"}
              className="font-semibold text-foreground hover:underline"
            >
              {isSignUp ? "Sign in" : "Create an account (7-day Pro trial)"}
            </Link>
          </div>
        </CardFooter>
      </form>
    </Card>
  );
}

