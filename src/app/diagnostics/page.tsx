"use client";
import { useState } from "react";
import { Gauge } from "lucide-react";
import { PageHeading, field, panel, workspace } from "@/components/ui/workspace";
import { Button } from "@/components/ui/button";
import { ErrorState, Notice } from "@/components/ui/state";
import { cn } from "@/lib/utils";

export default function DiagnosticsPage() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Record<string, unknown>>();
  return <div className={workspace}>
    <PageHeading title="Operational diagnostics" eyebrow="Administration" description="Inspect connectivity, throttling, cache counters, snapshot jobs, and model usage. Authorization is checked server-side." icon={<Gauge className="size-4" />} />
    <form className={cn(panel, "max-w-xl p-4")} onSubmit={async (event) => {
      event.preventDefault(); setBusy(true); setError(""); setResult(undefined);
      const form = event.currentTarget;
      const secret = new FormData(form).get("secret"); form.reset();
      try {
        const response = await fetch("/api/admin/diagnostics", { headers: { Authorization: `Bearer ${typeof secret === "string" ? secret : ""}` }, cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error("Diagnostics authorization failed or is not configured.");
        setResult(data);
      } catch (err) { setError(err instanceof Error ? err.message : "Could not read diagnostics."); } finally { setBusy(false); }
    }}><label className="block space-y-2 text-xs text-text-secondary">Operator credential<input type="password" name="secret" className={field} autoComplete="off" minLength={16} maxLength={180} required /></label><Button type="submit" className="mt-3" variant="primary" disabled={busy}>{busy ? "Checking…" : "Check services"}</Button></form>
    {error && <ErrorState title="Diagnostics unavailable" message={error} className="mt-4" />}
    {result && <section className="mt-4 space-y-3" aria-label="Diagnostics results"><Notice>GitHub and Redis operation counters describe the responding process only. Durable jobs and usage are shared in PostgreSQL.</Notice><div className="grid gap-3 lg:grid-cols-2">{Object.entries(result).map(([key, value]) => <section key={key} className={cn(panel, "min-w-0 p-4")}><h2 className="mb-2 font-semibold capitalize">{key}</h2><pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-text-secondary">{JSON.stringify(value, null, 2)}</pre></section>)}</div></section>}
  </div>;
}
