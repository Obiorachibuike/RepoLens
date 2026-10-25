import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-accent text-white hover:bg-accent-hover shadow-[0_1px_0_rgba(255,255,255,0.08)_inset]",
        secondary:
          "border border-border bg-surface-elevated text-text-primary hover:bg-surface-hover hover:border-[color-mix(in_srgb,var(--border)_70%,var(--accent)_30%)]",
        ghost: "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
        outline: "border border-border bg-transparent text-text-secondary hover:bg-surface-hover hover:text-text-primary",
        subtle: "bg-accent-soft text-accent-hover border border-transparent hover:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]",
        danger: "border border-[color-mix(in_srgb,var(--danger)_45%,var(--border))] text-danger hover:bg-[color-mix(in_srgb,var(--danger)_14%,transparent)]",
        link: "text-accent-hover underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-8 px-2.5 text-xs [&_svg]:size-3.5",
        md: "h-9 px-3.5 text-sm [&_svg]:size-4",
        lg: "h-11 px-5 text-sm [&_svg]:size-4",
        icon: "size-8 [&_svg]:size-4",
        "icon-sm": "size-7 [&_svg]:size-3.5",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = "button", ...props }, ref) => (
    <button ref={ref} type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  ),
);
Button.displayName = "Button";

export { buttonVariants };
