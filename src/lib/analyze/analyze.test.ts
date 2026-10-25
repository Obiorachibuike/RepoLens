import { describe, expect, it } from "vitest";
import { analyzeRepository, detectEcosystems, type AnalysisEvidence } from "./analyze";
import { mapLanguages, mapRepositoryDetail } from "@/lib/github/mappers";
import type { CommitSummary, ContributorSummary, TreeEntry } from "@/lib/github/types";
import { rawRepository } from "@/test-utils/fixtures";

const DAY = 86_400_000;
const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * DAY).toISOString();

const file = (name: string): TreeEntry => ({
  path: name,
  name,
  type: "file",
  size: 1024,
  downloadUrl: null,
});

const dir = (name: string): TreeEntry => ({
  path: name,
  name,
  type: "directory",
  size: null,
  downloadUrl: null,
});

const contributors: ContributorSummary[] = [
  { login: "gaearon", avatarUrl: null, htmlUrl: "https://github.com/gaearon", contributions: 1400, type: "User" },
  { login: "sophiebits", avatarUrl: null, htmlUrl: "https://github.com/sophiebits", contributions: 600, type: "User" },
  { login: "sebmarkbage", avatarUrl: null, htmlUrl: "https://github.com/sebmarkbage", contributions: 300, type: "User" },
];

const commits: CommitSummary[] = [
  { sha: "a1", htmlUrl: "https://github.com/facebook/react/commit/a1", message: "chore: bump", authorName: "Dev", authorLogin: "dev", authorAvatarUrl: null, date: iso(2) },
  { sha: "b2", htmlUrl: "https://github.com/facebook/react/commit/b2", message: "fix: leak", authorName: "Dev", authorLogin: "dev", authorAvatarUrl: null, date: iso(9) },
  { sha: "c3", htmlUrl: "https://github.com/facebook/react/commit/c3", message: "feat: x", authorName: "Dev", authorLogin: "dev", authorAvatarUrl: null, date: iso(140) },
];

const root: TreeEntry[] = [
  dir(".github"),
  dir("docs"),
  dir("packages"),
  file("package.json"),
  file("README.md"),
  file("CONTRIBUTING.md"),
  file("LICENSE"),
  file("CHANGELOG.md"),
];

function evidence(overrides: Partial<AnalysisEvidence> = {}): AnalysisEvidence {
  return {
    repository: mapRepositoryDetail({ ...rawRepository, pushed_at: iso(3), created_at: iso(4000) }),
    languages: mapLanguages({ JavaScript: 750_000, TypeScript: 200_000, CSS: 50_000 }),
    contributors,
    commits,
    readme: {
      content: "# React\n\n## Install\n\nRun npm install.\n\n## Usage\n\nImport it.",
      missing: false,
      truncated: false,
      bytes: 4200,
    },
    root,
    community: { healthPercentage: 88, files: {} },
    release: {
      tagName: "v19.1.0",
      name: "React 19.1",
      publishedAt: iso(30),
      htmlUrl: "https://github.com/facebook/react/releases/tag/v19.1.0",
      prerelease: false,
    },
    ...overrides,
  };
}

const section = (analysis: ReturnType<typeof analyzeRepository>, id: string) =>
  analysis.sections.find((entry) => entry.id === id);

describe("repository analysis", () => {
  it("produces all eight required sections in order", () => {
    const analysis = analyzeRepository(evidence());
    expect(analysis.sections.map((entry) => entry.id)).toEqual([
      "overview",
      "stack",
      "maintenance",
      "documentation",
      "structure",
      "strengths",
      "limitations",
      "next-steps",
    ]);
  });

  it("labels every finding as a fact or an interpretation and cites its evidence", () => {
    const analysis = analyzeRepository(evidence());
    const findings = analysis.sections.flatMap((entry) => entry.findings);
    expect(findings.length).toBeGreaterThan(10);
    for (const finding of findings) {
      expect(["fact", "interpretation"]).toContain(finding.type);
      expect(["positive", "neutral", "caution"]).toContain(finding.tone);
      expect(finding.evidence.length).toBeGreaterThan(0);
      expect(finding.detail.length).toBeGreaterThan(0);
    }
  });

  it("never claims the code was executed, tested or audited", () => {
    const analysis = analyzeRepository(evidence());
    expect(analysis.disclaimer).toMatch(/has not cloned, executed, tested or security-scanned/);
    const text = JSON.stringify(analysis.sections).toLowerCase();
    expect(text).not.toContain("we ran the");
    expect(text).not.toContain("tests pass");
    expect(text).not.toContain("security audit complete");
  });

  it("reports the real language distribution with percentages that add up", () => {
    const analysis = analyzeRepository(evidence());
    const stack = section(analysis, "stack");
    expect(stack).toBeDefined();
    const text = stack!.findings.map((finding) => `${finding.title} ${finding.detail}`).join(" ");
    expect(text).toMatch(/JavaScript/);
    expect(text).toMatch(/75(\.\d)?%/);
    const total = evidence().languages.reduce((sum, entry) => sum + entry.percentage, 0);
    expect(Math.round(total)).toBe(100);
  });

  it("counts recent commits from the sampled history and labels it a sample", () => {
    const analysis = analyzeRepository(evidence());
    const cadence = section(analysis, "maintenance")!.findings.find((finding) => finding.id === "maintenance-cadence");
    expect(cadence).toBeDefined();
    expect(cadence!.title).toMatch(/^2 of the last 3 commits are within 90 days$/);
    expect(cadence!.detail).toMatch(/This is a sample, not the full history\./);
  });

  it("reports the latest release as a fact with its endpoint", () => {
    const analysis = analyzeRepository(evidence());
    const release = section(analysis, "stack")!.findings.find((finding) => finding.id === "stack-release");
    expect(release).toBeDefined();
    expect(release!.type).toBe("fact");
    expect(release!.title).toMatch(/v19\.1\.0/);
    expect(release!.evidence).toMatch(/releases\/latest/);
  });

  it("flags an archived repository as a limitation", () => {
    const analysis = analyzeRepository(
      evidence({ repository: mapRepositoryDetail({ ...rawRepository, archived: true, pushed_at: iso(3) }) }),
    );
    const archived = section(analysis, "limitations")!.findings.find((finding) => finding.id === "limit-archived");
    expect(archived).toBeDefined();
    expect(archived!.tone).toBe("caution");
  });

  it("flags a missing license", () => {
    const analysis = analyzeRepository(
      evidence({ repository: mapRepositoryDetail({ ...rawRepository, license: null, pushed_at: iso(3) }) }),
    );
    expect(section(analysis, "limitations")!.findings.some((finding) => finding.id === "limit-no-license")).toBe(true);
  });

  it("flags long inactivity and derives a stale judgement", () => {
    const analysis = analyzeRepository(
      evidence({ repository: mapRepositoryDetail({ ...rawRepository, pushed_at: iso(800), updated_at: iso(800) }) }),
    );
    const stale = section(analysis, "limitations")!.findings.find((finding) => finding.id === "limit-stale");
    expect(stale).toBeDefined();
    expect(stale!.type).toBe("interpretation");
    expect(stale!.title).toMatch(/No pushes for 800 days/);
  });

  it("warns about key-person risk when one contributor dominates", () => {
    const solo: ContributorSummary[] = [
      { login: "solo", avatarUrl: null, htmlUrl: "https://github.com/solo", contributions: 500, type: "User" },
    ];
    const analysis = analyzeRepository(evidence({ contributors: solo }));
    const busFactor = section(analysis, "maintenance")!.findings.find((finding) => finding.id === "maintenance-bus-factor");
    expect(busFactor).toBeDefined();
    expect(busFactor!.tone).toBe("caution");
  });

  it("states what data was unavailable instead of guessing", () => {
    const analysis = analyzeRepository(
      evidence({
        languages: [],
        contributors: [],
        commits: [],
        root: [],
        community: null,
        release: null,
        readme: { content: null, missing: true, truncated: false, bytes: 0 },
      }),
    );
    expect(analysis.unavailable).toEqual(
      expect.arrayContaining(["root directory listing", "contributor list", "commit history", "language breakdown"]),
    );
    const docs = section(analysis, "documentation")!.findings;
    expect(docs.some((finding) => /README/i.test(finding.title))).toBe(true);
    // No fabricated numbers appear anywhere in the report.
    const text = JSON.stringify(analysis.sections);
    expect(text).not.toContain("unknown%");
  });

  it("records a truncated README rather than pretending it is complete", () => {
    const analysis = analyzeRepository(
      evidence({ readme: { content: "# React", missing: false, truncated: true, bytes: 1_000_000 } }),
    );
    const text = section(analysis, "documentation")!.findings.map((finding) => finding.detail).join(" ");
    expect(text).toMatch(/truncated/i);
  });

  it("detects the toolchain from filenames and calls it an inference", () => {
    const analysis = analyzeRepository(evidence());
    const toolchain = section(analysis, "stack")!.findings.find((finding) => finding.id === "stack-ecosystems");
    expect(toolchain).toBeDefined();
    expect(toolchain!.type).toBe("interpretation");
    expect(toolchain!.title).toMatch(/Node\.js \/ JavaScript/);
  });
});

describe("ecosystem detection", () => {
  it("maps manifest files to toolchains", () => {
    const signals = detectEcosystems([
      file("package.json"),
      file("tsconfig.json"),
      file("Cargo.toml"),
      file("go.mod"),
      dir(".github"),
    ]);
    expect(signals.map((signal) => signal.label)).toEqual([
      "Node.js / JavaScript",
      "TypeScript",
      "Rust / Cargo",
      "Go modules",
      "GitHub Actions / templates",
    ]);
  });

  it("returns nothing for an empty listing", () => {
    expect(detectEcosystems([])).toEqual([]);
  });
});
