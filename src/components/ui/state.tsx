import * as React from "react";
import { AlertTriangle, CircleAlert, SearchX } from "lucide-react";
import { Button } from "./button";
import { cn } from "@/lib/utils";

export function EmptyState({
  title = "No repositories found",
  description = "Try a different keyword or adjust your filters.",
  action,
  className,
}: {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-6 py-14 text-center",
        className,
      )}
    >
      <span className="rounded-full border border-border bg-surface-elevated p-3 text-text-muted">
        <SearchX className="size-5" />
      </span>
      <div>
        <p className="text-sm font-medium text-text-primary">{title}</p>
        <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-text-muted">{description}</p>
      </div>
      {action}
    </div>
  );
}

export interface ErrorStateProps {
  title?: string;
  message: string;
  hint?: string | null;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
  compact?: boolean;
}

export function ErrorState({
  title = "Search failed",
  message,
  hint,
  onRetry,
  retryLabel = "Try again",
  className,
  compact,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-start gap-3 border-danger/30 bg-[color-mix(in_srgb,var(--danger)_8%,var(--surface))]",
        compact ? "rounded-md border p-3" : "rounded-lg border p-5",
        className,
      )}
    >
      <div className="flex items-start gap-2.5">
        <CircleAlert className="mt-0.5 size-4 shrink-0 text-danger" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-text-primary">{title}</p>
          <p className="mt-1 text-xs leading-relaxed text-text-secondary">{message}</p>
          {hint ? <p className="mt-1.5 text-[11px] leading-relaxed text-text-muted">{hint}</p> : null}
        </div>
      </div>
      {onRetry ? (
        <Button size="sm" variant="secondary" onClick={onRetry}>
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}

export function Notice({
  children,
  tone = "info",
  className,
}: {
  children: React.ReactNode;
  tone?: "info" | "warning" | "success";
  className?: string;
}) {
  const tones = {
    info: "border-accent/30 bg-accent-soft text-text-secondary",
    warning: "border-warning/30 bg-[color-mix(in_srgb,var(--warning)_10%,var(--surface))] text-text-secondary",
    success: "border-success/30 bg-[color-mix(in_srgb,var(--success)_10%,var(--surface))] text-text-secondary",
  } as const;
  const icons = { info: CircleAlert, warning: AlertTriangle, success: CircleAlert } as const;
  const Icon = icons[tone];
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-md border px-3 py-2 text-[11px] leading-relaxed",
        tones[tone],
        className,
      )}
    >
      <Icon className="mt-[1px] size-3.5 shrink-0 opacity-80" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
