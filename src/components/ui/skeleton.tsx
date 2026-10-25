import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} aria-hidden="true" />;
}

/** Skeleton that mimics the results table so loading feels stable. */
export function ResultsSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="divide-y divide-border-subtle" role="status" aria-label="Loading results">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="grid grid-cols-[minmax(0,1fr)_120px_90px_110px_168px] gap-4 px-4 py-3.5">
          <div className="space-y-2">
            <Skeleton className="h-3.5 w-44" />
            <Skeleton className="h-3 w-full max-w-lg" />
            <div className="flex gap-1.5 pt-0.5">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-12" />
            </div>
          </div>
          <Skeleton className="h-3.5 w-20" />
          <Skeleton className="h-3.5 w-12" />
          <Skeleton className="h-3.5 w-16" />
          <div className="flex gap-1.5">
            <Skeleton className="h-7 w-9" />
            <Skeleton className="h-7 w-9" />
            <Skeleton className="h-7 w-9" />
            <Skeleton className="h-7 w-9" />
          </div>
        </div>
      ))}
      <span className="sr-only">Loading results…</span>
    </div>
  );
}

export function CardsSkeleton({ cards = 4 }: { cards?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2" role="status" aria-label="Loading">
      {Array.from({ length: cards }).map((_, index) => (
        <div key={index} className="space-y-2 rounded-lg border border-border bg-surface/60 p-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-2/3" />
          <div className="flex gap-2 pt-1">
            <Skeleton className="h-5 w-14" />
            <Skeleton className="h-5 w-14" />
          </div>
        </div>
      ))}
    </div>
  );
}
