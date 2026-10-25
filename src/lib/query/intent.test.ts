import { describe, expect, it } from "vitest";
import { extractIntent } from "./intent";

describe("deterministic intent extraction", () => {
  it("detects technologies and their language", () => {
    const intent = extractIntent("Find a lightweight React library for accessible command palettes");
    expect(intent.technologies.map((tech) => tech.name)).toContain("React");
    expect(intent.technologies[0]?.language).toBe("TypeScript");
    expect(intent.topics).toContain("command-palette");
    expect(intent.signals.lightweight).toBe(true);
  });

  it("prefers the longest technology alias (react native over react)", () => {
    const intent = extractIntent("A react native navigation library");
    expect(intent.technologies.map((tech) => tech.name)).toContain("React Native");
    expect(intent.technologies.some((tech) => tech.name === "React")).toBe(false);
  });

  it("extracts keywords and ignores stopwords", () => {
    const intent = extractIntent("I want to build a self-hosted privacy friendly analytics dashboard");
    expect(intent.keywords).toContain("privacy");
    expect(intent.keywords).not.toContain("want");
    expect(intent.ignored).toContain("want");
    expect(intent.signals.selfHosted).toBe(true);
    expect(intent.topics).toContain("self-hosted");
    expect(intent.topics).toContain("analytics");
    expect(intent.topics).toContain("dashboard");
  });

  it("detects an open-source alternative request", () => {
    const intent = extractIntent("open source alternative to Notion for team notes");
    expect(intent.signals.alternativeTo).toContain("notion");
    expect(intent.topics).toContain("alternative");
  });

  it("preserves GitHub qualifiers the user typed", () => {
    const intent = extractIntent("cli tool language:Rust stars:>500 topic:terminal");
    expect(intent.qualifiers).toContain("language:Rust");
    expect(intent.qualifiers).toContain("stars:>500");
    expect(intent.qualifiers).toContain("topic:terminal");
    expect(intent.keywords).toContain("cli");
  });

  it("flags maintenance and popularity signals", () => {
    const intent = extractIntent("a popular, actively maintained python job queue");
    expect(intent.signals.popular).toBe(true);
    expect(intent.signals.activelyMaintained).toBe(true);
    expect(intent.technologies.map((tech) => tech.name)).toContain("Python");
  });

  it("detects beginner-friendly intent", () => {
    const intent = extractIntent("beginner friendly open source projects to contribute to");
    expect(intent.signals.beginnerFriendly).toBe(true);
    expect(intent.topics).toContain("good-first-issue");
  });

  it("handles text with no recognisable technology", () => {
    const intent = extractIntent("something for organising recipes");
    expect(intent.technologies).toEqual([]);
    expect(intent.keywords).toContain("recipes");
    expect(intent.keywords).toContain("organising");
  });

  it("is pure — calling twice returns the same result", () => {
    const text = "self-hosted AI coding assistant with a local model";
    expect(extractIntent(text)).toEqual(extractIntent(text));
  });
});

describe("whole-word phrase matching", () => {
  it("does not match short phrases inside longer words", () => {
    // "ar" must not match inside "library", which previously produced "libr"
    // and a bogus "xr" topic.
    const intent = extractIntent("lightweight React command palette library");
    expect(intent.keywords).not.toContain("libr");
    expect(intent.keywords).toEqual([]);
    expect(intent.ignored).toContain("library");
    expect(intent.topics).not.toContain("xr");
    expect(intent.topics).toContain("command-palette");
    expect(intent.technologies.map((tech) => tech.name)).toEqual(["React"]);
  });

  it("keeps unrelated words intact when short phrases appear elsewhere", () => {
    const intent = extractIntent("ml pipeline with markdown search and chart rendering");
    expect(intent.topics).toContain("machine-learning");
    expect(intent.topics).toContain("markdown");
    expect(intent.keywords).toEqual(["pipeline", "chart", "rendering"]);
    expect(intent.ignored).toContain("search");
  });

  it("still detects short phrases when they are real words", () => {
    const intent = extractIntent("ar glasses demo for vr headsets");
    expect(intent.topics).toContain("xr");
    expect(intent.keywords).toContain("glasses");
    expect(intent.keywords).toContain("headsets");
  });

  it("removes every occurrence of a matched alias", () => {
    const intent = extractIntent("react hooks and more react patterns");
    expect(intent.technologies.map((tech) => tech.name)).toEqual(["React"]);
    expect(intent.keywords).toEqual(["hooks", "patterns"]);
  });
});
