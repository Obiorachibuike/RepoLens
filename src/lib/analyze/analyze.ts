import type { CommitSummary, ContributorSummary, LanguageStat, RepositoryDetail, TreeEntry } from "@/lib/github/types";
import type { CommunityProfile, ReleaseSummary } from "@/lib/github/repos";
import { daysBetween, formatCompact, formatExact, timeAgo } from "@/lib/utils";

/**
 * Deterministic, evidence-based repository analysis.
 *
 * Every finding carries the exact evidence it was derived from, and is labelled
 * either `fact` (read straight from the GitHub API) or `interpretation`
 * (a judgement RepoLens draws from those facts). Nothing here claims to have
 * executed, tested or security-scanned the repository's code.
 */

export interface AnalysisEvidence {
  repository: RepositoryDetail;
  languages: LanguageStat[];
  contributors: ContributorSummary[];
  commits: CommitSummary[];
  readme: { content: string | null; missing: boolean; truncated: boolean; bytes: number };
  root: TreeEntry[];
  community: CommunityProfile | null;
  release: ReleaseSummary | null;
}

export type FindingType = "fact" | "interpretation";
export type FindingTone = "positive" | "neutral" | "caution";

export interface Finding {
  id: string;
  type: FindingType;
  tone: FindingTone;
  title: string;
  detail: string;
  /** Where the evidence came from, e.g. "GET /repos/x/y (pushed_at)". */
  evidence: string;
}

export interface AnalysisSection {
  id:
    | "overview"
    | "stack"
    | "maintenance"
    | "documentation"
    | "structure"
    | "strengths"
    | "limitations"
    | "next-steps";
  title: string;
  summary: string;
  findings: Finding[];
}

export interface RepositoryAnalysis {
  fullName: string;
  generatedAt: string;
  sections: AnalysisSection[];
  /** Data RepoLens could not obtain — stated rather than guessed. */
  unavailable: string[];
  disclaimer: string;
}

const DISCLAIMER =
  "This analysis is generated from public GitHub metadata only (repository details, languages, contributors, recent commits, README and the root directory listing). RepoLens has not cloned, executed, tested or security-scanned this code.";

export function analyzeRepository(evidence: AnalysisEvidence): RepositoryAnalysis {
  const { repository, languages, contributors, commits, readme, root, community, release } = evidence;
  const unavailable: string[] = [];

  const daysSincePush = daysBetween(repository.pushedAt || repository.updatedAt);
  const daysSinceCreate = daysBetween(repository.createdAt);
  const rootNames = new Set(root.map((entry) => entry.name.toLowerCase()));
  const hasDir = (name: string) => rootNames.has(name.toLowerCase());

  if (root.length === 0) unavailable.push("root directory listing");
  if (contributors.length === 0) unavailable.push("contributor list");
  if (commits.length === 0) unavailable.push("commit history");
  if (languages.length === 0) unavailable.push("language breakdown");

  /* ---------------------------- 1. Overview ----------------------------- */
  const overview: Finding[] = [
    fact(
      "overview-stars",
      `${formatExact(repository.stargazersCount)} stars, ${formatExact(repository.forksCount)} forks`,
      `GitHub reports ${formatExact(repository.stargazersCount)} stars, ${formatExact(repository.forksCount)} forks and ${formatExact(repository.openIssuesCount)} open issues/PRs.`,
      "GET /repos (stargazers_count, forks_count, open_issues_count)",
      repository.stargazersCount >= 500 ? "positive" : "neutral",
    ),
    fact(
      "overview-age",
      daysSinceCreate === null
        ? "Creation date not available"
        : `Created ${timeAgo(repository.createdAt)} (${formatExact(daysSinceCreate)} days ago)`,
      daysSinceCreate === null
        ? "The created_at field was missing from the API response."
        : `The repository has existed for ${formatExact(daysSinceCreate)} days.`,
      "GET /repos (created_at)",
    ),
    fact(
      "overview-license",
      repository.license ? `Licensed under ${repository.license.name}` : "No license detected by GitHub",
      repository.license
        ? `GitHub identified the ${repository.license.name} license${
            repository.license.spdxId ? ` (${repository.license.spdxId})` : ""
          }.`
        : "The license field was null, which usually means no LICENSE file was recognised.",
      "GET /repos (license)",
      repository.license ? "positive" : "caution",
    ),
    fact(
      "overview-status",
      repository.archived ? "Archived (read-only)" : repository.disabled ? "Disabled" : "Active repository",
      repository.archived
        ? "GitHub marks this repository as archived: it is read-only and no longer maintained."
        : repository.disabled
          ? "GitHub marks this repository as disabled."
          : "The repository is neither archived nor disabled.",
      "GET /repos (archived, disabled)",
      repository.archived || repository.disabled ? "caution" : "positive",
    ),
  ];
  if (repository.topics.length > 0) {
    overview.push(
      fact(
        "overview-topics",
        `Tagged: ${repository.topics.slice(0, 8).join(", ")}`,
        `The maintainer set ${repository.topics.length} topic tag(s).`,
        "GET /repos (topics)",
      ),
    );
  }
  if (repository.homepage) {
    overview.push(
      fact("overview-homepage", `Project website: ${repository.homepage}`, "A homepage URL is configured.", "GET /repos (homepage)"),
    );
  }

  /* ------------------------ 2. Technology stack ------------------------- */
  const stack: Finding[] = [];
  if (languages.length > 0) {
    const top = languages.slice(0, 6);
    stack.push(
      fact(
        "stack-languages",
        top.map((entry) => `${entry.language} ${entry.percentage}%`).join(" · "),
        `Byte counts from the languages endpoint: ${languages
          .map((entry) => `${entry.language} ${formatCompact(entry.bytes)} bytes`)
          .join(", ")}.`,
        "GET /repos/{owner}/{repo}/languages",
      ),
    );
  } else {
    unavailable.push("language byte counts");
  }

  const ecosystems = detectEcosystems(root);
  if (ecosystems.length > 0) {
    stack.push(
      interpretation(
        "stack-ecosystems",
        `Detected toolchain: ${ecosystems.map((entry) => entry.label).join(", ")}`,
        `Inferred from files in the root directory: ${ecosystems
          .map((entry) => entry.label)
          .join(", ")}. This is an inference from filenames, not from executing the project.`,
        "Root directory listing (GET /contents)",
      ),
    );
  }
  if (release) {
    stack.push(
      fact(
        "stack-release",
        `Latest release ${release.tagName}${release.publishedAt ? ` (${timeAgo(release.publishedAt)})` : ""}`,
        release.name
          ? `The most recent published release is ${release.name} (${release.tagName}).`
          : `The most recent published release tag is ${release.tagName}.`,
        "GET /repos/{owner}/{repo}/releases/latest",
        "positive",
      ),
    );
  }

  /* --------------------------- 3. Maintenance --------------------------- */
  const maintenance: Finding[] = [];
  if (daysSincePush !== null) {
    const tone: FindingTone = daysSincePush <= 90 ? "positive" : daysSincePush <= 365 ? "neutral" : "caution";
    maintenance.push(
      fact(
        "maintenance-push",
        `Last push ${timeAgo(repository.pushedAt || repository.updatedAt)}`,
        `pushed_at is ${new Date(repository.pushedAt || repository.updatedAt).toISOString()} (${formatExact(daysSincePush)} days ago).`,
        "GET /repos (pushed_at)",
        tone,
      ),
    );
  }

  const recentCommits = commits.filter((commit) => {
    const days = daysBetween(commit.date);
    return days !== null && days <= 90;
  });
  if (commits.length > 0) {
    maintenance.push(
      fact(
        "maintenance-cadence",
        `${recentCommits.length} of the last ${commits.length} commits are within 90 days`,
        `RepoLens fetched the ${commits.length} most recent commits on ${repository.defaultBranch} and counted how many are dated within the last 90 days. This is a sample, not the full history.`,
        "GET /repos/{owner}/{repo}/commits?per_page=" + commits.length,
        recentCommits.length > 0 ? "positive" : "caution",
      ),
    );
  }

  if (contributors.length > 0) {
    const total = contributors.reduce((sum, entry) => sum + entry.contributions, 0);
    const top = contributors[0];
    const concentration = top && total > 0 ? Math.round((top.contributions / total) * 100) : null;
    maintenance.push(
      fact(
        "maintenance-contributors",
        `${contributors.length} contributor(s) listed${top ? ` — ${top.login} leads with ${formatExact(top.contributions)}` : ""}`,
        total > 0
          ? `Across the ${contributors.length} contributors returned, the top contributor accounts for ${concentration}% of the ${formatExact(total)} sampled commits.`
          : "Contribution counts were not provided.",
        "GET /repos/{owner}/{repo}/contributors",
      ),
    );
    if (concentration !== null && contributors.length <= 3 && concentration >= 70) {
      maintenance.push(
        interpretation(
          "maintenance-bus-factor",
          "Key-person risk: contributions are concentrated",
          `Only ${contributors.length} contributor(s) are listed and the top one made ${concentration}% of the sampled commits. Bus-factor risk is a judgement, not a measured value.`,
          "Derived from GET /contributors",
          "caution",
        ),
      );
    }
  }

  maintenance.push(
    fact(
      "maintenance-issues",
      `${formatExact(repository.openIssuesCount)} open issues and pull requests`,
      repository.hasIssues
        ? "The issue tracker is enabled; open_issues_count includes pull requests."
        : "The issue tracker is disabled for this repository.",
      "GET /repos (open_issues_count, has_issues)",
      repository.hasIssues ? "neutral" : "caution",
    ),
  );

  /* -------------------------- 4. Documentation -------------------------- */
  const docs: Finding[] = [];
  if (readme.missing) {
    docs.push(
      fact(
        "docs-readme-missing",
        "No README found",
        "GitHub returned 404 for the README endpoint.",
        "GET /repos/{owner}/{repo}/readme",
        "caution",
      ),
    );
  } else {
    const words = readme.content ? readme.content.split(/\s+/).filter(Boolean).length : 0;
    docs.push(
      fact(
        "docs-readme",
        `README present (${formatExact(readme.bytes)} bytes, ~${formatExact(words)} words)${readme.truncated ? " — truncated for display" : ""}`,
        `The README endpoint returned ${formatExact(readme.bytes)} bytes of Markdown.${
          readme.truncated
            ? " RepoLens only received the first portion of it, so the word count and any structural observations below describe a truncated copy."
            : ""
        }`,
        "GET /repos/{owner}/{repo}/readme",
        words >= 150 ? "positive" : "neutral",
      ),
    );
    const headings = readme.content ? countHeadings(readme.content) : 0;
    if (headings > 0) {
      docs.push(
        interpretation(
          "docs-structure",
          `README has ${headings} section heading(s)`,
          "Counted Markdown headings in the README. More sections usually means install/usage documentation exists, but content quality was not assessed.",
          "README Markdown",
        ),
      );
    }
  }

  const docFiles: Array<[string, string]> = [
    ["CONTRIBUTING", "contribution guide"],
    ["CODE_OF_CONDUCT", "code of conduct"],
    ["CHANGELOG", "changelog"],
    ["SECURITY", "security policy"],
    ["LICENSE", "license file"],
  ];
  const presentDocs = docFiles.filter(([base]) =>
    root.some((entry) => entry.name.toLowerCase().startsWith(base.toLowerCase())),
  );
  const missingDocs = docFiles.filter(([base]) =>
    !root.some((entry) => entry.name.toLowerCase().startsWith(base.toLowerCase())),
  );
  if (presentDocs.length > 0) {
    docs.push(
      fact(
        "docs-files",
        `Present: ${presentDocs.map(([, label]) => label).join(", ")}`,
        `Found in the root directory: ${presentDocs.map(([base]) => base).join(", ")}.`,
        "Root directory listing (GET /contents)",
        "positive",
      ),
    );
  }
  if (missingDocs.length > 0) {
    docs.push(
      fact(
        "docs-missing-files",
        `Not found: ${missingDocs.map(([, label]) => label).join(", ")}`,
        `These files were absent from the root directory listing.`,
        "Root directory listing (GET /contents)",
        "caution",
      ),
    );
  }
  if (hasDir("docs") || hasDir("documentation")) {
    docs.push(
      fact("docs-dir", "Dedicated docs/ directory", "A docs directory exists at the repository root.", "Root directory listing", "positive"),
    );
  }
  if (community?.healthPercentage !== null && community?.healthPercentage !== undefined) {
    docs.push(
      fact(
        "docs-health",
        `GitHub community health: ${community.healthPercentage}%`,
        "GitHub's own community profile score for this repository.",
        "GET /repos/{owner}/{repo}/community/profile",
        community.healthPercentage >= 70 ? "positive" : "neutral",
      ),
    );
  }

  /* ---------------------------- 5. Structure ---------------------------- */
  const structure: Finding[] = [];
  if (root.length > 0) {
    const dirs = root.filter((entry) => entry.type === "directory");
    const files = root.filter((entry) => entry.type === "file");
    structure.push(
      fact(
        "structure-root",
        `${dirs.length} director${dirs.length === 1 ? "y" : "ies"} and ${files.length} file(s) at the root`,
        `Root entries: ${root
          .slice(0, 24)
          .map((entry) => entry.name)
          .join(", ")}${root.length > 24 ? ", …" : ""}.`,
        "GET /repos/{owner}/{repo}/contents",
      ),
    );
    const monorepoMarkers = ["packages", "apps"].filter(hasDir);
    const monorepoFiles = ["pnpm-workspace.yaml", "lerna.json", "turbo.json", "nx.json", "rush.json"].filter((name) =>
      rootNames.has(name.toLowerCase()),
    );
    if (monorepoMarkers.length > 0 || monorepoFiles.length > 0) {
      structure.push(
        interpretation(
          "structure-monorepo",
          "Looks like a monorepo / multi-package workspace",
          `Detected ${[...monorepoMarkers, ...monorepoFiles].join(", ")}. Monorepo tooling is inferred from filenames.`,
          "Root directory listing",
        ),
      );
    }
    const testDirs = ["test", "tests", "__tests__", "spec", "e2e", "cypress", "playwright"].filter(hasDir);
    const testFiles = root.filter((entry) => /\.test\.|\.spec\.|_test\./.test(entry.name)).map((entry) => entry.name);
    if (testDirs.length > 0 || testFiles.length > 0) {
      structure.push(
        fact(
          "structure-tests",
          `Test code present (${[...testDirs, ...testFiles].slice(0, 5).join(", ")})`,
          "Test directories or test files exist in the repository. Coverage was not measured.",
          "Root directory listing",
          "positive",
        ),
      );
    } else {
      structure.push(
        interpretation(
          "structure-no-tests",
          "No test directory at the root",
          "No common test folder or test file was found at the root. Tests may still live inside subdirectories that were not listed.",
          "Root directory listing",
          "caution",
        ),
      );
    }
    if (rootNames.has("dockerfile") || rootNames.has("docker-compose.yml") || rootNames.has("compose.yaml")) {
      structure.push(
        fact("structure-docker", "Container definitions present", "A Dockerfile or compose file exists at the root.", "Root directory listing", "positive"),
      );
    }
    if (hasDir(".github")) {
      structure.push(
        fact("structure-ci", ".github directory present", "Usually contains workflows, issue templates or funding files.", "Root directory listing"),
      );
    }
  }

  /* ---------------------------- 6. Strengths ---------------------------- */
  const strengths: Finding[] = [];
  const pushStrength = (finding: Finding | null) => {
    if (finding) strengths.push(finding);
  };

  pushStrength(
    daysSincePush !== null && daysSincePush <= 90
      ? interpretation(
          "strength-active",
          "Actively maintained",
          `The last push was ${timeAgo(repository.pushedAt || repository.updatedAt)}, within the 90-day window RepoLens treats as active.`,
          "GET /repos (pushed_at)",
          "positive",
        )
      : null,
  );
  pushStrength(
    contributors.length >= 5
      ? interpretation(
          "strength-community",
          "Multi-contributor community",
          `${contributors.length} contributors are listed, which reduces key-person risk.`,
          "GET /contributors",
          "positive",
        )
      : null,
  );
  pushStrength(
    repository.license
      ? interpretation(
          "strength-license",
          "Clear license",
          `The ${repository.license.name} license gives you a defined set of usage rights.`,
          "GET /repos (license)",
          "positive",
        )
      : null,
  );
  pushStrength(
    !readme.missing && readme.bytes > 2000
      ? interpretation(
          "strength-readme",
          "Substantial README",
          `A ${formatExact(readme.bytes)}-byte README usually covers installation and usage.`,
          "GET /readme",
          "positive",
        )
      : null,
  );
  pushStrength(
    release
      ? interpretation(
          "strength-release",
          "Published releases",
          `Tagged releases (${release.tagName}) make it easier to pin a stable version.`,
          "GET /releases/latest",
          "positive",
        )
      : null,
  );
  pushStrength(
    repository.stargazersCount >= 1000
      ? interpretation(
          "strength-traction",
          "Significant adoption",
          `${formatExact(repository.stargazersCount)} stars and ${formatExact(repository.forksCount)} forks indicate real-world usage.`,
          "GET /repos",
          "positive",
        )
      : null,
  );
  if (strengths.length === 0) {
    strengths.push(
      interpretation(
        "strength-none",
        "No strong positive signals detected",
        "None of the positive thresholds (recent push, contributors, license, releases, adoption) were met with the data available.",
        "Derived from the evidence above",
        "neutral",
      ),
    );
  }

  /* --------------------------- 7. Limitations --------------------------- */
  const limitations: Finding[] = [];
  if (repository.archived) {
    limitations.push(
      fact(
        "limit-archived",
        "Repository is archived",
        "Archived repositories are read-only: expect no fixes or new releases.",
        "GET /repos (archived)",
        "caution",
      ),
    );
  }
  if (daysSincePush !== null && daysSincePush > 365) {
    limitations.push(
      interpretation(
        "limit-stale",
        `No pushes for ${formatExact(daysSincePush)} days`,
        "Long gaps often mean dependencies and platform support have drifted.",
        "GET /repos (pushed_at)",
        "caution",
      ),
    );
  }
  if (!repository.license) {
    limitations.push(
      interpretation(
        "limit-no-license",
        "No license detected",
        "Without a license, default copyright applies: you may not legally reuse the code. Confirm with the maintainer before using it.",
        "GET /repos (license = null)",
        "caution",
      ),
    );
  }
  if (readme.missing) {
    limitations.push(
      interpretation("limit-no-readme", "No README", "Onboarding will require reading the source directly.", "GET /readme → 404", "caution"),
    );
  }
  if (contributors.length === 1 && contributors[0]) {
    limitations.push(
      interpretation(
        "limit-solo",
        `Single listed contributor (${contributors[0].login})`,
        "Maintenance depends on one person.",
        "GET /contributors",
        "caution",
      ),
    );
  }
  if (repository.size > 0 && repository.size < 50 && daysSinceCreate !== null && daysSinceCreate > 365) {
    limitations.push(
      interpretation(
        "limit-tiny",
        "Very small codebase",
        `The repository reports ${formatExact(repository.size)} KB, which suggests an example or early prototype rather than a full library.`,
        "GET /repos (size)",
        "caution",
      ),
    );
  }
  if (limitations.length === 0) {
    limitations.push(
      interpretation(
        "limit-none",
        "No blocking limitations detected",
        "Based on the available metadata, nothing immediately rules this project out. Review the source before adopting it.",
        "Derived from the evidence above",
        "neutral",
      ),
    );
  }

  /* --------------------------- 8. Next steps ---------------------------- */
  const nextSteps: Finding[] = [
    interpretation(
      "next-readme",
      readme.missing ? "Read the source entry point" : "Skim the README quick-start",
      readme.missing
        ? `Open ${repository.htmlUrl} and locate the entry point in the root listing above.`
        : "Confirm the documented install steps match the current default branch.",
      "README / repository root",
    ),
    interpretation(
      "next-license",
      repository.license ? "Check license compatibility" : "Ask the maintainer about licensing",
      repository.license
        ? `Verify the ${repository.license.name} terms fit your project before depending on it.`
        : "No license means no reuse rights by default.",
      "License file",
    ),
    interpretation(
      "next-activity",
      "Inspect recent commits before pinning a version",
      `The commits endpoint returned ${commits.length} recent commit(s); look for dependency bumps and issue references.`,
      "GET /commits",
    ),
  ];
  if (repository.hasIssues) {
    nextSteps.push(
      interpretation(
        "next-issues",
        "Scan open issues for your use case",
        `${formatExact(repository.openIssuesCount)} open issues/PRs — search them for your platform or feature before adopting.`,
        "GET /repos (open_issues_count)",
      ),
    );
  }
  if (release) {
    nextSteps.push(
      interpretation(
        "next-release",
        `Pin ${release.tagName} rather than the default branch`,
        "Releases give you a stable, documented version to depend on.",
        "GET /releases/latest",
      ),
    );
  }

  const sections: AnalysisSection[] = [
    {
      id: "overview",
      title: "Project overview",
      summary: repository.description ?? "No description was provided by the maintainer.",
      findings: overview,
    },
    {
      id: "stack",
      title: "Technology stack",
      summary:
        languages.length > 0
          ? `Primary language: ${repository.language ?? languages[0]?.language ?? "Not reported"}.`
          : "Language data was not available from the API.",
      findings: stack,
    },
    {
      id: "maintenance",
      title: "Maintenance indicators",
      summary:
        daysSincePush !== null
          ? `Last push ${timeAgo(repository.pushedAt || repository.updatedAt)}.`
          : "Push date unavailable.",
      findings: maintenance,
    },
    {
      id: "documentation",
      title: "Documentation availability",
      summary: readme.missing ? "No README was found." : `README present (${formatExact(readme.bytes)} bytes).`,
      findings: docs,
    },
    {
      id: "structure",
      title: "Repository structure",
      summary: root.length > 0 ? `${root.length} entries at the repository root.` : "Structure unavailable.",
      findings: structure,
    },
    { id: "strengths", title: "Potential strengths", summary: "Positive signals supported by the evidence above.", findings: strengths },
    { id: "limitations", title: "Potential limitations", summary: "Risks supported by the evidence above.", findings: limitations },
    { id: "next-steps", title: "Recommended next steps", summary: "What to check before you depend on this project.", findings: nextSteps },
  ];

  return {
    fullName: repository.fullName,
    generatedAt: new Date().toISOString(),
    sections,
    unavailable,
    disclaimer: DISCLAIMER,
  };
}

/* -------------------------------------------------------------------------- */

function fact(
  id: string,
  title: string,
  detail: string,
  evidence: string,
  tone: FindingTone = "neutral",
): Finding {
  return { id, type: "fact", tone, title, detail, evidence };
}

function interpretation(
  id: string,
  title: string,
  detail: string,
  evidence: string,
  tone: FindingTone = "neutral",
): Finding {
  return { id, type: "interpretation", tone, title, detail, evidence };
}

function countHeadings(markdown: string): number {
  const lines = markdown.split("\n");
  let insideFence = false;
  let count = 0;
  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) insideFence = !insideFence;
    if (!insideFence && /^#{1,6}\s+\S/.test(line)) count += 1;
  }
  return count;
}

export interface EcosystemSignal {
  label: string;
  file: string;
}

/** Filename → toolchain inference (reported as an interpretation, not a fact). */
export function detectEcosystems(root: TreeEntry[]): EcosystemSignal[] {
  const names = root.map((entry) => entry.name.toLowerCase());
  const has = (name: string) => names.includes(name.toLowerCase());
  const hasPrefix = (prefix: string) => names.some((name) => name.startsWith(prefix));
  const signals: EcosystemSignal[] = [];

  if (has("package.json")) signals.push({ label: "Node.js / JavaScript", file: "package.json" });
  if (has("tsconfig.json")) signals.push({ label: "TypeScript", file: "tsconfig.json" });
  if (has("pnpm-workspace.yaml") || has("pnpm-lock.yaml")) signals.push({ label: "pnpm", file: "pnpm-lock.yaml" });
  if (has("yarn.lock")) signals.push({ label: "Yarn", file: "yarn.lock" });
  if (has("bun.lockb") || has("bun.lock")) signals.push({ label: "Bun", file: "bun.lockb" });
  if (has("requirements.txt") || has("pyproject.toml") || hasPrefix("setup.py")) signals.push({ label: "Python", file: "pyproject.toml" });
  if (has("poetry.lock")) signals.push({ label: "Poetry", file: "poetry.lock" });
  if (has("cargo.toml")) signals.push({ label: "Rust / Cargo", file: "Cargo.toml" });
  if (has("go.mod")) signals.push({ label: "Go modules", file: "go.mod" });
  if (has("composer.json")) signals.push({ label: "PHP / Composer", file: "composer.json" });
  if (has("gemfile")) signals.push({ label: "Ruby / Bundler", file: "Gemfile" });
  if (has("pom.xml") || has("build.gradle") || has("build.gradle.kts")) signals.push({ label: "JVM build tool", file: "pom.xml" });
  if (names.some((name) => name.endsWith(".csproj") || name.endsWith(".sln"))) signals.push({ label: ".NET", file: "*.csproj" });
  if (has("pubspec.yaml")) signals.push({ label: "Dart / Flutter", file: "pubspec.yaml" });
  if (has("mix.exs")) signals.push({ label: "Elixir / Mix", file: "mix.exs" });
  if (has("package.swift")) signals.push({ label: "Swift Package Manager", file: "Package.swift" });
  if (has("cmakelists.txt") || has("makefile")) signals.push({ label: "C/C++ build system", file: "CMakeLists.txt" });
  if (has("dockerfile") || has("docker-compose.yml") || has("compose.yaml")) signals.push({ label: "Docker", file: "Dockerfile" });
  if (names.some((name) => name.startsWith("terraform")) || has("main.tf")) signals.push({ label: "Terraform", file: "*.tf" });
  if (root.some((entry) => entry.type === "directory" && entry.name === ".github"))
    signals.push({ label: "GitHub Actions / templates", file: ".github/" });

  return signals.slice(0, 8);
}
