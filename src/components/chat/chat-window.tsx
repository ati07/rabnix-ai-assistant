"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

const STORAGE_PREFIX = "rabnix-chat-session:";

/** Get (or lazily create) the anonymous visitor's session id for this widget. */
function getSessionId(chatKey: string): string {
  const storageKey = `${STORAGE_PREFIX}${chatKey}`;
  try {
    const existing = localStorage.getItem(storageKey);
    if (existing) return existing;
    const id = `web_${crypto.randomUUID()}`;
    localStorage.setItem(storageKey, id);
    return id;
  } catch {
    // Private mode / storage blocked: fall back to an ephemeral id.
    return `web_${crypto.randomUUID()}`;
  }
}

export function ChatWindow({
  chatKey,
  greeting,
  themeColor,
  launcherLabel,
}: {
  chatKey: string;
  greeting: string;
  themeColor: string;
  launcherLabel: string;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [ready, setReady] = useState(false);
  const sessionIdRef = useRef<string>("");
  const scrollRef = useRef<HTMLDivElement>(null);
  // Mirror `sending` in a ref so the polling interval sees the current value.
  const sendingRef = useRef(false);
  useEffect(() => {
    sendingRef.current = sending;
  }, [sending]);

  // Restore prior thread on mount.
  useEffect(() => {
    sessionIdRef.current = getSessionId(chatKey);
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(
          `/api/chat/${chatKey}/history?sessionId=${encodeURIComponent(sessionIdRef.current)}`,
          { cache: "no-store" },
        );
        if (res.ok) {
          const data: { messages: ChatMessage[] } = await res.json();
          if (!cancelled && data.messages.length) {
            setMessages(data.messages);
            return;
          }
        }
      } catch {
        // ignore — fall through to greeting
      } finally {
        if (!cancelled) setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [chatKey]);

  // Poll history so the visitor sees staff replies after a human takes over.
  // The server thread is the source of truth; we adopt it only when the latest
  // message changed, and never mid-send, to avoid scroll churn or clobbering the
  // optimistic bubble.
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;

    const poll = async () => {
      if (sendingRef.current) return;
      try {
        const res = await fetch(
          `/api/chat/${chatKey}/history?sessionId=${encodeURIComponent(sessionIdRef.current)}`,
          { cache: "no-store" },
        );
        if (!res.ok) return;
        const data: { messages: ChatMessage[] } = await res.json();
        if (cancelled || sendingRef.current || data.messages.length === 0) return;
        setMessages((prev) => {
          const serverLast = data.messages[data.messages.length - 1];
          const prevLast = prev[prev.length - 1];
          const unchanged =
            prev.length === data.messages.length &&
            prevLast?.content === serverLast.content;
          return unchanged ? prev : data.messages;
        });
      } catch {
        // transient network error — try again next tick
      }
    };

    const timer = setInterval(poll, 4000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [ready, chatKey]);

  // Auto-scroll to the latest message.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, sending]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;

    const optimistic: ChatMessage = {
      id: `local_${Date.now()}`,
      role: "user",
      content: text,
    };
    setMessages((prev) => [...prev, optimistic]);
    setInput("");
    setSending(true);

    try {
      const res = await fetch(`/api/chat/${chatKey}/message`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: sessionIdRef.current, text }),
      });

      if (!res.ok) {
        const msg =
          res.status === 429
            ? "You're sending messages too quickly. Please wait a moment."
            : "Sorry, something went wrong. Please try again.";
        setMessages((prev) => [
          ...prev,
          { id: `err_${Date.now()}`, role: "assistant", content: msg },
        ]);
        return;
      }

      const data: { reply: string | null } = await res.json();
      if (data.reply) {
        setMessages((prev) => [
          ...prev,
          { id: `srv_${Date.now()}`, role: "assistant", content: data.reply! },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          role: "assistant",
          content: "Sorry, I couldn't reach the server. Please try again.",
        },
      ]);
    } finally {
      setSending(false);
    }
  }, [input, sending, chatKey]);

  const showGreeting = ready && messages.length === 0;

  return (
    <div className="flex h-dvh flex-col bg-background">
      {/* Header */}
      <header
        className="flex items-center gap-2 px-4 py-3 text-white"
        style={{ backgroundColor: themeColor }}
      >
        <span className="text-sm font-semibold">{launcherLabel}</span>
      </header>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
        {showGreeting && <Bubble role="assistant">{greeting}</Bubble>}
        {messages.map((m) => (
          <Bubble key={m.id} role={m.role} themeColor={themeColor}>
            {m.content}
          </Bubble>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="rounded-2xl bg-muted px-4 py-2 text-sm text-muted-foreground">
              <span className="inline-flex gap-1">
                <Dot /> <Dot delay="150ms" /> <Dot delay="300ms" />
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Composer */}
      <form
        className="flex items-center gap-2 border-t p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message…"
          className="flex-1 rounded-full border bg-background px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          disabled={sending}
          autoFocus
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="rounded-full px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          style={{ backgroundColor: themeColor }}
        >
          Send
        </button>
      </form>
    </div>
  );
}

function Bubble({
  role,
  themeColor,
  children,
}: {
  role: "user" | "assistant";
  themeColor?: string;
  children: React.ReactNode;
}) {
  const outbound = role === "user";
  return (
    <div className={cn("flex", outbound ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[80%] rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap break-words",
          outbound ? "text-white" : "bg-muted text-foreground",
        )}
        style={outbound ? { backgroundColor: themeColor } : undefined}
      >
        {children}
      </div>
    </div>
  );
}

function Dot({ delay }: { delay?: string }) {
  return (
    <span
      className="inline-block size-1.5 animate-bounce rounded-full bg-current"
      style={delay ? { animationDelay: delay } : undefined}
    />
  );
}
