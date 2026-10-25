import { describe, expect, it } from "vitest";
import { buildRepositoryQuery, filterToQualifiers } from "./build";
import { extractIntent } from "./intent";
import { GITHUB_QUERY_MAX_LENGTH, type RepositoryFilters } from "@/lib/validation/search";

const filters = (partial: Partial<RepositoryFilters> = {}): RepositoryFilters => ({
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
  ...partial,
});

describe("GitHub query construction", () => {
  it("passes repository-mode text through verbatim", () => {
    const built = buildRepositoryQuery({
      mode: "repository",
      q: "topic:machine-learning language:Python stars:>100",
      filters: filters({ archived: "include" }),
    });
    expect(built.query).toContain("topic:machine-learning language:Python stars:>100");
    // archived:include means no archived:false is added
    expect(built.query).not.toContain("archived:false");
  });

  it("appends the language filter as a qualifier", () => {
    const built = buildRepositoryQuery({
      mode: "repository",
      q: "state management",
      filters: filters({ language: "TypeScript" }),
    });
    expect(built.query).toBe("state management language:TypeScript archived:false");
    expect(built.qualifiers.some((item) => item.qualifier === "language:TypeScript")).toBe(true);
  });

  it("appends the star and fork filters inclusively", () => {
    const built = buildRepositoryQuery({
      mode: "repository",
      q: "cli",
      filters: filters({ minStars: 100, minForks: 20 }),
    });
    expect(built.query).toContain("stars:>=100");
    expect(built.query).toContain("forks:>=20");
  });

  it("maps date filters to created:/pushed: qualifiers", () => {
    const built = buildRepositoryQuery({
      mode: "repository",
      q: "kit",
      filters: filters({ createdAfter: "2025-01-01", pushedBefore: "2025-06-30" }),
    });
    expect(built.query).toContain("created:>=2025-01-01");
    expect(built.query).toContain("pushed:<=2025-06-30");
  });

  it("excludes archived repositories by default", () => {
    const built = buildRepositoryQuery({ mode: "repository", q: "ui", filters: filters() });
    expect(built.query).toContain("archived:false");
  });

  it("builds a discovery query from extracted intent", () => {
    const intent = extractIntent("Find a lightweight React library for building accessible command palettes");
    const built = buildRepositoryQuery({ mode: "find-repo", q: intent.rawText, filters: filters(), intent });
    expect(built.query).toContain("command-palette");
    expect(built.query).toContain("language:TypeScript");
    expect(built.query).toContain("archived:false");
    expect(built.qualifiers.some((item) => item.source === "inferred")).toBe(true);
  });

  it("lets an explicit language filter override the inferred one", () => {
    const intent = extractIntent("React dashboard template");
    const built = buildRepositoryQuery({
      mode: "find-repo",
      q: intent.rawText,
      filters: filters({ language: "JavaScript" }),
      intent,
    });
    expect(built.query).toContain("language:JavaScript");
    expect(built.query).not.toContain("language:TypeScript");
  });

  it("adds a pushed qualifier when the user asks for maintained projects", () => {
    const intent = extractIntent("an actively maintained python job queue");
    const built = buildRepositoryQuery({ mode: "project-idea", q: intent.rawText, filters: filters(), intent });
    expect(built.query).toMatch(/pushed:>\d{4}-\d{2}-\d{2}/);
  });

  it("keeps a discovery query within GitHub's 256 character limit", () => {
    const longText =
      "find a very comprehensive production ready enterprise grade solution framework library toolkit platform for building distributed realtime collaborative multiplayer document editing applications with offline support and conflict resolution";
    const intent = extractIntent(longText);
    const built = buildRepositoryQuery({ mode: "find-repo", q: longText, filters: filters(), intent });
    expect(built.query.length).toBeLessThanOrEqual(GITHUB_QUERY_MAX_LENGTH);
    // Only four keywords survive, so the query stays compact and honest.
    const nonQualifierWords = built.query.split(/\s+/).filter((part) => !part.includes(":"));
    expect(nonQualifierWords.length).toBeLessThanOrEqual(4);
  });

  it("truncates and warns when an oversized query cannot be reduced", () => {
    const oversized = "x".repeat(300);
    const built = buildRepositoryQuery({ mode: "repository", q: oversized, filters: filters() });
    expect(built.query.length).toBeLessThanOrEqual(GITHUB_QUERY_MAX_LENGTH);
    expect(built.warnings.join(" ")).toMatch(/256 characters/);
  });

  it("documents every qualifier it adds", () => {
    const qualifiers = filterToQualifiers(
      filters({ language: "Go", topics: ["cli", "devops"], minStars: 10, license: "mit", owner: "charmbracelet" }),
    );
    expect(qualifiers.map((item) => item.qualifier)).toEqual([
      "language:Go",
      "topic:cli",
      "topic:devops",
      "stars:>=10",
      "license:mit",
      "user:charmbracelet",
      "archived:false",
    ]);
    expect(qualifiers.every((item) => item.source === "filter")).toBe(true);
  });
});

describe("discovery fallbacks", () => {
  it("offers progressively broader queries when several terms were inferred", () => {
    const intent = extractIntent("self-hosted privacy friendly analytics dashboard");
    const built = buildRepositoryQuery({ mode: "find-repo", q: "self-hosted privacy friendly analytics dashboard", filters: filters(), intent });

    expect(built.query).toContain("topic:");
    expect(built.fallbacks.length).toBeGreaterThan(0);

    const first = built.fallbacks[0]!;
    expect(first.query).not.toContain("topic:");
    expect(first.dropped.length).toBeGreaterThan(0);
    expect(first.reason).toMatch(/inferred topic/);
    // Structured filters survive every relaxation.
    expect(first.query).toContain("archived:false");
  });

  it("never relaxes qualifiers the user typed", () => {
    const intent = extractIntent("dashboard language:Rust");
    const built = buildRepositoryQuery({ mode: "find-repo", q: "dashboard language:Rust", filters: filters(), intent });
    for (const fallback of built.fallbacks) {
      expect(fallback.query).toContain("language:Rust");
    }
  });

  it("does not relax anything in repository mode", () => {
    const built = buildRepositoryQuery({
      mode: "repository",
      q: "topic:machine-learning language:Python stars:>100",
      filters: filters(),
    });
    expect(built.fallbacks).toEqual([]);
  });

  it("offers nothing when no topics or language were inferred", () => {
    const intent = extractIntent("privacy");
    const built = buildRepositoryQuery({ mode: "project-idea", q: "privacy", filters: filters(), intent });
    expect(built.fallbacks).toEqual([]);
  });
});
