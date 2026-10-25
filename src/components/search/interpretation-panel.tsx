"use client";

import * as React from "react";
import { ArrowRight, Code2, Info, Sparkles, Tag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/state";
import type { SearchInterpretation } from "@/lib/api/shapes";
import type { QueryQualifier } from "@/lib/query/build";
import type { FollowUpSearch } from "@/lib/query/followups";

export function InterpretationPanel({
  interpretation,
  qualifiers,
  query,
  warnings,
  followUps,
  onFollowUp,
}: {
  interpretation: SearchInterpretation;
  qualifiers: QueryQualifier[];
  query: string;
  warnings: string[];
  followUps: FollowUpSearch[];
  onFollowUp: (followUp: FollowUpSearch) => void;
}) {
  const [open, setOpen] = React.useState(true);
  const signals = Object.entries(interpretation.signals)
    .filter(([key, value]) => key !== "alternativeTo" && value === true)
    .map(([key]) => key);

  return (
    <section
      aria-label="How this search was interpreted"
      className="rounded-lg border border-border bg-surface/60 p-3.5"
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <span className="flex items-center gap-2 text-xs font-medium text-text-secondary">
          <Sparkles className="size-3.5 text-accent-hover" />
          How RepoLens interpreted your request
          <span className="text-[11px] font-normal text-text-muted">
            (deterministic extraction — no AI involved)
          </span>
        </span>
        <span className="text-[11px] text-text-muted">{open ? "Hide" : "Show"}</span>
      </button>

      {open ? (
        <div className="mt-3 space-y-3">
          <dl className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            <PanelRow label="Keywords" icon={<Code2 className="size-3" />}>
              {interpretation.keywords.length > 0 ? (
                interpretation.keywords.map((keyword) => (
                  <Badge key={keyword}>{keyword}</Badge>
                ))
              ) : (
                <span className="text-[11px] text-text-muted">none detected</span>
              )}
            </PanelRow>

            <PanelRow label="Technologies" icon={<Sparkles className="size-3" />}>
              {interpretation.technologies.length > 0 ? (
                interpretation.technologies.map((tech) => (
                  <Badge key={tech.name} tone="accent" title={tech.language ? `language:${tech.language}` : undefined}>
                    {tech.name}
                  </Badge>
                ))
              ) : (
                <span className="text-[11px] text-text-muted">none detected</span>
              )}
            </PanelRow>

            <PanelRow label="Topics" icon={<Tag className="size-3" />}>
              {interpretation.topics.length > 0 ? (
                interpretation.topics.map((topic) => <Badge key={topic}>{topic}</Badge>)
              ) : (
                <span className="text-[11px] text-text-muted">none detected</span>
              )}
            </PanelRow>

            <PanelRow label="Signals" icon={<Info className="size-3" />}>
              {signals.length > 0 || interpretation.signals.alternativeTo ? (
                <>
                  {signals.map((signal) => (
                    <Badge key={signal} tone="success">
                      {signal.replace(/([A-Z])/g, " $1").toLowerCase()}
                    </Badge>
                  ))}
                  {interpretation.signals.alternativeTo ? (
                    <Badge tone="warning">alternative to {interpretation.signals.alternativeTo}</Badge>
                  ) : null}
                </>
              ) : (
                <span className="text-[11px] text-text-muted">none detected</span>
              )}
            </PanelRow>
          </dl>

          <div className="rounded-md border border-border-subtle bg-background-secondary/70 p-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted">
              GitHub query sent
            </p>
            <code className="mt-1 block break-words font-mono text-[12px] text-text-secondary">{query}</code>
            <ul className="mt-2 space-y-1">
              {qualifiers.map((qualifier, index) => (
                <li key={`${qualifier.qualifier}-${index}`} className="flex items-start gap-2 text-[11px]">
                  <Badge tone={qualifier.source === "user" ? "neutral" : qualifier.source === "filter" ? "success" : "accent"}>
                    {qualifier.source}
                  </Badge>
                  <span className="text-text-muted">
                    {qualifier.label} → <code className="font-mono text-text-secondary">{qualifier.qualifier}</code>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {interpretation.ignored.length > 0 ? (
            <p className="text-[11px] text-text-muted">
              Ignored as noise: {interpretation.ignored.join(", ")}
            </p>
          ) : null}

          {warnings.map((warning) => (
            <Notice key={warning} tone="warning">
              {warning}
            </Notice>
          ))}

          {followUps.length > 0 ? (
            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted">
                Suggested follow-up searches
              </p>
              <div className="flex flex-wrap gap-2">
                {followUps.map((followUp) => (
                  <Button
                    key={followUp.label}
                    size="sm"
                    variant="secondary"
                    title={followUp.description}
                    onClick={() => onFollowUp(followUp)}
                  >
                    {followUp.label}
                    <ArrowRight className="size-3" />
                  </Button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function PanelRow({
  label,
  icon,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-border-subtle bg-background-secondary/50 p-2.5">
      <dt className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted">
        {icon}
        {label}
      </dt>
      <dd className="flex flex-wrap gap-1">{children}</dd>
    </div>
  );
}
