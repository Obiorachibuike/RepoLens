"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { useAppConfig } from "@/components/app-providers";
import { PageHeading, Metric, workspace } from "@/components/ui/workspace";
import { ErrorState, Notice } from "@/components/ui/state";
import { Skeleton } from "@/components/ui/skeleton";
import { ensureSession } from "@/lib/storage/session-client";

type Usage = { attempts: number; successes: number; failures: number; pending: number; input: number | null; output: number | null; costMicros: number | null; priced: number };
export default function UsagePage() {
  const config = useAppConfig();
  const [usage, setUsage] = useState<Usage>();
  const [error, setError] = useState("");
  useEffect(() => {
    if (!config.database) return;
    const controller = new AbortController();
    async function load() {
      if (!await ensureSession()) throw new Error("Could not start a workspace session.");
      const response = await fetch("/api/usage", { signal: controller.signal });
      const data = await response.json() as { last30Days?: Usage; error?: { message?: string } };
      if (!response.ok) throw new Error(data.error?.message ?? "Usage unavailable.");
      if (!controller.signal.aborted) setUsage(data.last30Days);
    }
    load().catch((err: unknown) => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Usage unavailable."); });
    return () => controller.abort();
  }, [config.database]);
  return <div className={workspace}><PageHeading title="AI usage" eyebrow="Account / AI usage" description="Provider attempts and reported tokens for this workspace in the last 30 days. Provider fallback is counted as a separate attempt." icon={<BarChart3 className="size-4" />} />
    {!config.database ? <Notice tone="warning">Usage requires configured PostgreSQL. See <Link className="underline" href="/settings">settings</Link>.</Notice> : error ? <ErrorState title="Usage could not load" message={error} /> : usage ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Metric label="Provider attempts" value={usage.attempts} detail={`${usage.successes} validated · ${usage.failures} unsuccessful · ${usage.pending} unresolved`} /><Metric label="Input tokens" value={usage.input?.toLocaleString() ?? "—"} detail="Provider-reported counts" /><Metric label="Output tokens" value={usage.output?.toLocaleString() ?? "—"} detail="Provider-reported counts" /><Metric label="Estimated cost" value={usage.costMicros === null ? "—" : `$${(usage.costMicros / 1e6).toFixed(4)}`} detail={usage.priced ? `${usage.priced} attempts with pricing and token data` : "Pricing or usage not available"} />
    </div> : <div className="grid gap-3 sm:grid-cols-2" role="status" aria-label="Loading usage"><Skeleton className="h-28" /><Skeleton className="h-28" /></div>}
  </div>;
}
