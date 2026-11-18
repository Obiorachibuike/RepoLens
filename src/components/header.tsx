"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, Bookmark, ChevronRight, Code2, Folder, GitCompare, GitPullRequest, History, House, Menu, MessageSquareText, Moon, Radio, ScanSearch, Search, Settings, Sparkles, Sun, Telescope, TrendingUp, UsersRound } from "lucide-react";
import { Logo, Wordmark } from "./logo";
import { Button } from "./ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "./ui/dialog";
import { Tooltip } from "./ui/tooltip";
import { useTheme } from "./theme-provider";
import { useAppConfig } from "./app-providers";
import { cn } from "@/lib/utils";
import { GithubMark } from "@/components/icons/github-mark";

const sections = [
  { label: "Discover", links: [
    { label: "Overview", href: "/", icon: House }, { label: "Trending", href: "/trending", icon: TrendingUp },
    { label: "Explore repositories", href: "/search/repositories", icon: Search }, { label: "Recommendations", href: "/recommendations", icon: Sparkles },
    { label: "Contribution finder", href: "/contributions", icon: GitPullRequest },
  ] },
  { label: "Analyze", links: [
    { label: "Intelligence", href: "/analyze", icon: ScanSearch }, { label: "AI repository chat", href: "/analyze?tool=chat", icon: MessageSquareText }, { label: "Compare", href: "/compare", icon: GitCompare },
  ] },
  { label: "Workspace", links: [
    { label: "Saved repositories", href: "/saved", icon: Bookmark }, { label: "Collections", href: "/collections", icon: Folder }, { label: "Watchtower", href: "/watchlist", icon: Radio },
    { label: "Analysis history", href: "/analysis-history", icon: Activity }, { label: "Search history", href: "/history", icon: History },
  ] },
] as const;
const more = [ { label: "Discover projects", href: "/discover", icon: Telescope }, { label: "Developer discovery", href: "/search/developers", icon: UsersRound }, { label: "Code search", href: "/search/code", icon: Code2 } ] as const;

function current(href: string, path: string) {
  if (href === "/") return path === "/";
  if (href.includes("?")) return href.includes("chat") && path.startsWith("/repository/") && path.endsWith("/chat");
  if (href === "/analyze" && path.startsWith("/repository/")) return !path.endsWith("/chat");
  return path === href || path.startsWith(`${href}/`);
}

function Brand() {
  return <Link href="/" className="group flex min-w-0 items-center gap-2.5 rounded-lg" aria-label="RepoLens overview">
    <span className="rounded-lg border border-accent/25 bg-accent-soft p-0.5"><Logo className="size-[27px]" /></span><Wordmark className="text-[17px]" />
  </Link>;
}

function Navigation({ mobile = false }: { mobile?: boolean }) {
  const path = usePathname() || "/";
  const render = ({ href, label, icon: Icon }: { href: string; label: string; icon: typeof House }) => {
    const active = current(href, path);
    const link = <Link href={href} aria-current={active ? "page" : undefined} prefetch={false} className={cn("flex min-h-8 items-center gap-2.5 rounded-lg border px-2.5 text-[13px] font-medium transition-colors", active ? "border-accent/20 bg-accent-soft text-accent-hover" : "border-transparent text-text-secondary hover:bg-surface-hover hover:text-text-primary")}><Icon className="size-4 shrink-0" /><span className="flex-1">{label}</span>{active && <span className="size-1.5 rounded-full bg-accent" />}</Link>;
    return mobile ? <DialogClose asChild key={href}>{link}</DialogClose> : <div key={href}>{link}</div>;
  };
  return <nav aria-label="Primary" className="space-y-4">
    {sections.map((section) => <div key={section.label} className="space-y-0.5"><p className="mb-1.5 px-2.5 font-mono text-[10px] font-semibold uppercase tracking-[.13em] text-text-muted">{section.label}</p>{section.links.map(render)}</div>)}
    <details className="group">
      <summary className="flex min-h-8 cursor-pointer list-none items-center gap-2 rounded-lg px-2.5 text-xs font-medium text-text-muted hover:bg-surface-hover [&::-webkit-details-marker]:hidden"><ChevronRight className="size-3.5 group-open:rotate-90" /> More discovery tools</summary>
      <div className="mt-0.5 space-y-0.5">{more.map(render)}</div>
    </details>
    <div className="space-y-0.5 border-t border-border-subtle pt-2">
      <p className="mb-1.5 px-2.5 font-mono text-[10px] font-semibold uppercase tracking-[.13em] text-text-muted">Account</p>
      {render({ label: "Settings", href: "/settings", icon: Settings })}
      {render({ label: "AI usage", href: "/usage", icon: Activity })}
    </div>
  </nav>;
}

export function Sidebar() {
  return <aside className="sticky top-0 hidden h-dvh w-[214px] shrink-0 flex-col overflow-y-auto border-r border-border-subtle bg-surface/90 lg:flex xl:w-[232px]">
    <div className="flex min-h-[65px] items-center border-b border-border-subtle px-4"><Brand /></div>
    <div className="grow p-3.5"><Navigation /></div>
    <div className="mt-auto border-t border-border-subtle px-4 py-3 text-[11px] leading-relaxed text-text-muted"><p className="font-medium text-text-secondary">Open-source workspace</p><p className="mt-0.5">Powered by GitHub public data</p></div>
  </aside>;
}

export function Header() {
  const pathname = usePathname() || "/";
  const { theme, cycleTheme } = useTheme();
  const config = useAppConfig();
  const name = sections.flatMap((section) => [...section.links]).find(({ href }) => current(href, pathname))?.label ?? (pathname === "/settings" ? "Settings" : pathname === "/usage" ? "AI usage" : more.find(({ href }) => current(href, pathname))?.label ?? "Workspace");
  return <header className="sticky top-0 z-40 flex min-h-[65px] items-center border-b border-border-subtle bg-background/85 px-4 backdrop-blur-md sm:px-7 lg:px-10">
    <div className="mx-auto flex w-full max-w-[1160px] items-center justify-between gap-2">
      <a className="sr-only focus:not-sr-only" href="#main-content">Skip to content</a>
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="lg:hidden"><Dialog><DialogTrigger asChild><Button variant="ghost" size="icon" aria-label="Open workspace navigation"><Menu /></Button></DialogTrigger><DialogContent title="RepoLens workspace" description="Discover, analyze, and manage repositories." className="max-h-[88dvh] overflow-y-auto"><Navigation mobile /></DialogContent></Dialog></div>
        <div className="lg:hidden"><Brand /></div>
        <div className="hidden items-center gap-2 text-xs text-text-muted lg:flex"><span>Workspace</span><ChevronRight className="size-3.5" /><span className="font-medium text-text-secondary">{name}</span></div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2.5">
        <Link href="/settings" className="hidden min-h-7 items-center gap-1.5 rounded-full border border-border-subtle bg-surface/80 px-2.5 text-[11px] font-medium text-text-secondary hover:border-accent/40 sm:inline-flex"><GithubMark className="size-3.5" /><span className={cn("size-1.5 rounded-full", config.github.authenticated ? "bg-success" : "bg-warning")} />{config.github.authenticated ? "GitHub token configured" : "Public access"}</Link>
        <Tooltip content={`Theme: ${theme}`}><Button variant="ghost" size="icon" onClick={cycleTheme} aria-label={`Switch theme (currently ${theme})`}>{theme === "light" ? <Sun /> : <Moon />}</Button></Tooltip>
        <Link href="/settings" aria-label="Open settings" className="inline-flex size-8 items-center justify-center rounded-lg text-text-secondary hover:bg-surface-hover"><Settings className="size-4" /></Link>
      </div>
    </div>
  </header>;
}
