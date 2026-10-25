import { describe, expect, it } from "vitest";
import { bandFor, relevanceTerms, scoreRelevance } from "./relevance";
import { repositorySummary } from "@/test-utils/fixtures";

describe("relevance scoring", () => {
  it("scores an exact name match highly", () => {
    const result = scoreRelevance({ repo: repositorySummary, terms: ["react"], rank: 1 });
    expect(result.score).not.toBeNull();
    expect(result.score).toBeGreaterThanOrEqual(50);
    expect(result.band).toBe("good");
    expect(result.githubRank).toBe(1);
  });

  it("reaches the exact band when name and description both match", () => {
    const result = scoreRelevance({
      repo: { ...repositorySummary, description: "React is a library for building user interfaces." },
      terms: ["react"],
    });
    expect(result.score).toBeGreaterThanOrEqual(90);
    expect(result.band).toBe("exact");
  });

  it("scores a description-only match lower than a name match", () => {
    const nameMatch = scoreRelevance({ repo: repositorySummary, terms: ["react"] });
    const descriptionMatch = scoreRelevance({ repo: repositorySummary, terms: ["interfaces"] });
    expect(nameMatch.score).toBeGreaterThan(descriptionMatch.score ?? 0);
  });

  it("scores an unrelated repository low", () => {
    const result = scoreRelevance({ repo: repositorySummary, terms: ["kubernetes", "helm"] });
    expect(result.score).toBeLessThan(30);
    expect(result.band).toBe("weak");
  });

  it("rewards topic matches when topics are requested", () => {
    const withoutTopic = scoreRelevance({ repo: repositorySummary, terms: ["ui"] });
    const withTopic = scoreRelevance({ repo: repositorySummary, terms: ["ui"], topics: ["ui", "react"] });
    expect(withTopic.score).toBeGreaterThan(withoutTopic.score ?? 0);
    expect(withTopic.factors.some((factor) => factor.key === "topicMatch")).toBe(true);
  });

  it("penalises a language mismatch and renormalises when no language is requested", () => {
    const mismatch = scoreRelevance({ repo: repositorySummary, terms: ["react"], language: "Rust" });
    const match = scoreRelevance({ repo: repositorySummary, terms: ["react"], language: "JavaScript" });
    const none = scoreRelevance({ repo: repositorySummary, terms: ["react"] });
    expect(match.score).toBeGreaterThan(mismatch.score ?? 0);
    expect(none.factors.some((factor) => factor.key === "languageMatch")).toBe(false);
  });

  it("reports the popularity factor from real stars, not a fixed value", () => {
    const popular = scoreRelevance({ repo: repositorySummary, terms: ["react"] });
    const unknown = scoreRelevance({
      repo: { ...repositorySummary, stargazersCount: 0, description: null, topics: [] },
      terms: ["zzzz"],
    });
    const popularFactor = popular.factors.find((factor) => factor.key === "popularity");
    const unknownFactor = unknown.factors.find((factor) => factor.key === "popularity");
    expect(popularFactor?.value).toBeGreaterThan(unknownFactor?.value ?? 0);
  });

  it("handles a repository with no description without inventing a match", () => {
    const result = scoreRelevance({
      repo: { ...repositorySummary, description: null },
      terms: ["interfaces"],
    });
    const description = result.factors.find((factor) => factor.key === "descriptionMatch");
    expect(description?.value).toBe(0);
    expect(description?.detail).toMatch(/no description/i);
  });

  it("maps scores to bands", () => {
    expect(bandFor(92)).toBe("exact");
    expect(bandFor(75)).toBe("strong");
    expect(bandFor(55)).toBe("good");
    expect(bandFor(35)).toBe("partial");
    expect(bandFor(10)).toBe("weak");
  });
  it("splits search terms and drops GitHub qualifiers", () => {
    expect(relevanceTerms("topic:react language:Python AI Agents")).toEqual(["ai", "agents"]);
  });
});
