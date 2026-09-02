"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { sendStaffReply, setConversationStatus } from "@/app/dashboard/conversations/[id]/actions";

type Status = "open" | "needs_human" | "human" | "closed";

/**
 * Staff-side controls for a conversation: take over from the AI (which pauses
 * auto-reply), reply directly to the customer, and hand back to the AI. The
 * thread is polled while the conversation is active (AI- or human-handled) so
 * incoming and AI messages appear without a manual refresh. Works for every
 * channel: web replies reach the visitor through the widget, WhatsApp replies
 * are delivered by the worker.
 */
export function ConversationReply({
  conversationId,
  channel,
  status,
}: {
  conversationId: string;
  channel: string;
  status: Status;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();
  const [statusPending, startStatusTransition] = useTransition();
  const isWeb = channel === "web";
  const humanHandling = status === "human";
  const channelLabel = isWeb ? "the visitor" : "the customer on WhatsApp";

  // Keep the thread live so new messages appear without a manual refresh —
  // whether the AI is auto-replying or a human has taken over. We poll for any
  // active conversation and only stop once it's closed. `router.refresh` re-runs
  // the server component (re-querying the thread) and is stable across renders.
  useEffect(() => {
    if (status === "closed") return;
    const t = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(t);
  }, [status, router]);

  function changeStatus(next: Status) {
    startStatusTransition(async () => {
      const res = await setConversationStatus({ conversationId, status: next });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(
        next === "human"
          ? "You've taken over — the AI is paused."
          : next === "open"
            ? "Handed back to the AI."
            : "Conversation updated.",
      );
      router.refresh();
    });
  }

  function submit() {
    const value = text.trim();
    if (!value) return;
    startTransition(async () => {
      const res = await sendStaffReply({ conversationId, text: value });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setText("");
      router.refresh();
    });
  }

  return (
    <div className="mt-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          {humanHandling
            ? "You are handling this chat — the AI is paused."
            : "The AI is handling this chat."}
        </span>
        {humanHandling ? (
          <Button
            variant="outline"
            size="sm"
            disabled={statusPending}
            onClick={() => changeStatus("open")}
          >
            Hand back to AI
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            disabled={statusPending}
            onClick={() => changeStatus("human")}
          >
            Take over
          </Button>
        )}
      </div>

      <div className="flex items-end gap-2">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={
            humanHandling
              ? `Type a reply to ${channelLabel}…`
              : "Take over to reply, or send a message (the AI is still active)…"
          }
          rows={2}
          className="resize-none"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <Button onClick={submit} disabled={pending || !text.trim()}>
          Send
        </Button>
      </div>

      {!isWeb && (
        <p className="text-[11px] text-muted-foreground">
          Replies are delivered to {channelLabel} by the WhatsApp worker, so they
          may take a few seconds to arrive.
        </p>
      )}
    </div>
  );
}
