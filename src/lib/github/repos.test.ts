import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GithubApiError } from "./errors";
import { getCommits, getContents, getContributors, getLanguages, getReadme, getRepository } from "./repos";
import { __clearGithubCache } from "./client";
import { mapContents, mapLanguages, mapRepositoryDetail, mapRepositorySummary } from "./mappers";
import { rawRepository, sparseRawRepository } from "@/test-utils/fixtures";

function mockFetch(implementation: (url: string) => Promise<Response>) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    return implementation(url);
  });
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  vi.restoreAllMocks();
  __clearGithubCache();
});
afterEach(() => {
  vi.restoreAllMocks();
  __clearGithubCache();
});

describe("repository retrieval", () => {
  it("returns normalized repository detail", async () => {
    mockFetch(async () => json(200, rawRepository));
    const { data } = await getRepository({ owner: "facebook", repo: "react" });
    expect(data.fullName).toBe("facebook/react");
    expect(data.stargazersCount).toBe(231000);
    expect(data.subscribersCount).toBe(6700);
    expect(data.license?.spdxId).toBe("MIT");
    expect(data.defaultBranch).toBe("main");
  });

  it("propagates a 404 as not_found so the page can render its not-found state", async () => {
    mockFetch(async () => json(404, { message: "Not Found" }));
    await expect(getRepository({ owner: "nope", repo: "gone" })).rejects.toMatchObject({ kind: "not_found" });
  });

  it("surfaces upstream failures instead of inventing data", async () => {
    mockFetch(async () => json(500, { message: "Server Error" }));
    await expect(getRepository({ owner: "a", repo: "b" })).rejects.toBeInstanceOf(GithubApiError);
  });

  it("rejects malformed owner/repo paths before calling GitHub", async () => {
    const spy = mockFetch(async () => json(200, rawRepository));
    await expect(getRepository({ owner: "bad owner!", repo: "repo" })).rejects.toMatchObject({ kind: "validation" });
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("README retrieval", () => {
  it("returns raw markdown", async () => {
    mockFetch(async () => new Response("# Hello\n\nWorld", { status: 200 }));
    const readme = await getReadme({ owner: "a", repo: "b" });
    expect(readme.missing).toBe(false);
    expect(readme.content).toContain("# Hello");
    expect(readme.bytes).toBeGreaterThan(0);
  });

  it("reports a missing README instead of throwing", async () => {
    mockFetch(async () => json(404, { message: "Not Found" }));
    const readme = await getReadme({ owner: "a", repo: "b" });
    expect(readme).toEqual({ content: null, missing: true, truncated: false, bytes: 0 });
  });

  it("truncates very large READMEs and flags it", async () => {
    const huge = "x".repeat(600 * 1024);
    mockFetch(async () => new Response(huge, { status: 200 }));
    const readme = await getReadme({ owner: "a", repo: "b" });
    expect(readme.truncated).toBe(true);
    expect(readme.content?.length).toBe(512 * 1024);
  });
});

describe("supporting endpoints", () => {
  it("computes language percentages from byte counts", async () => {
    mockFetch(async () => json(200, { TypeScript: 7500, JavaScript: 2500 }));
    const { data } = await getLanguages({ owner: "a", repo: "b" });
    expect(data[0]).toMatchObject({ language: "TypeScript", percentage: 75 });
    expect(data[1]).toMatchObject({ language: "JavaScript", percentage: 25 });
  });

  it("returns an empty contributor list for 204/unknown responses", async () => {
    mockFetch(async () => new Response(null, { status: 204 }));
    const { data } = await getContributors({ owner: "a", repo: "b" });
    expect(data).toEqual([]);
  });

  it("returns an empty commit list for an empty repository (409)", async () => {
    mockFetch(async () => json(409, { message: "Git Repository is empty." }));
    const { data } = await getCommits({ owner: "a", repo: "b" });
    expect(data).toEqual([]);
  });

  it("maps a directory listing and sorts directories first", async () => {
    mockFetch(async () =>
      json(200, [
        { name: "README.md", path: "README.md", type: "file", size: 100, download_url: "https://x" },
        { name: "src", path: "src", type: "dir", size: 0, download_url: null },
      ]),
    );
    const { data } = await getContents({ owner: "a", repo: "b" });
    expect(data[0]).toMatchObject({ name: "src", type: "directory" });
    expect(data[1]).toMatchObject({ name: "README.md", type: "file" });
  });
});

describe("payload mappers", () => {
  it("falls back gracefully when metadata is missing", () => {
    const summary = mapRepositorySummary(sparseRawRepository as never);
    expect(summary.fullName).toBe("someone/mystery");
    expect(summary.description).toBeNull();
    expect(summary.language).toBeNull();
    expect(summary.topics).toEqual([]);
    expect(summary.license).toBeNull();
    expect(summary.stargazersCount).toBe(0);
    expect(summary.defaultBranch).toBe("main");
    expect(summary.owner.login).toBe("someone");
  });

  it("exposes detail-only fields", () => {
    const detail = mapRepositoryDetail(rawRepository as never);
    expect(detail.hasDiscussions).toBe(true);
    expect(detail.visibility).toBe("public");
    expect(detail.networkCount).toBe(47000);
  });

  it("ignores empty language payloads", () => {
    expect(mapLanguages(null)).toEqual([]);
    expect(mapLanguages({})).toEqual([]);
  });

  it("sorts directory entries and tolerates junk", () => {
    expect(mapContents("not-an-array")).toEqual([]);
  });
});
