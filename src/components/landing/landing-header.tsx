"use client";

import { useState } from "react";
import Link from "next/link";
import { Bot, Menu, X, ArrowRight } from "lucide-react";
import { ThemeToggle } from "@/components/dashboard/theme-toggle";
import { Button } from "@/components/ui/button";

export function LandingHeader({ isLoggedIn }: { isLoggedIn: boolean }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/60 bg-background/80 backdrop-blur-md transition-all">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand Logo */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm group-hover:scale-105 transition-transform">
            <Bot className="size-5" />
          </div>
          <div className="flex flex-col">
            <span className="text-base font-bold tracking-tight text-foreground leading-none">
              Rabnix <span className="text-primary font-normal">AI</span>
            </span>
            <span className="text-[10px] font-medium text-muted-foreground leading-tight">
              Business Workforce
            </span>
          </div>
        </Link>

        {/* Desktop Nav Items */}
        <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-muted-foreground">
          <a href="#features" className="transition-colors hover:text-foreground">
            Features
          </a>
          <a href="#channels" className="transition-colors hover:text-foreground">
            WhatsApp &amp; Web
          </a>
          <a href="#how-it-works" className="transition-colors hover:text-foreground">
            How It Works
          </a>
          <a href="#pricing" className="transition-colors hover:text-foreground">
            Pricing
          </a>
          <a href="#faq" className="transition-colors hover:text-foreground">
            FAQ
          </a>
        </nav>

        {/* Action Controls */}
        <div className="flex items-center gap-3">
          <ThemeToggle />

          {isLoggedIn ? (
            <Button asChild size="sm" className="hidden sm:inline-flex">
              <Link href="/dashboard">
                Dashboard <ArrowRight className="size-3.5 ml-1" />
              </Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
                <Link href="/sign-in">Sign In</Link>
              </Button>
              <Button asChild size="sm" className="hidden sm:inline-flex">
                <Link href="/sign-up">
                  Start Free Trial <ArrowRight className="size-3.5 ml-1" />
                </Link>
              </Button>
            </>
          )}

          {/* Mobile hamburger button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="flex size-9 items-center justify-center rounded-lg border border-border md:hidden text-foreground hover:bg-muted"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      {mobileMenuOpen && (
        <div className="border-b border-border bg-background p-4 md:hidden animate-in slide-in-from-top-2">
          <nav className="flex flex-col gap-3 text-sm font-medium">
            <a
              href="#features"
              onClick={() => setMobileMenuOpen(false)}
              className="px-2 py-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted"
            >
              Features &amp; Capabilities
            </a>
            <a
              href="#channels"
              onClick={() => setMobileMenuOpen(false)}
              className="px-2 py-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted"
            >
              WhatsApp &amp; Web Chat
            </a>
            <a
              href="#how-it-works"
              onClick={() => setMobileMenuOpen(false)}
              className="px-2 py-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted"
            >
              How It Works
            </a>
            <a
              href="#pricing"
              onClick={() => setMobileMenuOpen(false)}
              className="px-2 py-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted"
            >
              Plans &amp; Pricing
            </a>
            <a
              href="#faq"
              onClick={() => setMobileMenuOpen(false)}
              className="px-2 py-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted"
            >
              FAQ
            </a>
            <div className="mt-2 flex flex-col gap-2 pt-2 border-t border-border">
              {isLoggedIn ? (
                <Button asChild className="w-full">
                  <Link href="/dashboard">Open Workspace Dashboard</Link>
                </Button>
              ) : (
                <>
                  <Button asChild variant="outline" className="w-full">
                    <Link href="/sign-in">Sign In</Link>
                  </Button>
                  <Button asChild className="w-full">
                    <Link href="/sign-up">Start 7-Day Free Trial</Link>
                  </Button>
                </>
              )}
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
