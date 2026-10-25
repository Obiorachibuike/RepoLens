"use client";

import * as React from "react";
import { Database, KeyRound, Monitor, Moon, RefreshCw, Sparkles, Sun, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Notice } from "@/components/ui/state";
import { useAppConfig } from "@/components/app-providers";
import { useTheme } from "@/components/theme-provider";
import { useSaved } from "@/components/saved/saved-provider";
import { SEARCH_MODES_CONFIG, MODE_ORDER } from "@/components/search/modes";
import { clearAllLocalData } from "@/lib/storage/local";
import { readPreferences, writePreferences, type LocalPreferences } from "@/lib/storage/preferences";
import { PER_PAGE_OPTIONS, SORT_OPTIONS, type PerPage, type SortOption, type SearchMode } from "@/lib/validation/search";
import { formatExact } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface RateLimitState {
  core: { limit: number; remaining: number; resetAt: string | null } | null;
  search: { limit: number; remaining: number; resetAt: string | null } | null;
  authenticated: boolean;
}

const SORT_LABELS: Record<SortOption, string> = {
  "best-match": "Best match",
  stars: "Most stars",
  forks: "Most forks",
  updated: "Recently updated",
  "help-wanted-issues": "Most help-wanted issues",
};

export function SettingsView() {
  const config = useAppConfig();
  const { theme, setTheme } = useTheme();
  const saved = useSaved();
  const [prefs, setPrefs] = React.useState<LocalPreferences | null>(null);
  const [limits, setLimits] = React.useState<RateLimitState | null>(null);
  const [limitError, setLimitError] = React.useState<string | null>(null);
  const [loadingLimits, setLoadingLimits] = React.useState(false);
  const [cleared, setCleared] = React.useState(false);

  React.useEffect(() => {
    setPrefs(readPreferences());
  }, []);

  const loadLimits = React.useCallback(async () => {
    setLoadingLimits(true);
    setLimitError(null);
    try {
      const response = await fetch("/api/rate-limit");
      const body = (await response.json()) as RateLimitState & { error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? "Could not read the rate limit.");
      setLimits(body);
    } catch (error) {
      setLimitError(error instanceof Error ? error.message : "Could not read the rate limit.");
    } finally {
      setLoadingLimits(false);
    }
  }, []);

  React.useEffect(() => {
    void loadLimits();
  }, [loadLimits]);

  const updatePrefs = (partial: Partial<LocalPreferences>) => {
    const next = { ...(prefs ?? readPreferences()), ...partial };
    setPrefs(next);
    writePreferences(next);
  };

  return (
    <div className="mx-auto w-full max-w-[900px] px-4 pb-16 sm:px-6">
      <header className="py-10">
        <h1 className="text-[26px] font-semibold tracking-tight text-text-primary sm:text-[30px]">Settings</h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-text-secondary">
          Appearance, search defaults and the live status of every optional integration. Nothing here requires an
          account.
        </p>
      </header>

      <div className="space-y-4">
        <Card>
          <CardHeader title="Appearance" description="Applied immediately and remembered in this browser" />
          <div className="flex flex-wrap gap-2 p-4">
            {(
              [
                { id: "dark", label: "Dark", icon: Moon },
                { id: "light", label: "Light", icon: Sun },
                { id: "system", label: "System", icon: Monitor },
              ] as const
            ).map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setTheme(option.id)}
                aria-pressed={theme === option.id}
                className={cn(
                  "inline-flex items-center gap-2 rounded-md border px-3 py-2 text-xs transition-colors",
                  theme === option.id
                    ? "border-accent/50 bg-accent-soft text-text-primary"
                    : "border-border bg-surface-elevated text-text-secondary hover:bg-surface-hover",
                )}
              >
                <option.icon className="size-3.5" />
                {option.label}
              </button>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="Search defaults" description="Used when you open the search page without URL parameters" />
          {prefs ? (
            <div className="grid gap-4 p-4 sm:grid-cols-3">
              <Field label="Default mode" htmlFor="pref-mode">
                <Select
                  ariaLabel="Default search mode"
                  value={prefs.defaultMode}
                  onValueChange={(value) => updatePrefs({ defaultMode: value as SearchMode })}
                  options={MODE_ORDER.map((mode) => ({ value: mode, label: SEARCH_MODES_CONFIG[mode].label }))}
                />
              </Field>
              <Field label="Default sort" htmlFor="pref-sort">
                <Select
                  ariaLabel="Default sort"
                  value={prefs.defaultSort}
                  onValueChange={(value) => updatePrefs({ defaultSort: value as SortOption })}
                  options={SORT_OPTIONS.map((option) => ({ value: option, label: SORT_LABELS[option] }))}
                />
              </Field>
              <Field label="Results per page" htmlFor="pref-perpage">
                <Select
                  ariaLabel="Results per page"
                  value={String(prefs.defaultPerPage)}
                  onValueChange={(value) => updatePrefs({ defaultPerPage: Number(value) as PerPage })}
                  options={PER_PAGE_OPTIONS.map((option) => ({ value: String(option), label: String(option) }))}
                />
              </Field>
            </div>
          ) : null}
        </Card>

        <Card>
          <CardHeader
            title="Integrations"
            description="Server-side configuration status — values are never exposed to the browser"
            actions={
              <Button size="sm" variant="ghost" onClick={() => void loadLimits()} disabled={loadingLimits}>
                <RefreshCw className={cn("size-3.5", loadingLimits && "animate-spin-slow")} />
                Refresh
              </Button>
            }
          />
          <div className="space-y-3 p-4">
            <IntegrationRow
              icon={<KeyRound className="size-3.5" />}
              title="GitHub API token"
              enabled={config.github.authenticated}
              enabledLabel="Configured"
              disabledLabel="Not configured"
              detail={
                config.github.authenticated
                  ? "Higher limits (5,000 core / 30 search per minute) and code search are available."
                  : "Public search still works at 60 core / 10 search requests per hour. Set GITHUB_TOKEN server-side to raise it."
              }
            />
            <IntegrationRow
              icon={<Database className="size-3.5" />}
              title="PostgreSQL"
              enabled={config.database}
              enabledLabel="Configured"
              disabledLabel="Not configured"
              detail={
                config.database
                  ? `Saved repositories, collections and history are stored server-side (current mode: ${saved.mode}).`
                  : "Saved repositories, collections and history fall back to this browser's localStorage."
              }
            />
            <IntegrationRow
              icon={<Sparkles className="size-3.5" />}
              title="AI assistance"
              enabled={config.ai}
              enabledLabel="Configured"
              disabledLabel="Not required"
              detail="Discovery modes use a deterministic local extractor, so search never depends on a paid AI service."
            />
          </div>
        </Card>

        <Card>
          <CardHeader title="GitHub rate limits" description="Read live from GET /rate_limit" />
          <div className="p-4">
            {limitError ? (
              <Notice tone="warning">{limitError}</Notice>
            ) : !limits ? (
              <p className="text-xs text-text-muted">Loading…</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <LimitCard label="Core API" bucket={limits.core} />
                <LimitCard label="Search API" bucket={limits.search} />
              </div>
            )}
            <p className="mt-3 text-[11px] leading-relaxed text-text-muted">
              GitHub enforces 10 search requests per minute per IP for unauthenticated apps, and 30 per minute with
              a token. RepoLens de-duplicates identical in-flight requests and never retries a rate-limited call in
              a loop.
            </p>
          </div>
        </Card>

        <Card>
          <CardHeader title="Local data" description="Everything stored in this browser" />
          <div className="space-y-3 p-4">
            <p className="text-xs leading-relaxed text-text-secondary">
              Saved repositories: {formatExact(saved.items.length)} · Collections: {formatExact(saved.collections.length)}.
              Clearing removes local saves, collections, history and preferences from this browser. Server-side data
              is untouched.
            </p>
            <Button
              size="sm"
              variant="danger"
              onClick={() => {
                clearAllLocalData();
                void saved.refresh();
                setCleared(true);
              }}
            >
              <Trash2 className="size-3.5" />
              Clear local data
            </Button>
            {cleared ? (
              <p className="text-[11px] text-success">Local data cleared. Reload any open tabs to refresh them.</p>
            ) : null}
          </div>
        </Card>
      </div>
    </div>
  );
}

function IntegrationRow({
  icon,
  title,
  enabled,
  enabledLabel,
  disabledLabel,
  detail,
}: {
  icon: React.ReactNode;
  title: string;
  enabled: boolean;
  enabledLabel: string;
  disabledLabel: string;
  detail: string;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-border-subtle bg-background-secondary/50 p-3">
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-[13px] font-medium text-text-primary">
          <span className="text-text-muted">{icon}</span>
          {title}
        </p>
        <p className="mt-1 text-[11px] leading-relaxed text-text-muted">{detail}</p>
      </div>
      <Badge tone={enabled ? "success" : "warning"}>{enabled ? enabledLabel : disabledLabel}</Badge>
    </div>
  );
}

function LimitCard({
  label,
  bucket,
}: {
  label: string;
  bucket: { limit: number; remaining: number; resetAt: string | null } | null;
}) {
  if (!bucket) {
    return (
      <div className="rounded-md border border-border-subtle bg-background-secondary/50 p-3">
        <p className="text-[11px] uppercase tracking-[0.07em] text-text-muted">{label}</p>
        <p className="mt-1 text-xs text-text-muted">Not reported by GitHub.</p>
      </div>
    );
  }
  const used = Math.max(0, bucket.limit - bucket.remaining);
  const pct = bucket.limit > 0 ? (used / bucket.limit) * 100 : 0;
  return (
    <div className="rounded-md border border-border-subtle bg-background-secondary/50 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[11px] uppercase tracking-[0.07em] text-text-muted">{label}</p>
        <p className="text-[11px] tabular-nums text-text-secondary">
          {formatExact(bucket.remaining)} / {formatExact(bucket.limit)} left
        </p>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-hover">
        <div
          className={cn("h-full rounded-full", pct > 80 ? "bg-danger" : pct > 50 ? "bg-warning" : "bg-success")}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
      <p className="mt-1.5 text-[10px] text-text-muted">
        Resets {bucket.resetAt ? new Date(bucket.resetAt).toLocaleTimeString() : "soon"}
      </p>
    </div>
  );
}
