"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bookmark, History, KeyRound, Moon, Settings, SlidersHorizontal, Sun, Telescope } from "lucide-react";
import { Logo, Wordmark } from "./logo";
import { Button } from "./ui/button";
import { Tooltip } from "./ui/tooltip";
import { useTheme } from "./theme-provider";
import { useAppConfig } from "./app-providers";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/discover", label: "Discover", icon: Telescope },
  { href: "/saved", label: "Saved", icon: Bookmark },
  { href: "/history", label: "History", icon: History },
  { href: "/collections", label: "Collections", icon: SlidersHorizontal },
] as const;

export function Header() {
  const pathname = usePathname();
  const { theme, cycleTheme } = useTheme();
  const config = useAppConfig();

  const themeLabel =
    theme === "system" ? "Theme: system" : theme === "light" ? "Theme: light" : "Theme: dark";

  return (
    <header className="sticky top-0 z-40 border-b border-border-subtle bg-[color-mix(in_srgb,var(--background)_82%,transparent)] backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-[1240px] items-center justify-between gap-3 px-4 sm:px-6">
        <Link href="/" className="flex min-w-0 items-center gap-2.5 rounded-md focus-visible:outline-none">
          <Logo />
          <div className="min-w-0">
            <Wordmark className="block leading-none" />
            <span className="hidden text-[10px] tracking-[0.14em] text-text-muted sm:block">
              FIND YOUR NEXT PROJECT
            </span>
          </div>
        </Link>

        <nav aria-label="Primary" className="flex items-center gap-0.5">
          {NAV.map((item) => {
            const active = pathname?.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "hidden items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors sm:inline-flex",
                  active
                    ? "bg-surface-hover text-text-primary"
                    : "text-text-muted hover:bg-surface-hover hover:text-text-secondary",
                )}
              >
                <Icon className="size-3.5" />
                {item.label}
              </Link>
            );
          })}

          <Tooltip content={themeLabel} side="bottom">
            <Button
              variant="ghost"
              size="icon"
              onClick={cycleTheme}
              aria-label={`Switch theme (currently ${theme})`}
            >
              {theme === "light" ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </Button>
          </Tooltip>

          <Tooltip
            side="bottom"
            content={
              <span>
                {config.github.authenticated
                  ? "GitHub token active — higher rate limits and code search enabled."
                  : "No GITHUB_TOKEN configured — public search works, code search is unavailable."}
              </span>
            }
          >
            <Link
              href="/settings"
              aria-label="Connection status and settings"
              className={cn(
                "inline-flex size-8 items-center justify-center rounded-md transition-colors",
                "text-text-muted hover:bg-surface-hover hover:text-text-secondary",
              )}
            >
              <KeyRound className={cn("size-4", config.github.authenticated && "text-accent-hover")} />
            </Link>
          </Tooltip>

          <Link
            href="/settings"
            aria-label="Settings"
            className="inline-flex size-8 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-hover hover:text-text-secondary sm:hidden"
          >
            <Settings className="size-4" />
          </Link>
        </nav>
      </div>
    </header>
  );
}
