"use client";

import * as React from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { hasActiveFilters, type RepositoryFilters } from "@/lib/validation/search";

const POPULAR_LANGUAGES = [
  "Any language",
  "TypeScript",
  "JavaScript",
  "Python",
  "Go",
  "Rust",
  "Java",
  "C++",
  "C#",
  "Ruby",
  "PHP",
  "Swift",
  "Kotlin",
  "Dart",
  "Elixir",
  "Shell",
];

const LICENSES = [
  { value: "", label: "Any license" },
  { value: "mit", label: "MIT" },
  { value: "apache-2.0", label: "Apache-2.0" },
  { value: "gpl-3.0", label: "GPL-3.0" },
  { value: "bsd-3-clause", label: "BSD-3-Clause" },
  { value: "mpl-2.0", label: "MPL-2.0" },
  { value: "agpl-3.0", label: "AGPL-3.0" },
  { value: "unlicense", label: "Unlicense" },
];

export const EMPTY_FILTERS: RepositoryFilters = {
  language: undefined,
  topics: [],
  minStars: undefined,
  minForks: undefined,
  createdAfter: undefined,
  createdBefore: undefined,
  pushedAfter: undefined,
  pushedBefore: undefined,
  license: undefined,
  archived: "exclude",
  owner: undefined,
};

export function countActiveFilters(filters: RepositoryFilters): number {
  return (
    (filters.language ? 1 : 0) +
    (filters.topics?.length ? 1 : 0) +
    (filters.minStars !== undefined ? 1 : 0) +
    (filters.minForks !== undefined ? 1 : 0) +
    (filters.createdAfter ? 1 : 0) +
    (filters.createdBefore ? 1 : 0) +
    (filters.pushedAfter ? 1 : 0) +
    (filters.pushedBefore ? 1 : 0) +
    (filters.license ? 1 : 0) +
    (filters.owner ? 1 : 0) +
    (filters.archived !== "exclude" ? 1 : 0)
  );
}

export function FilterPanel({
  filters,
  onChange,
  onClear,
  className,
}: {
  filters: RepositoryFilters;
  onChange: (filters: RepositoryFilters) => void;
  onClear: () => void;
  className?: string;
}) {
  const active = hasActiveFilters(filters);
  const patch = (partial: Partial<RepositoryFilters>) => onChange({ ...filters, ...partial });
  const topicsValue = (filters.topics ?? []).join(", ");

  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-surface/70 p-4 backdrop-blur-sm",
        className,
      )}
    >
      <div className="mb-3.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-medium text-text-secondary">
          <SlidersHorizontal className="size-3.5 text-text-muted" />
          Filters
          {active ? (
            <span className="rounded-full bg-accent-soft px-1.5 py-[1px] text-[10px] font-semibold text-accent-hover">
              {countActiveFilters(filters)} active
            </span>
          ) : null}
        </div>
        {active ? (
          <Button size="sm" variant="ghost" onClick={onClear}>
            <X className="size-3.5" />
            Clear all
          </Button>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Language" htmlFor="filter-language" hint="Maps to GitHub's language: qualifier.">
          <Select
            ariaLabel="Filter by language"
            value={filters.language ?? ""}
            onValueChange={(value) => patch({ language: value === "" ? undefined : value })}
            options={POPULAR_LANGUAGES.map((language) => ({
              value: language === "Any language" ? "" : language,
              label: language,
            }))}
          />
        </Field>

        <Field
          label="Topics"
          htmlFor="filter-topics"
          hint="Comma-separated, up to 5 (e.g. react, ui, components)."
        >
          <Input
            id="filter-topics"
            value={topicsValue}
            placeholder="react, tailwindcss"
            onChange={(event) =>
              patch({
                topics: event.target.value
                  .split(",")
                  .map((topic) => topic.trim().toLowerCase())
                  .filter(Boolean)
                  .slice(0, 5),
              })
            }
          />
        </Field>

        <Field label="Owner" htmlFor="filter-owner" hint="Limit results to one user or organization.">
          <Input
            id="filter-owner"
            value={filters.owner ?? ""}
            placeholder="vercel"
            onChange={(event) => patch({ owner: event.target.value.trim() || undefined })}
          />
        </Field>

        <Field label="Minimum stars" htmlFor="filter-stars">
          <Input
            id="filter-stars"
            type="number"
            min={0}
            step={50}
            value={filters.minStars ?? ""}
            placeholder="100"
            onChange={(event) => {
              const raw = event.target.value;
              patch({ minStars: raw === "" ? undefined : Math.max(0, Number(raw)) });
            }}
          />
        </Field>

        <Field label="Minimum forks" htmlFor="filter-forks">
          <Input
            id="filter-forks"
            type="number"
            min={0}
            step={10}
            value={filters.minForks ?? ""}
            placeholder="10"
            onChange={(event) => {
              const raw = event.target.value;
              patch({ minForks: raw === "" ? undefined : Math.max(0, Number(raw)) });
            }}
          />
        </Field>

        <Field label="License" htmlFor="filter-license">
          <Select
            ariaLabel="Filter by license"
            value={filters.license ?? ""}
            onValueChange={(value) => patch({ license: value === "" ? undefined : value })}
            options={LICENSES}
          />
        </Field>

        <Field label="Created on or after" htmlFor="filter-created-after">
          <Input
            id="filter-created-after"
            type="date"
            value={filters.createdAfter ?? ""}
            onChange={(event) => patch({ createdAfter: event.target.value || undefined })}
          />
        </Field>

        <Field label="Created on or before" htmlFor="filter-created-before">
          <Input
            id="filter-created-before"
            type="date"
            value={filters.createdBefore ?? ""}
            onChange={(event) => patch({ createdBefore: event.target.value || undefined })}
          />
        </Field>

        <Field label="Pushed on or after" htmlFor="filter-pushed-after" hint="Filters for recently updated work.">
          <Input
            id="filter-pushed-after"
            type="date"
            value={filters.pushedAfter ?? ""}
            onChange={(event) => patch({ pushedAfter: event.target.value || undefined })}
          />
        </Field>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-border-subtle pt-3.5">
        <div className="flex flex-wrap items-center gap-4">
          <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-text-muted">Archived</span>
          {(["exclude", "include", "only"] as const).map((option) => (
            <label key={option} className="flex cursor-pointer items-center gap-1.5 text-xs text-text-secondary">
              <input
                type="radio"
                name="archived"
                className="accent-[var(--accent)]"
                checked={filters.archived === option}
                onChange={() => patch({ archived: option })}
              />
              {option === "exclude" ? "Exclude" : option === "include" ? "Include" : "Only archived"}
            </label>
          ))}
        </div>
        <p className="text-[11px] text-text-muted">
          Archived repositories are read-only. Excluding them is recommended for active projects.
        </p>
      </div>
    </div>
  );
}
