"use client";

import * as React from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { cn } from "@/lib/utils";

export function Switch({
  checked,
  onCheckedChange,
  id,
  label,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  id: string;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <SwitchPrimitive.Root
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        aria-label={label}
        className={cn(
          "h-5 w-9 shrink-0 rounded-full border border-border bg-surface-hover transition-colors",
          "data-[state=checked]:border-accent/50 data-[state=checked]:bg-accent/70",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
        )}
      >
        <SwitchPrimitive.Thumb className="block size-3.5 translate-x-[3px] rounded-full bg-text-muted transition-transform data-[state=checked]:translate-x-[17px] data-[state=checked]:bg-white" />
      </SwitchPrimitive.Root>
      <label htmlFor={id} className="cursor-pointer text-xs text-text-secondary">
        {label}
      </label>
    </div>
  );
}
