import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Info, ScanSearch, TriangleAlert } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Notice } from "@/components/ui/state";
import { RepoHeader } from "@/components/repository/repo-header";
import { GithubApiError } from "@/lib/github/errors";
import { collectEvidence } from "@/lib/analyze/collect";
import { analyzeRepository, type Finding } from "@/lib/analyze/analyze";
import { formatDateTime } from "@/lib/utils";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface Params {
  owner: string;
  repo: string;
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { owner, repo } = await params;
  return { title: `Analyze ${owner}/${repo}` };
}

const SECTION_ICONS = {
  overview: Info,
  stack: Info,
  maintenance: Info,
  documentation: Info,
  structure: Info,
  strengths: CheckCircle2,
  limitations: TriangleAlert,
  "next-steps": ScanSearch,
} as const;

export default async function AnalyzePage({ params }: { params: Promise<Params> }) {
  const { owner, repo } = await params;

  let evidence;
  try {
    evidence = await collectEvidence({ owner, repo });
  } catch (error) {
    if (error instanceof GithubApiError && error.kind === "not_found") notFound();
    throw error;
  }

  const analysis = analyzeRepository(evidence);

  return (
    <div className="pb-16">
      <RepoHeader repository={evidence.repository} active="analyze" />

      <div className="mx-auto w-full max-w-[1100px] space-y-4 px-4 pt-5 sm:px-6">
        <Notice tone="info">{analysis.disclaimer}</Notice>

        {evidence.failed.length > 0 ? (
          <Notice tone="warning">
            The following GitHub calls did not return data: {evidence.failed.join(", ")}. Findings that depend on
            them are omitted rather than estimated.
          </Notice>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 text-[11px] text-text-muted">
          <span>Generated {formatDateTime(analysis.generatedAt)}</span>
          <span>·</span>
          <span>Evidence: repository metadata, languages, contributors, last 20 commits, README, root listing</span>
          <span>·</span>
          <Badge tone="neutral">fact</Badge>
          <span>read from the API</span>
          <Badge tone="accent">interpretation</Badge>
          <span>judgement drawn from those facts</span>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {analysis.sections.map((section) => {
            const Icon = SECTION_ICONS[section.id];
            return (
              <Card key={section.id} className="overflow-hidden">
                <CardHeader
                  icon={<Icon className="size-3.5" />}
                  title={`${analysis.sections.findIndex((entry) => entry.id === section.id) + 1}. ${section.title}`}
                  description={section.summary}
                />
                <ul className="divide-y divide-border-subtle">
                  {section.findings.map((finding) => (
                    <FindingRow key={finding.id} finding={finding} />
                  ))}
                </ul>
              </Card>
            );
          })}
        </div>

        {analysis.unavailable.length > 0 ? (
          <Card>
            <CardHeader title="Data RepoLens could not obtain" description="Stated instead of guessed" />
            <ul className="list-inside list-disc space-y-1 p-4 text-[12px] text-text-muted">
              {analysis.unavailable.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </Card>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Link
            href={`/repository/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/visualize`}
            className="rounded-md border border-border bg-surface-elevated px-3 py-1.5 text-xs text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
          >
            Open visualizations
          </Link>
          <Link
            href={`/search/repositories?mode=repository&q=${encodeURIComponent(`${owner}/${repo}`)}`}
            className="rounded-md border border-border bg-surface-elevated px-3 py-1.5 text-xs text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
          >
            Find similar repositories
          </Link>
          <a
            href={evidence.repository.htmlUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md border border-border bg-surface-elevated px-3 py-1.5 text-xs text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
          >
            Open on GitHub
          </a>
        </div>
      </div>
    </div>
  );
}

function FindingRow({ finding }: { finding: Finding }) {
  const tone =
    finding.tone === "positive"
      ? "border-l-success"
      : finding.tone === "caution"
        ? "border-l-warning"
        : "border-l-border";

  return (
    <li className={cn("border-l-2 px-4 py-3", tone)}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-[13px] font-medium text-text-primary">{finding.title}</h3>
        <Badge tone={finding.type === "fact" ? "neutral" : "accent"}>
          {finding.type === "fact" ? "fact" : "interpretation"}
        </Badge>
      </div>
      <p className="mt-1 text-[12px] leading-relaxed text-text-secondary">{finding.detail}</p>
      <p className="mt-1 font-mono text-[10px] leading-relaxed text-text-muted">
        evidence: {finding.evidence}
      </p>
    </li>
  );
}
