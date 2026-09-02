"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  acceptInviteAction,
  signUpAndAcceptAction,
} from "@/app/invite/actions";
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

/**
 * Two-mode invite acceptance. When already signed in we accept directly;
 * otherwise we collect a name + password and create the account for the invited
 * email, then accept — all in one step.
 */
export function InviteAccept({
  token,
  email,
  tenantName,
  currentUserEmail,
}: {
  token: string;
  email: string;
  tenantName: string;
  currentUserEmail: string | null;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const signedIn = Boolean(currentUserEmail);

  async function accept() {
    setLoading(true);
    try {
      const res = await acceptInviteAction(token);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`You've joined ${tenantName}.`);
      router.push("/dashboard");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function signUpAndAccept(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await signUpAndAcceptAction({ token, name: name.trim(), password });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Welcome — you've joined ${tenantName}.`);
      router.push("/dashboard");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  if (signedIn) {
    const mismatch =
      currentUserEmail!.toLowerCase() !== email.toLowerCase();
    return (
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Join {tenantName}</CardTitle>
          <CardDescription>
            You&apos;ve been invited to join <strong>{tenantName}</strong>.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {mismatch && (
            <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
              This invite was sent to <strong>{email}</strong>, but you&apos;re signed
              in as <strong>{currentUserEmail}</strong>. Accepting will add{" "}
              <strong>{currentUserEmail}</strong> to the team.
            </p>
          )}
          <Button onClick={accept} disabled={loading} className="w-full">
            {loading ? "Joining…" : `Accept & join ${tenantName}`}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Join {tenantName}</CardTitle>
        <CardDescription>
          Set a password to create your account for <strong>{email}</strong> and join
          the team.
        </CardDescription>
      </CardHeader>
      <form onSubmit={signUpAndAccept}>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="inv-email">Email</Label>
            <Input id="inv-email" type="email" value={email} readOnly disabled />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="inv-name">Name</Label>
            <Input
              id="inv-name"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="inv-password">Password</Label>
            <Input
              id="inv-password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
            />
          </div>
        </CardContent>
        <CardFooter className="mt-4 flex flex-col gap-3">
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Please wait…" : "Create account & join"}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link
              href={`/sign-in?redirect=/invite/${token}`}
              className="font-medium text-foreground hover:underline"
            >
              Sign in to accept
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
