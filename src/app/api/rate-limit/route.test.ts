import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";
import { __clearGithubCache } from "@/lib/github/client";

function mockGithub(handler: (url: URL) => Response) {
  const urls: URL[] = [];
  const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const url = new URL(raw);
    urls.push(url);
    return handler(url);
  });
  return { spy, urls };
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

beforeEach(() => {
  vi.restoreAllMocks();
  __clearGithubCache();
});

describe("GET /api/rate-limit", () => {
  it("reports both GitHub buckets and whether the call was authenticated", async () => {
    const reset = Math.floor(Date.now() / 1000) + 600;
    const { urls } = mockGithub(() =>
      json({ resources: { core: { limit: 5000, remaining: 4321, reset }, search: { limit: 30, remaining: 29, reset } } }),
    );

    const response = await GET(new Request("http://localhost/api/rate-limit"));
    const body = (await response.json()) as {
      core: { limit: number; remaining: number; resetAt: string; resource: string };
      search: { remaining: number; resource: string };
      authenticated: boolean;
    };

    expect(urls[0]?.pathname).toBe("/rate_limit");
    expect(response.status).toBe(200);
    expect(body.core.limit).toBe(5000);
    expect(body.core.remaining).toBe(4321);
    expect(body.core.resetAt).toBe(new Date(reset * 1000).toISOString());
    expect(body.search.remaining).toBe(29);
    expect(typeof body.authenticated).toBe("boolean");
  });

  it("never returns a secret value", async () => {
    mockGithub(() => json({ resources: {} }));
    const response = await GET(new Request("http://localhost/api/rate-limit"));
    const text = await response.text();
    const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? "";
    if (token.length > 0) expect(text).not.toContain(token);
    expect(text).not.toContain("Authorization");
    expect(text).not.toContain("Bearer");
  });

  it("maps a GitHub outage to a service unavailable response", async () => {
    mockGithub(() => new Response("nope", { status: 503 }));
    const response = await GET(new Request("http://localhost/api/rate-limit"));
    expect(response.status).toBe(503);
    const body = (await response.json()) as { error: { kind: string; message: string } };
    expect(body.error.kind).toBe("unavailable");
    expect(body.error.message).toMatch(/GitHub/);
  });
});
