import * as React from "react";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "accent" | "success" | "warning" | "danger" | "star";

const toneClasses: Record<Tone, string> = {
  neutral: "border-border bg-surface-elevated text-text-secondary",
  accent: "border-accent/35 bg-accent-soft text-accent-hover",
  success: "border-success/30 bg-[color-mix(in_srgb,var(--success)_12%,transparent)] text-success",
  warning: "border-warning/30 bg-[color-mix(in_srgb,var(--warning)_12%,transparent)] text-warning",
  danger: "border-danger/30 bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] text-danger",
  star: "border-[color-mix(in_srgb,var(--star)_35%,var(--border))] bg-[color-mix(in_srgb,var(--star)_10%,transparent)] text-star",
};

export function Badge({
  children,
  tone = "neutral",
  className,
  title,
}: {
  children: React.ReactNode;
  tone?: Tone;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex max-w-full items-center gap-1 truncate rounded-[5px] border px-1.5 py-[1px] text-[11px] font-medium leading-[18px]",
        toneClasses[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Small "owner/repo" style label with the accent colour on the repo name. */
export function RepoName({ owner, name, className }: { owner: string; name: string; className?: string }) {
  return (
    <span className={cn("truncate font-medium text-text-primary", className)}>
      <span className="text-text-muted">{owner}</span>
      <span className="text-text-muted">/</span>
      <span className="text-text-primary">{name}</span>
    </span>
  );
}
