"use client";

import * as React from "react";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { cn } from "@/lib/utils";

export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;

export function DropdownMenuContent({
  className,
  sideOffset = 6,
  children,
  align = "end",
}: {
  className?: string;
  sideOffset?: number;
  align?: "start" | "center" | "end";
  children: React.ReactNode;
}) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "z-50 min-w-44 overflow-hidden rounded-md border border-border bg-surface-elevated p-1 shadow-xl",
          className,
        )}
      >
        {children}
      </DropdownMenuPrimitive.Content>
    </DropdownMenuPrimitive.Portal>
  );
}

export function DropdownMenuItem({
  className,
  children,
  onSelect,
  asChild,
  destructive,
}: {
  className?: string;
  children: React.ReactNode;
  onSelect?: () => void;
  asChild?: boolean;
  destructive?: boolean;
}) {
  return (
    <DropdownMenuPrimitive.Item
      asChild={asChild}
      onSelect={onSelect}
      className={cn(
        "flex cursor-pointer select-none items-center gap-2 rounded-[5px] px-2 py-1.5 text-xs text-text-secondary outline-none",
        "data-[highlighted]:bg-surface-hover data-[highlighted]:text-text-primary",
        destructive && "text-danger data-[highlighted]:text-danger",
        className,
      )}
    >
      {children}
    </DropdownMenuPrimitive.Item>
  );
}

export function DropdownMenuLabel({ children }: { children: React.ReactNode }) {
  return (
    <DropdownMenuPrimitive.Label className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted">
      {children}
    </DropdownMenuPrimitive.Label>
  );
}

export function DropdownMenuSeparator() {
  return <DropdownMenuPrimitive.Separator className="-mx-1 my-1 h-px bg-border-subtle" />;
}
