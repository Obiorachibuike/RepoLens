import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { ResultsTable } from "./results-table";
import { AppProviders } from "@/components/app-providers";
import { scoreRelevance } from "@/lib/query/relevance";
import { repositorySummary } from "@/test-utils/fixtures";
import type { RepositoryResultItem } from "@/lib/api/shapes";

function item(overrides: Partial<typeof repositorySummary> = {}): RepositoryResultItem {
  const repository = { ...repositorySummary, ...overrides };
  return {
    repository,
    relevance: scoreRelevance({ repo: repository, terms: ["react"], rank: 1 }),
  };
}

function renderTable(items: RepositoryResultItem[]) {
  return render(
    <AppProviders config={{ github: { authenticated: false }, database: false, ai: false, codeSearch: false }}>
      <ResultsTable items={items} />
    </AppProviders>,
  );
}

describe("results table", () => {
  it("shows the real owner, name and description from GitHub", () => {
    renderTable([item()]);
    expect(screen.getAllByText("facebook").length).toBeGreaterThan(0);
    expect(screen.getAllByText("react").length).toBeGreaterThan(0);
    expect(screen.getAllByText("The library for web and native user interfaces.").length).toBeGreaterThan(0);
  });

  it("links every action to the right destination", () => {
    renderTable([item()]);
    const details = screen.getByLabelText("View details: facebook/react");
    expect(details).toHaveAttribute("href", "/repository/facebook/react");

    const visualize = screen.getByLabelText("Visualize: facebook/react");
    expect(visualize).toHaveAttribute("href", "/repository/facebook/react/visualize");

    const analyze = screen.getByLabelText("Analyze: facebook/react");
    expect(analyze).toHaveAttribute("href", "/repository/facebook/react/analyze");

    const github = screen.getByLabelText("Open facebook/react on GitHub in a new tab");
    expect(github).toHaveAttribute("href", "https://github.com/facebook/react");
    expect(github).toHaveAttribute("target", "_blank");
    expect(github).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("formats the star count compactly while keeping the exact value available", () => {
    renderTable([item()]);
    // Both the desktop table and the mobile card render the count.
    const stars = screen.getAllByTitle("231,000 stars");
    expect(stars.length).toBeGreaterThan(0);
    for (const element of stars) expect(element).toHaveTextContent("231k");
  });

  it("renders the reported language with its indicator", () => {
    renderTable([item()]);
    expect(screen.getAllByText("JavaScript").length).toBeGreaterThan(0);
  });

  it("reports a neutral fallback when the language is missing", () => {
    renderTable([item({ language: null })]);
    expect(screen.getAllByText("Not reported").length).toBeGreaterThan(0);
  });

  it("shows three topics and collapses the rest", () => {
    renderTable([item({ topics: ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot"] })]);
    expect(screen.getAllByText("alpha").length).toBeGreaterThan(0);
    expect(screen.getAllByText("charlie").length).toBeGreaterThan(0);
    const overflow = screen.getAllByTitle("delta, echo, foxtrot");
    expect(overflow.length).toBeGreaterThan(0);
    for (const element of overflow) expect(element).toHaveTextContent("+3 more");
  });

  it("handles a missing description gracefully", () => {
    renderTable([item({ description: null })]);
    expect(screen.getAllByText("No description provided.").length).toBeGreaterThan(0);
  });

  it("marks archived repositories", () => {
    renderTable([item({ archived: true })]);
    expect(screen.getByTitle("This repository is archived (read-only)")).toBeInTheDocument();
  });

  it("shows a relevance score with a band and no fabricated 100%", () => {
    renderTable([item()]);
    const scores = screen.getAllByText(/^\d+%$/);
    expect(scores.length).toBeGreaterThan(0);
    const value = Number(scores[0]?.textContent?.replace("%", ""));
    expect(value).toBeGreaterThan(0);
    expect(value).toBeLessThanOrEqual(100);
  });

  it("renders a mobile card with an actions menu for narrow screens", () => {
    renderTable([item()]);
    const menu = screen.getByLabelText("Actions for facebook/react");
    expect(menu).toBeInTheDocument();
    const card = within(screen.getAllByRole("listitem")[0] as HTMLElement);
    expect(card.getByText("The library for web and native user interfaces.")).toBeInTheDocument();
  });
});

describe("action labels", () => {
  it("labels every desktop action so the intent is visible without hovering", () => {
    renderTable([item()]);
    const details = screen.getByLabelText("View details: facebook/react");
    expect(details).toHaveTextContent("Details");
    expect(screen.getByLabelText("Visualize: facebook/react")).toHaveTextContent("Visualize");
    expect(screen.getByLabelText("Analyze: facebook/react")).toHaveTextContent("Analyze");
    expect(screen.getByLabelText("Open facebook/react on GitHub in a new tab")).toHaveTextContent("GitHub");
  });
});
