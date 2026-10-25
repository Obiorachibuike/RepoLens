"use client";

import * as React from "react";
import { MODE_ORDER, SEARCH_MODES_CONFIG } from "./modes";
import { cn } from "@/lib/utils";
import type { SearchMode } from "@/lib/validation/search";

export function ModeTabs({
  value,
  onChange,
  disabled,
}: {
  value: SearchMode;
  onChange: (mode: SearchMode) => void;
  disabled?: boolean;
}) {
  return (
    <div
      role="tablist"
      aria-label="Search mode"
      className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface/70 p-1 backdrop-blur-sm"
    >
      {MODE_ORDER.map((mode) => {
        const config = SEARCH_MODES_CONFIG[mode];
        const Icon = config.icon;
        const active = value === mode;
        return (
          <button
            key={mode}
            type="button"
            role="tab"
            aria-selected={active}
            aria-label={`${config.label} mode`}
            title={config.purpose}
            disabled={disabled}
            onClick={() => onChange(mode)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-150",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
              "disabled:cursor-not-allowed disabled:opacity-60",
              active
                ? "border border-accent/40 bg-surface-hover text-text-primary shadow-[0_0_0_1px_rgba(119,113,246,0.12),0_6px_18px_-12px_rgba(119,113,246,0.7)]"
                : "border border-transparent text-text-muted hover:bg-surface-hover/60 hover:text-text-secondary",
            )}
          >
            <Icon className={cn("size-3.5", active ? "text-accent-hover" : "")} aria-hidden="true" />
            <span className="hidden sm:inline">{config.label}</span>
            <span className="sm:hidden">{config.label.split(" ")[0]}</span>
          </button>
        );
      })}
    </div>
  );
}
