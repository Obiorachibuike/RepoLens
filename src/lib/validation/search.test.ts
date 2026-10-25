import { describe, expect, it } from "vitest";
import {
  GITHUB_MAX_RESULT_WINDOW,
  GITHUB_QUERY_MAX_LENGTH,
  hasActiveFilters,
  parseCodeSearch,
  parseDeveloperSearch,
  parseRepositorySearch,
} from "./search";

describe("repository search validation", () => {
  it("rejects an empty query", () => {
    const result = parseRepositorySearch({ q: "   " });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.join(" ")).toMatch(/Enter something to search for/);
    }
  });

  it("rejects control characters in the query", () => {
    const result = parseRepositorySearch({ q: "react\nrm -rf" });
    expect(result.success).toBe(false);
  });

  it("rejects queries longer than 400 characters", () => {
    const result = parseRepositorySearch({ q: "a".repeat(401) });
    expect(result.success).toBe(false);
  });

  it("accepts a valid search and applies defaults", () => {
    const result = parseRepositorySearch({ q: "react" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.mode).toBe("repository");
      expect(result.data.page).toBe(1);
      expect(result.data.perPage).toBe(20);
      expect(result.data.sort).toBe("best-match");
      expect(result.data.direction).toBe("desc");
      expect(result.data.filters.archived).toBe("exclude");
    }
  });

  it("parses the language filter", () => {
    const result = parseRepositorySearch({ q: "state", language: "TypeScript" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.filters.language).toBe("TypeScript");
  });

  it("rejects a language containing shell metacharacters", () => {
    const result = parseRepositorySearch({ q: "state", language: "TypeScript;rm" });
    expect(result.success).toBe(false);
  });

  it("parses the star and fork filters as numbers", () => {
    const result = parseRepositorySearch({ q: "cli", minStars: "250", minForks: "20" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.filters.minStars).toBe(250);
      expect(result.data.filters.minForks).toBe(20);
    }
  });

  it("rejects negative star counts", () => {
    expect(parseRepositorySearch({ q: "cli", minStars: "-5" }).success).toBe(false);
  });

  it("requires YYYY-MM-DD dates", () => {
    expect(parseRepositorySearch({ q: "cli", createdAfter: "01/02/2025" }).success).toBe(false);
    const ok = parseRepositorySearch({ q: "cli", createdAfter: "2025-01-02" });
    expect(ok.success).toBe(true);
  });

  it("parses and normalises the topic list", () => {
    const result = parseRepositorySearch({ q: "ui", topics: " React , UI-Library , bad topic! " });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.filters.topics).toEqual(["react", "ui-library"]);
  });

  it("rejects an unknown page size", () => {
    expect(parseRepositorySearch({ q: "ui", perPage: "37" }).success).toBe(false);
    const ok = parseRepositorySearch({ q: "ui", perPage: "50" });
    expect(ok.success).toBe(true);
  });

  it("rejects an unknown sort option", () => {
    expect(parseRepositorySearch({ q: "ui", sort: "vibes" }).success).toBe(false);
  });

  it("detects active filters", () => {
    const parsed = parseRepositorySearch({ q: "ui", language: "Rust", minStars: "10" });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(hasActiveFilters(parsed.data.filters)).toBe(true);

    const plain = parseRepositorySearch({ q: "ui" });
    if (plain.success) expect(hasActiveFilters(plain.data.filters)).toBe(false);
  });
});

describe("developer and code search validation", () => {
  it("rejects an empty developer query", () => {
    expect(parseDeveloperSearch({ q: "" }).success).toBe(false);
  });

  it("parses developer filters", () => {
    const result = parseDeveloperSearch({ q: "ada", language: "Python", minFollowers: "50", type: "user" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.language).toBe("Python");
      expect(result.data.minFollowers).toBe(50);
      expect(result.data.type).toBe("user");
    }
  });

  it("requires owner/repo format for a code search repository filter", () => {
    expect(parseCodeSearch({ q: "useState", repository: "not-a-repo" }).success).toBe(false);
    const ok = parseCodeSearch({ q: "useState", repository: "facebook/react" });
    expect(ok.success).toBe(true);
  });

  it("exposes GitHub's documented limits as constants", () => {
    expect(GITHUB_QUERY_MAX_LENGTH).toBe(256);
    expect(GITHUB_MAX_RESULT_WINDOW).toBe(1000);
  });
});
