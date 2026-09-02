"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface TypewriterTextProps {
  /** Phrases to cycle through, typed one after another. */
  words: string[];
  /** Applied to the animated word (e.g. the gradient text classes). */
  className?: string;
  /** Per-character typing delay (ms). */
  typingSpeed?: number;
  /** Per-character deleting delay (ms). */
  deletingSpeed?: number;
  /** How long a fully-typed word rests before it deletes (ms). */
  pauseMs?: number;
}

/**
 * Typewriter that types each word out, holds, deletes, and moves to the next —
 * with a blinking caret. Seeds the first word as initial state so it renders
 * server-side (no empty/hydration flash) before the animation takes over.
 */
export function TypewriterText({
  words,
  className,
  typingSpeed = 85,
  deletingSpeed = 40,
  pauseMs = 1600,
}: TypewriterTextProps) {
  const [index, setIndex] = useState(0);
  const [text, setText] = useState(words[0] ?? "");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const current = words[index % words.length] ?? "";

    // Fully typed: hold, then start deleting. A single word loops (types and
    // erases itself continuously); multiple words cycle through the list.
    if (!deleting && text === current) {
      const t = setTimeout(() => setDeleting(true), pauseMs);
      return () => clearTimeout(t);
    }

    // Fully deleted: advance to the next word and type again.
    if (deleting && text === "") {
      setDeleting(false);
      setIndex((i) => (i + 1) % words.length);
      return;
    }

    const next = deleting
      ? current.slice(0, text.length - 1)
      : current.slice(0, text.length + 1);
    const t = setTimeout(() => setText(next), deleting ? deletingSpeed : typingSpeed);
    return () => clearTimeout(t);
  }, [text, deleting, index, words, typingSpeed, deletingSpeed, pauseMs]);

  return (
    <span className="whitespace-nowrap">
      <span className={className}>{text}</span>
      <span
        aria-hidden
        className="caret-blink ml-1 inline-block h-[0.9em] w-[3px] translate-y-[0.06em] rounded-full bg-primary align-baseline"
      />
    </span>
  );
}
