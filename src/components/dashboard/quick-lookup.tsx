"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { repositoryInput, repoLensUrl } from "@/lib/validation/repository";

export function QuickLookup() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      if (event.key !== "/" || event.ctrlKey || event.metaKey || (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)))) return;
      const field = input.current;
      if (field && !field.closest("[inert]")) { event.preventDefault(); field.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return <form onSubmit={(e) => {
    e.preventDefault(); const q = value.trim(); if (!q) return;
    const repo = repositoryInput.safeParse(q);
    router.push(repo.success ? repoLensUrl(repo.data) : `/search/repositories?${new URLSearchParams({ q })}`);
  }} className="flex w-full max-w-xl items-center gap-2 rounded-xl border border-border bg-background/90 p-1.5 pl-3.5 shadow-lg shadow-black/10 focus-within:border-accent sm:gap-3">
    <Search className="size-4 shrink-0 text-text-muted" />
    <input ref={input} value={value} onChange={(e) => setValue(e.target.value)} aria-label="Search repositories or enter a GitHub URL" placeholder="Search repositories or paste a GitHub URL" className="min-w-0 flex-1 text-sm text-text-primary outline-none placeholder:text-text-muted focus-visible:outline-none" required maxLength={240} />
    <kbd aria-hidden="true" className="hidden rounded border border-border-subtle px-1.5 py-0.5 font-mono text-xs text-text-muted sm:block">/</kbd><Button type="submit" variant="primary" className="h-9 px-2.5 sm:px-3.5"><span className="hidden sm:inline">Search</span><ArrowRight aria-label="Search" /></Button>
  </form>;
}
