import { Skeleton } from "@/components/ui/skeleton";
import { workspace } from "@/components/ui/workspace";

export default function WorkspaceLoading() {
  return <div className={`${workspace} space-y-4`} role="status" aria-label="Loading workspace">
    <Skeleton className="h-72 rounded-2xl sm:h-96" />
    <div className="grid gap-2 sm:grid-cols-3"><Skeleton className="h-20" /><Skeleton className="h-20" /><Skeleton className="h-20" /></div>
  </div>;
}
