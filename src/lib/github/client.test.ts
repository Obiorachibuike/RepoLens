import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GithubApiError } from "./errors";
import { __clearGithubCache, getGithubToken, githubRequest } from "./client";

const TOKEN = "ghp_test_token_value";

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function mockFetch(implementation: (url: string, init?: RequestInit) => Promise<Response>) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const signal = init?.signal;
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    return Promise.race([
      implementation(url, init),
      new Promise<Response>((_, reject) => {
        signal?.addEventListener(
          "abort",
          () => reject(signal.reason instanceof Error ? signal.reason : new DOMException("Aborted", "AbortError")),
          { once: true },
        );
      }),
    ]);
  });
}

beforeEach(() => {
  __clearGithubCache();
  vi.restoreAllMocks();
});

afterEach(() => {
  delete process.env.GITHUB_TOKEN;
  __clearGithubCache();
});

describe("githubRequest", () => {
  it("returns parsed data on success", async () => {
    mockFetch(async () => jsonResponse(200, { total_count: 3, items: [] }));
    const { data, meta } = await githubRequest<{ total_count: number }>({ path: "/search/repositories" });
    expect(data.total_count).toBe(3);
    expect(meta.fromCache).toBe(false);
  });

  it("attaches the server-side token as a bearer header", async () => {
    process.env.GITHUB_TOKEN = TOKEN;
    const spy = mockFetch(async () => jsonResponse(200, {}));
    await githubRequest({ path: "/rate_limit" });
    const init = spy.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it("sends no Authorization header when unauthenticated", async () => {
    const spy = mockFetch(async () => jsonResponse(200, {}));
    await githubRequest({ path: "/rate_limit" });
    const init = spy.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("reads the rate-limit bucket that answered", async () => {
    mockFetch(async () =>
      jsonResponse(
        200,
        {},
        {
          "x-ratelimit-limit": "30",
          "x-ratelimit-remaining": "12",
          "x-ratelimit-reset": "1800000000",
          "x-ratelimit-resource": "search",
        },
      ),
    );
    const { meta } = await githubRequest({ path: "/search/repositories", resource: "search" });
    expect(meta.rateLimit).toMatchObject({ limit: 30, remaining: 12, resource: "search" });
  });

  it("serialises query parameters and skips empty ones", async () => {
    const spy = mockFetch(async () => jsonResponse(200, {}));
    await githubRequest({ path: "/search/repositories", query: { q: "react ui", sort: undefined, page: 2 } });
    const url = new URL(spy.mock.calls[0]?.[0] as string);
    expect(url.searchParams.get("q")).toBe("react ui");
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.has("sort")).toBe(false);
  });

  it("de-duplicates identical in-flight requests", async () => {
    const spy = mockFetch(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return jsonResponse(200, { ok: true });
    });
    const [a, b] = await Promise.all([
      githubRequest({ path: "/repos/a/b" }),
      githubRequest({ path: "/repos/a/b" }),
    ]);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(a.data).toEqual(b.data);
    expect(b.meta.fromCache).toBe(true);
  });

  it("serves cached responses within the cache window", async () => {
    const spy = mockFetch(async () => jsonResponse(200, { cached: true }));
    await githubRequest({ path: "/repos/a/b", cacheSeconds: 60 });
    const second = await githubRequest({ path: "/repos/a/b", cacheSeconds: 60 });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(second.meta.fromCache).toBe(true);
  });

  it("supports raw text responses (README)", async () => {
    mockFetch(async () => new Response("# Title\n\nBody", { status: 200 }));
    const { data } = await githubRequest<string>({
      path: "/repos/a/b/readme",
      accept: "application/vnd.github.raw+json",
      responseType: "text",
    });
    expect(data).toContain("# Title");
  });
});

describe("GitHub error mapping", () => {
  it("maps 401 to unauthorized and explains the missing token", async () => {
    mockFetch(async () => jsonResponse(401, { message: "Requires authentication" }));
    await expect(githubRequest({ path: "/search/code", requiresAuth: false })).rejects.toMatchObject({
      kind: "unauthorized",
      status: 401,
    });
  });

  it("refuses requiresAuth calls before hitting the network", async () => {
    const spy = mockFetch(async () => jsonResponse(200, {}));
    await expect(githubRequest({ path: "/search/code", requiresAuth: true })).rejects.toMatchObject({
      kind: "unauthorized",
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it("maps a 403 with Retry-After to a secondary rate limit", async () => {
    mockFetch(async () => jsonResponse(403, { message: "slow down" }, { "retry-after": "42" }));
    const error = await githubRequest({ path: "/search/repositories" }).catch((caught) => caught);
    expect(error).toBeInstanceOf(GithubApiError);
    expect(error.kind).toBe("rate_limited");
    expect(error.retryAfterSeconds).toBe(42);
    expect(error.message).toMatch(/slow down/i);
  });

  it("maps an exhausted primary rate limit and suggests configuring a token", async () => {
    mockFetch(async () =>
      jsonResponse(
        403,
        { message: "API rate limit exceeded" },
        { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(Math.floor(Date.now() / 1000) + 600) },
      ),
    );
    const error: GithubApiError = await githubRequest({ path: "/search/repositories" }).catch((caught) => caught);
    expect(error.kind).toBe("rate_limited");
    expect(error.message).toMatch(/limit has been reached/);
    expect(error.hint).toMatch(/GITHUB_TOKEN/);
    expect(error.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("maps 404 to not_found", async () => {
    mockFetch(async () => jsonResponse(404, { message: "Not Found" }));
    await expect(githubRequest({ path: "/repos/a/b" })).rejects.toMatchObject({ kind: "not_found", status: 404 });
  });

  it("maps 422 to validation and surfaces GitHub's detail", async () => {
    mockFetch(async () => jsonResponse(422, { message: "Validation Failed", errors: [{ message: "Invalid date" }] }));
    const error: GithubApiError = await githubRequest({ path: "/search/repositories" }).catch((caught) => caught);
    expect(error.kind).toBe("validation");
    expect(error.message).toMatch(/Invalid date/);
  });

  it("maps 429 to rate_limited", async () => {
    mockFetch(async () => jsonResponse(429, {}, { "retry-after": "7" }));
    await expect(githubRequest({ path: "/search/repositories" })).rejects.toMatchObject({
      kind: "rate_limited",
      retryAfterSeconds: 7,
    });
  });

  it("maps 5xx to unavailable", async () => {
    mockFetch(async () => jsonResponse(502, { message: "Bad Gateway" }));
    await expect(githubRequest({ path: "/repos/a/b" })).rejects.toMatchObject({ kind: "unavailable" });
  });

  it("maps network failures without leaking the request details", async () => {
    process.env.GITHUB_TOKEN = TOKEN;
    mockFetch(async () => {
      throw new TypeError(`fetch failed for https://api.github.com/x?token=${TOKEN}`);
    });
    const error: GithubApiError = await githubRequest({ path: "/repos/a/b" }).catch((caught) => caught);
    expect(error.kind).toBe("network");
    expect(error.message).not.toContain(TOKEN);
    expect(error.message).not.toContain("api.github.com");
  });

  it("maps a stalled request to a timeout", async () => {
    mockFetch(
      () =>
        new Promise<Response>((resolve) =>
          setTimeout(() => resolve(jsonResponse(200, {})), 500),
        ),
    );
    const error: GithubApiError = await githubRequest({ path: "/repos/a/b", timeoutMs: 20 }).catch(
      (caught) => caught,
    );
    expect(error.kind).toBe("timeout");
  });

  it("never serialises the token into an error payload", async () => {
    process.env.GITHUB_TOKEN = TOKEN;
    mockFetch(async () => jsonResponse(403, { message: "Forbidden" }));
    const error: GithubApiError = await githubRequest({ path: "/repos/a/b" }).catch((caught) => caught);
    const serialized = JSON.stringify(error.toJSON());
    expect(serialized).not.toContain(TOKEN);
    expect(error.message).not.toContain(TOKEN);
  });
});

describe("token handling", () => {
  it("returns null for an unset or blank token", () => {
    delete process.env.GITHUB_TOKEN;
    expect(getGithubToken()).toBeNull();
    process.env.GITHUB_TOKEN = "   ";
    expect(getGithubToken()).toBeNull();
  });

  it("trims surrounding whitespace", () => {
    process.env.GITHUB_TOKEN = `  ${TOKEN}  `;
    expect(getGithubToken()).toBe(TOKEN);
  });
});
