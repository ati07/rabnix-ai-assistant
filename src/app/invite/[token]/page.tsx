import Link from "next/link";
import { getValidInvite } from "@/lib/invites";
import { getSessionUser } from "@/lib/tenant";
import { InviteAccept } from "@/components/auth/invite-accept";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const valid = await getValidInvite(token);
  const user = await getSessionUser();

  return (
    <div className="flex flex-1 items-center justify-center px-6 py-16">
      {!valid ? (
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Invite not found</CardTitle>
            <CardDescription>
              This invite link is invalid, has expired, or was already used. Ask
              whoever invited you to send a new one.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" className="w-full">
              <Link href="/sign-in">Go to sign in</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <InviteAccept
          token={token}
          email={valid.invite.email}
          tenantName={valid.tenantName}
          currentUserEmail={user?.email ?? null}
        />
      )}
    </div>
  );
}
