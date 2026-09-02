"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

const emptySubscribe = () => () => {};

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );

  if (!mounted) {
    return (
      <Button
        variant="ghost"
        size="icon"
        className="size-9 rounded-lg border border-border/60 bg-background/50 hover:bg-muted"
        aria-label="Toggle theme"
      >
        <Sun className="size-4 opacity-50" />
      </Button>
    );
  }

  const isDark = resolvedTheme === "dark";

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="relative size-9 rounded-lg border border-border/60 bg-background/60 hover:bg-muted hover:border-border transition-all duration-200"
      aria-label={`Switch to ${isDark ? "light" : "dark"} theme`}
      title={`Current: ${theme} (${isDark ? "Dark" : "Light"}). Click to switch.`}
    >
      <Sun
        className={`size-4 transition-all duration-300 ${
          isDark
            ? "rotate-90 scale-0 opacity-0"
            : "rotate-0 scale-100 opacity-100 text-amber-500"
        }`}
      />
      <Moon
        className={`absolute size-4 transition-all duration-300 ${
          isDark
            ? "rotate-0 scale-100 opacity-100 text-sky-400"
            : "-rotate-90 scale-0 opacity-0"
        }`}
      />
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}


