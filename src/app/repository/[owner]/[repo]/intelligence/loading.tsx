import { Skeleton } from "@/components/ui/skeleton";
import { workspace } from "@/components/ui/workspace";
export default function Loading() { return <div className={`${workspace} space-y-5`} role="status" aria-label="Collecting evidence"><Skeleton className="h-12 max-w-sm" /><Skeleton className="h-16 w-full" /><div className="grid gap-4 sm:grid-cols-2"><Skeleton className="h-36" /><Skeleton className="h-36" /></div><p className="text-sm text-text-muted">Collecting repository evidence…</p></div>; }
