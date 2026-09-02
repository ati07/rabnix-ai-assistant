import { redirect } from "next/navigation";

// The conversations list is now a two-pane inbox that selects a thread via the
// `?c=` param. Keep this route as a redirect so existing deep links (customer
// profiles, notifications) still open the right conversation.
export default async function ConversationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/dashboard/conversations?c=${id}`);
}
