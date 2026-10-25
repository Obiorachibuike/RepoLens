import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SearchExperience } from "./search-experience";
import { AppProviders } from "@/components/app-providers";
import { repositorySummary } from "@/test-utils/fixtures";
import { DEFAULT_FILTERS } from "@/lib/search/initial-state";
import type { RepositorySearchResponse } from "@/lib/api/shapes";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

function searchResponse(overrides: Partial<RepositorySearchResponse> = {}): RepositorySearchResponse {
  return {
    mode: "repository",
    userQuery: "react",
    query: "react archived:false",
    items: [
      {
        repository: repositorySummary,
        relevance: {
          score: 57,
          band: "good",
          factors: [
            { key: "nameMatch", label: "Name match", value: 1, weight: 0.35, detail: "matches the repository name" },
          ],
          githubRank: 1,
        },
      },
    ],
    totalCount: 1,
    incompleteResults: false,
    beyondWindow: false,
    page: 1,
    perPage: 20,
    sort: "best-match",
    direction: "desc",
    qualifiers: [{ label: "Your search text", qualifier: "react", source: "user" }],
    warnings: [],
    relaxed: null,
    interpretation: null,
    followUps: [],
    rateLimit: { limit: 30, remaining: 29, resetAt: null, resource: "search" },
    ...overrides,
  };
}

const initialState = {
  mode: "repository" as const,
  q: "",
  page: 1,
  perPage: 20 as const,
  sort: "best-match" as const,
  direction: "desc" as const,
  filters: DEFAULT_FILTERS,
};

function mockApi(handler: (url: URL) => Response) {
  const urls: URL[] = [];
  const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const url = new URL(raw, "http://localhost");
    urls.push(url);
    return handler(url);
  });
  return { spy, urls };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function renderPage(overrides: Partial<typeof initialState> = {}) {
  return render(
    <AppProviders config={{ github: { authenticated: false }, database: false, ai: false, codeSearch: false }}>
      <SearchExperience initialState={{ ...initialState, ...overrides }} variant="home" fromUrl />
    </AppProviders>,
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("search experience", () => {
  it("renders the required hero copy", () => {
    mockApi(() => json(searchResponse()));
    renderPage();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Find Your Next Project");
    expect(
      screen.getByText("Enter a concept to discover and analyze relevant open-source projects."),
    ).toBeInTheDocument();
  });

  it("searches GitHub and renders the returned repositories", async () => {
    const { urls } = mockApi(() => json(searchResponse()));
    renderPage();
    expect(await screen.findByText("1 repository")).toBeInTheDocument();
    // The row renders twice: once as a desktop table cell, once as a mobile card.
    expect(screen.getAllByText("The library for web and native user interfaces.").length).toBeGreaterThan(0);
    expect(urls[0]?.pathname).toBe("/api/search/repositories");
    expect(urls[0]?.searchParams.get("mode")).toBe("repository");
  });

  it("runs a labelled default browse query when the user has not typed anything", async () => {
    const { urls } = mockApi(() => json(searchResponse()));
    renderPage();
    await screen.findByText("1 repository");
    expect(urls[0]?.searchParams.get("q")).toBe("stars:>=1000");
    expect(screen.getByTitle("Run a search to replace this default view")).toBeInTheDocument();
  });

  it("submits the typed query", async () => {
    const user = userEvent.setup();
    const { urls } = mockApi(() => json(searchResponse({ userQuery: "rust cli", query: "rust cli archived:false" })));
    renderPage();
    await screen.findByText("1 repository");

    const input = screen.getByRole("searchbox");
    await user.clear(input);
    await user.type(input, "rust cli");
    await user.click(screen.getByRole("button", { name: "Search" }));

    await waitFor(() => {
      const last = urls[urls.length - 1];
      expect(last?.searchParams.get("q")).toBe("rust cli");
    });
  });

  it("switching modes updates the placeholder, helper text and the mode sent to the API", async () => {
    const user = userEvent.setup();
    const { urls } = mockApi(() =>
      json(
        searchResponse({
          mode: "project-idea",
          interpretation: {
            keywords: ["analytics"],
            technologies: [],
            topics: ["analytics"],
            signals: {
              lightweight: false,
              beginnerFriendly: false,
              popular: false,
              activelyMaintained: false,
              selfHosted: true,
              productionReady: false,
              alternativeTo: null,
            },
            ignored: [],
            passthroughQualifiers: [],
          },
          followUps: [{ label: "Broaden", description: "fewer terms", q: "analytics", mode: "project-idea" }],
        }),
      ),
    );
    renderPage();
    await screen.findByText("1 repository");

    await user.click(screen.getByRole("tab", { name: /project idea mode/i }));

    expect(
      await screen.findByPlaceholderText("Describe your project idea or the problem you want to solve..."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Discover existing projects, libraries, and useful starting points."),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(urls[urls.length - 1]?.searchParams.get("mode")).toBe("project-idea");
    });
    // Discovery modes explain themselves.
    expect(await screen.findByText(/How RepoLens interpreted your request/i)).toBeInTheDocument();
    expect(screen.getByText("Suggested follow-up searches")).toBeInTheDocument();
  });

  it("shows an actionable message when GitHub rate limits the search", async () => {
    mockApi(() =>
      json(
        {
          error: {
            kind: "rate_limited",
            message: "GitHub's search limit has been reached. It resets at 10:45 AM.",
            hint: "Set the optional GITHUB_TOKEN environment variable to raise the limit.",
            status: 403,
            retryAfterSeconds: 42,
            resetAt: null,
          },
        },
        429,
      ),
    );
    renderPage();
    expect(await screen.findByText(/search limit has been reached/i)).toBeInTheDocument();
    expect(screen.getByText(/GITHUB_TOKEN/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("shows the empty state with a way to clear filters", async () => {
    mockApi(() => json(searchResponse({ items: [], totalCount: 0 })));
    renderPage();
    expect(
      await screen.findByText("No repositories found. Try a different keyword or adjust your filters."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear filters" })).toBeInTheDocument();
  });

  it("re-queries when the sort order changes", async () => {
    const user = userEvent.setup();
    const { urls } = mockApi(() => json(searchResponse({ sort: "stars" })));
    renderPage();
    await screen.findByText("1 repository");

    await user.click(screen.getByRole("combobox", { name: "Sort results" }));
    await user.click(await screen.findByRole("option", { name: "Most stars" }));

    await waitFor(() => {
      expect(urls[urls.length - 1]?.searchParams.get("sort")).toBe("stars");
    });
  });

  it("tells the visitor when saves are browser-local", async () => {
    mockApi(() => json(searchResponse()));
    renderPage();
    await screen.findByText("1 repository");
    expect(screen.getByText(/stored in this browser only/i)).toBeInTheDocument();
  });
});
