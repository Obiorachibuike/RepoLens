import { cn } from "@/lib/utils";

/**
 * RepoLens mark: a magnifying glass whose lens holds a pair of code brackets.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={cn("size-7", className)}
      role="img"
    >
      <defs>
        <linearGradient id="repolens-lens" x1="6" y1="4" x2="22" y2="20" gradientUnits="userSpaceOnUse">
          <stop stopColor="#8984ff" />
          <stop offset="1" stopColor="#5b54e6" />
        </linearGradient>
      </defs>
      <circle cx="14" cy="14" r="9.25" stroke="url(#repolens-lens)" strokeWidth="1.6" />
      <circle cx="14" cy="14" r="6.4" fill="var(--accent-soft)" />
      <path
        d="M11.9 11.2 9.3 14l2.6 2.8M16.1 11.2 18.7 14l-2.6 2.8"
        stroke="url(#repolens-lens)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="m21.4 21.4 6 6"
        stroke="var(--text-muted)"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("text-[15px] font-semibold tracking-tight text-text-primary", className)}>
      Repo<span className="text-accent-hover">Lens</span>
    </span>
  );
}
