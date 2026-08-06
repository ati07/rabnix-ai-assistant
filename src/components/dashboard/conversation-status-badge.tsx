import { Badge } from "@/components/ui/badge";

export function ConversationStatusBadge({ status }: { status: string }) {
  if (status === "needs_human")
    return <Badge variant="destructive">Needs human</Badge>;
  if (status === "closed") return <Badge variant="outline">Closed</Badge>;
  return <Badge variant="secondary">Open</Badge>;
}
