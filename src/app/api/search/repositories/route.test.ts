import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";
import { __clearGithubCache } from "@/lib/github/client";
import { rawRepository } from "@/test-utils/fixtures";
import type { ApiErrorShape, RepositorySearchResponse } from "@/lib/api/shapes";

function searchPayload(items: unknown[], total = items.length) {
  return new Response(JSON.stringify({ total_count: total, incomplete_results: false, items }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "x-ratelimit-limit": "30",
      "x-ratelimit-remaining": "17",
      "x-ratelimit-reset": String(Math.floor(Date.now() / 1000) + 300),
      "x-ratelimit-resource": "search",
    },
  });
}

function mockGithub(handler: (url: URL) => Promise<Response> | Response) {
  const urls: URL[] = [];
  const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const url = new URL(raw);
    urls.push(url);
    return handler(url);
  });
  return { spy, urls };
}

const call = (query: string) => GET(new Request(`http://localhost/api/search/repositories?${query}`));

const body = async <T,>(response: Response): Promise<T> => (await response.json()) as T;

beforeEach(() => {
  vi.restoreAllMocks();
  __clearGithubCache();
});
afterEach(() => {
  vi.restoreAllMocks();
  __clearGithubCache();
});

describe("GET /api/search/repositories", () => {
  it("returns real repository data with relevance scores", async () => {
    const { urls } = mockGithub(() => searchPayload([rawRepository], 1));

    const response = await call("q=react");
    expect(response.status).toBe(200);

    const data = await body<RepositorySearchResponse>(response);
    expect(data.items).toHaveLength(1);
    expect(data.items[0]?.repository.fullName).toBe("facebook/react");
    expect(data.items[0]?.repository.stargazersCount).toBe(231000);
    expect(data.items[0]?.repository.language).toBe("JavaScript");
    expect(data.items[0]?.relevance.score).toBeGreaterThanOrEqual(0);
    expect(data.items[0]?.relevance.score).toBeLessThanOrEqual(100);
    expect(data.totalCount).toBe(1);
    expect(data.rateLimit).toMatchObject({ limit: 30, remaining: 17, resource: "search" });

    const url = urls[0]!;
    expect(url.pathname).toBe("/search/repositories");
    expect(url.searchParams.get("q")).toContain("react");
  });

  it("rejects an empty query with a 400 and field issues", async () => {
    const { spy } = mockGithub(() => searchPayload([]));
    const response = await call("q=");
    expect(response.status).toBe(400);
    const data = await body<ApiErrorShape>(response);
    expect(data.error.kind).toBe("validation");
    expect(data.error.issues?.length).toBeGreaterThan(0);
    expect(spy).not.toHaveBeenCalled();
  });

  it("applies the language filter to the GitHub query", async () => {
    const { urls } = mockGithub(() => searchPayload([rawRepository]));
    await call("q=state&language=TypeScript");
    const url = urls[0]!;
    expect(url.searchParams.get("q")).toContain("language:TypeScript");
  });

  it("applies the star filter to the GitHub query", async () => {
    const { urls } = mockGithub(() => searchPayload([rawRepository]));
    await call("q=cli&minStars=250");
    const url = urls[0]!;
    expect(url.searchParams.get("q")).toContain("stars:>=250");
  });

  it("excludes archived repositories by default and includes them on request", async () => {
    const { urls } = mockGithub(() => searchPayload([rawRepository]));
    await call("q=kit");
    expect(urls[0]!.searchParams.get("q")).toContain("archived:false");

    await call("q=kit&archived=only");
    expect(urls[1]!.searchParams.get("q")).toContain("archived:true");
  });

  it("maps sorting to GitHub's sort and order parameters", async () => {
    const { urls } = mockGithub(() => searchPayload([rawRepository]));

    await call("q=react&sort=stars");
    let url = urls[0]!;
    expect(url.searchParams.get("sort")).toBe("stars");
    expect(url.searchParams.get("order")).toBe("desc");

    await call("q=react&sort=updated&direction=asc");
    url = urls[1]!;
    expect(url.searchParams.get("sort")).toBe("updated");
    expect(url.searchParams.get("order")).toBe("asc");

    await call("q=react&sort=best-match");
    url = urls[2]!;
    expect(url.searchParams.has("sort")).toBe(false);
  });

  it("paginates with GitHub's page and per_page parameters", async () => {
    const { urls } = mockGithub(() => searchPayload([rawRepository], 500));
    const response = await call("q=react&page=3&perPage=10");
    const url = urls[0]!;
    expect(url.searchParams.get("page")).toBe("3");
    expect(url.searchParams.get("per_page")).toBe("10");
    const data = await body<RepositorySearchResponse>(response);
    expect(data.page).toBe(3);
    expect(data.perPage).toBe(10);
    expect(data.items[0]?.relevance.githubRank).toBe(21);
  });

  it("flags when the requested page is beyond GitHub's 1,000 result window", async () => {
    mockGithub(() => searchPayload([], 5000));
    const data = await body<RepositorySearchResponse>(await call("q=react&page=100&perPage=100"));
    expect(data.beyondWindow).toBe(true);
  });

  it("returns an empty result set cleanly", async () => {
    mockGithub(() => searchPayload([], 0));
    const data = await body<RepositorySearchResponse>(await call("q=zzz-no-such-project"));
    expect(data.items).toEqual([]);
    expect(data.totalCount).toBe(0);
  });

  it("reports GitHub's incomplete_results flag", async () => {
    mockGithub(
      async () =>
        new Response(JSON.stringify({ total_count: 12, incomplete_results: true, items: [rawRepository] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    const data = await body<RepositorySearchResponse>(await call("q=react"));
    expect(data.incompleteResults).toBe(true);
  });

  it("translates a rate-limited upstream response into a 429", async () => {
    mockGithub(
      async () =>
        new Response(JSON.stringify({ message: "API rate limit exceeded" }), {
          status: 403,
          headers: {
            "Content-Type": "application/json",
            "x-ratelimit-remaining": "0",
            "x-ratelimit-reset": String(Math.floor(Date.now() / 1000) + 120),
          },
        }),
    );
    const response = await call("q=react");
    expect(response.status).toBe(429);
    const data = await body<ApiErrorShape>(response);
    expect(data.error.kind).toBe("rate_limited");
    expect(data.error.message).toMatch(/limit has been reached/);
  });

  it("translates a network failure into a 502 without leaking internals", async () => {
    mockGithub(async () => {
      throw new TypeError("fetch failed: ECONNRESET on https://api.github.com/search/repositories");
    });
    const response = await call("q=react");
    expect(response.status).toBe(502);
    const data = await body<ApiErrorShape>(response);
    expect(data.error.kind).toBe("network");
    expect(data.error.message).not.toContain("ECONNRESET");
  });

  it("translates an invalid GitHub query (422) into a 422 with GitHub's detail", async () => {
    mockGithub(
      async () =>
        new Response(
          JSON.stringify({ message: "Validation Failed", errors: [{ message: "The listed users cannot be searched" }] }),
          { status: 422, headers: { "Content-Type": "application/json" } },
        ),
    );
    const response = await call("q=react");
    expect(response.status).toBe(422);
  });

  it("adds interpretation and follow-ups in Find Repo mode", async () => {
    const { urls } = mockGithub(() => searchPayload([rawRepository]));
    const data = await body<RepositorySearchResponse>(
      await call("mode=find-repo&q=" + encodeURIComponent("Find a lightweight React library for command palettes")),
    );
    expect(data.mode).toBe("find-repo");
    expect(data.interpretation?.technologies.map((tech) => tech.name)).toContain("React");
    expect(data.interpretation?.topics).toContain("command-palette");
    expect(data.qualifiers.some((item) => item.source === "inferred")).toBe(true);
    expect(data.followUps.length).toBeGreaterThan(0);
    expect(urls[0]!.searchParams.get("q")).toContain("topic:command-palette");
  });

  it("adds interpretation in Project Idea mode without inventing repositories", async () => {
    mockGithub(() => searchPayload([rawRepository]));
    const data = await body<RepositorySearchResponse>(
      await call("mode=project-idea&q=" + encodeURIComponent("I want to build a self-hosted AI coding assistant")),
    );
    expect(data.mode).toBe("project-idea");
    expect(data.interpretation?.signals.selfHosted).toBe(true);
    expect(data.items.map((item) => item.repository.fullName)).toEqual(["facebook/react"]);
  });

  it("passes repository-mode qualifiers through untouched", async () => {
    const { urls } = mockGithub(() => searchPayload([rawRepository]));
    await call("mode=repository&q=" + encodeURIComponent("topic:machine-learning language:Python stars:>100"));
    const url = urls[0]!;
    const q = url.searchParams.get("q") ?? "";
    expect(q).toContain("topic:machine-learning");
    expect(q).toContain("language:Python");
    expect(q).toContain("stars:>100");
  });
});

describe("discovery query relaxation", () => {
  it("retries with a broader query and reports what was dropped", async () => {
    const seen: string[] = [];
    const { urls } = mockGithub((url) => {
      const q = url.searchParams.get("q") ?? "";
      seen.push(q);
      // The precise query finds nothing; the broader one finds something.
      if (q.includes("topic:")) return searchPayload([], 0);
      return searchPayload([rawRepository], 12);
    });

    const data = await body<RepositorySearchResponse>(
      await call("mode=project-idea&q=" + encodeURIComponent("self-hosted privacy friendly analytics dashboard")),
    );

    expect(seen.length).toBeGreaterThan(1);
    expect(seen[0]).toContain("topic:");
    expect(data.query).not.toContain("topic:");
    expect(data.relaxed).not.toBeNull();
    expect(data.relaxed?.dropped[0]).toMatch(/^topic:/);
    expect(data.items).toHaveLength(1);
    expect(data.warnings.join(" ")).toMatch(/retried without/);
    expect(urls.length).toBeGreaterThanOrEqual(2);
  });

  it("keeps the precise query when nothing matches at all", async () => {
    mockGithub(() => searchPayload([], 0));
    const data = await body<RepositorySearchResponse>(
      await call("mode=project-idea&q=" + encodeURIComponent("self-hosted privacy friendly analytics dashboard")),
    );
    expect(data.items).toHaveLength(0);
    expect(data.relaxed).toBeNull();
    expect(data.query).toContain("topic:");
    expect(data.warnings.join(" ")).not.toMatch(/retried without/);
  });

  it("never re-queries in repository mode", async () => {
    const { spy } = mockGithub(() => searchPayload([], 0));
    await call("mode=repository&q=zzznotathing&sort=stars");
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
