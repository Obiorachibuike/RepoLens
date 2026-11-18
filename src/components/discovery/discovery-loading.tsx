import { Skeleton } from "@/components/ui/skeleton";
import { workspace } from "@/components/ui/workspace";
export function DiscoveryLoading() { return <div className={`${workspace} space-y-5`} role="status" aria-label="Loading results"><Skeleton className="h-10 max-w-[340px]" /><Skeleton className="h-20" /><Skeleton className="h-28" /><Skeleton className="h-28" /></div>; }
