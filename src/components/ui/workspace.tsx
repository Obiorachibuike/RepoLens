import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const workspace = "mx-auto w-full max-w-[1240px] px-4 py-8 sm:px-7 lg:px-10 lg:py-10";
export const panel = "rounded-xl border border-border bg-surface/85";
export const field = "min-h-10 w-full min-w-0 rounded-md border border-border bg-surface-elevated px-3 text-sm text-text-primary focus-visible:outline-accent";

export function PageHeading({ eyebrow, title, description, actions, icon }: { eyebrow: string; title: string; description: string; actions?: ReactNode; icon?: ReactNode }) {
  return <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
    <div className="min-w-0">
      <div className="mb-2.5 flex items-center gap-2 text-xs font-semibold tracking-wide text-accent-hover">{icon}{eyebrow}</div>
      <h1 className="text-balance text-3xl font-semibold tracking-[-0.045em] sm:text-[40px] sm:leading-[1.15]">{title}</h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-text-secondary">{description}</p>
    </div>
    {actions}
  </header>;
}

export function Metric({ label, value, detail, icon, className }: { label: string; value: ReactNode; detail: ReactNode; icon?: ReactNode; className?: string }) {
  return <div className={cn(panel, "min-w-0 px-4 py-4 sm:px-5", className)}>
    <div className="flex items-center justify-between gap-2 text-xs font-medium text-text-secondary">{label}{icon && <span className="text-accent-hover">{icon}</span>}</div>
    <div className="mt-2.5 truncate text-2xl font-semibold tracking-[-0.035em] tabular-nums sm:text-[28px]">{value}</div>
    <div className="mt-1 text-xs leading-relaxed text-text-muted">{detail}</div>
  </div>;
}
