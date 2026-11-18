// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { extractExcerpts } from "@/lib/ai/context";
import { __clearGithubCache } from "@/lib/github/client";
import { mapRepositoryDetail, mapCodeSearchItem } from "@/lib/github/mappers";
import { rawRepository } from "@/test-utils/fixtures";
import { repositoryInput, repoFilePath } from "@/lib/validation/repository";
import { mapArchitecture } from "./architecture";
import { inventory, cyclonedx, inspectDependencies } from "./dependencies";
import { redactSource } from "./redact";
import { getSourceIndex, sampleFiles, sourceLink, type SourceIndex, type SourceText } from "./source";
import { scanSecurity, scanQuality } from "./static-review";
import { scoreHealth } from "./health";
import type { CollectedEvidence } from "@/lib/analyze/collect";

const ref = { owner: "facebook", repo: "react" };
const revision = "a".repeat(40), tree = "b".repeat(40), blob = "c".repeat(40);
const makeFile = (path: string, text: string): SourceText => ({ path, text, sha: blob, size: Buffer.byteLength(text), url: `https://github.com/facebook/react/blob/${revision}/${path}` });
const index = (files: SourceText[], truncated = false): SourceIndex => ({ ref, revision, files, truncated });

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); __clearGithubCache(); });

describe("pinned evidence and redaction", () => {
  it("reads only immutable regular text files and never follows symlinks or submodules", async () => {
    const body = "export const version = 1;\n";
    const fetcher = vi.fn(async (input: string) => {
      const url = new URL(input); expect(url.origin).toBe("https://api.github.com");
      if (url.pathname === "/repos/facebook/react") return Response.json(rawRepository);
      if (url.pathname.endsWith("/commits")) return Response.json([{ sha: revision, commit: { tree: { sha: tree } } }]);
      if (url.pathname.endsWith(tree)) return Response.json({ tree: [
        { path: "app/page.tsx", sha: blob, type: "blob", mode: "100644", size: Buffer.byteLength(body) },
        { path: "link.ts", sha: blob, type: "blob", mode: "120000", size: 15 },
        { path: "packages/external", sha: blob, type: "commit", mode: "160000", size: 15 },
        { path: "../escaped.ts", sha: blob, type: "blob", mode: "100644", size: 15 },
        { path: "node_modules/dependency.ts", sha: blob, type: "blob", mode: "100644", size: 15 },
      ] });
      if (url.pathname.endsWith(`/git/blobs/${blob}`)) return Response.json({ sha: blob, encoding: "base64", size: Buffer.byteLength(body), content: Buffer.from(body).toString("base64") });
      throw new Error("Unexpected request");
    });
    vi.stubGlobal("fetch", fetcher);
    const source = await getSourceIndex(ref); expect(source).not.toBeNull();
    expect(source?.files.map(({ path }) => path)).toEqual(["app/page.tsx"]);
    expect((await sampleFiles(source!, source!.files)).files[0]).toMatchObject({ text: body, url: `https://github.com/facebook/react/blob/${revision}/app/page.tsx` });
    expect(mapArchitecture(source!).map((node) => node.id)).toEqual(["web"]);
    expect(sourceLink(source!, "a folder/sub.ts", 1, 3)).toContain("a%20folder/sub.ts#L1-L3");
  });
  it("rejects malformed paths and non-GitHub repository inputs", () => {
    for (const invalid of ["https://github.com@example.invalid/a/b", "https://github.com/a/b?branch=main", "https://127.0.0.1/a/b", "a/.."]) expect(repositoryInput.safeParse(invalid).success).toBe(false);
    for (const path of ["a/../b", "../x", "a/%2fetc", "a\\b", "/a"]) expect(repoFilePath.safeParse(path).success).toBe(false);
    expect(repositoryInput.parse("https://github.com/facebook/react.git")).toEqual(ref);
  });
  it("retains line offsets while scrubbing credential strings from evidence and code snippets", () => {
    const secret = `ghp_${"x".repeat(34)}`;
    const material = `const token = "${secret}";\n-----BEGIN PRIVATE KEY-----\nDO_NOT_ECHO_KEY_BODY\n-----END PRIVATE KEY-----\nexport const status = true;`;
    const file = makeFile("src/status.ts", material);
    const [excerpt] = extractExcerpts(index([file]), [file], ["status"]);
    expect(excerpt).toMatchObject({ citation: { path: file.path, from: 1, to: 5 } });
    expect(excerpt?.text).toContain("5: export const status = true;");
    expect(excerpt?.text).not.toContain(secret); expect(excerpt?.text).not.toContain("DO_NOT_ECHO_KEY_BODY");
    expect(redactSource(material).split("\n")).toHaveLength(5);
    expect(scanSecurity([file])[0]).toMatchObject({ category: "Credential-like material", line: 1, confidence: "medium" });
    expect(JSON.stringify(scanSecurity([file]))).not.toContain(secret);
    expect(mapCodeSearchItem({ text_matches: [{ fragment: material }] }, 0).textMatches[0]?.fragment).not.toContain(secret);
    expect(scanQuality([makeFile("src/types.ts", "const temp: any = 1;")])).toMatchObject([{ line: 1, category: "Type safety" }]);
  });
});

describe("health and dependency provenance", () => {
  it("normalizes measured weights but shows unmeasured categories and coverage", () => {
    const evidence: CollectedEvidence = { repository: { ...mapRepositoryDetail(rawRepository), archived: true }, rateLimit: null, failed: ["commits", "readme", "contributors"], commits: [], languages: [], contributors: [], readme: { content: null, missing: false, truncated: false, bytes: 0 }, root: [], community: null, release: null };
    const measured = scoreHealth(evidence, null, null);
    expect(measured).toMatchObject({ score: 0, coverage: 20, indicators: { commitsIn30Days: null, contributorsSampled: null } });
    expect(measured.categories.filter((category) => category.score === null)).toHaveLength(6);
    vi.stubEnv("REPOLENS_HEALTH_MAINTENANCE_WEIGHT", "40");
    expect(scoreHealth(evidence, null, null)).toMatchObject({ score: 0, coverage: 33 });
  });
  it("uses actual lock versions and only queries advisories for exact known versions", async () => {
    const files = [makeFile("package.json", JSON.stringify({ dependencies: { example: "^1.2.0", floating: "^2", remote: "https://example.invalid/vendor" } })), makeFile("package-lock.json", JSON.stringify({ packages: { "": { dependencies: { example: "^1.2.0" } }, "node_modules/example": { version: "1.2.3", license: "MIT" }, "node_modules/transitive": { version: "0.1.1" } } }))];
    const parsed = inventory(files);
    expect(parsed.dependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "example", version: "1.2.3", relation: "direct", license: "MIT", resolved: true }),
      expect.objectContaining({ name: "floating", version: null, license: null }),
      expect.objectContaining({ name: "remote", version: null, constraint: "Non-registry or unsupported constraint" }),
      expect.objectContaining({ name: "transitive", relation: "transitive", resolved: true }),
    ]));
    expect(parsed.dependencies.filter((item) => item.name === "example")).toHaveLength(1);
    const fetcher = vi.fn(async (input: string, init?: RequestInit) => {
      const url = new URL(input);
      if (url.hostname === "api.osv.dev") {
        expect(init).toMatchObject({ redirect: "error" });
        expect(JSON.parse(String(init?.body)).queries).toEqual([{ package: { name: "example", ecosystem: "npm" }, version: "1.2.3" }, { package: { name: "transitive", ecosystem: "npm" }, version: "0.1.1" }]);
        return Response.json({ results: [{ vulns: [{ id: "TEST-ADVISORY-1" }] }, {}] });
      }
      if (url.hostname === "registry.npmjs.org") return Response.json({ version: "1.3.0" });
      if (url.pathname === "/repos/facebook/react") return Response.json(rawRepository);
      const file = files.find((item) => item.sha === url.pathname.split("/").at(-1));
      return Response.json(file ? { sha: file.sha, encoding: "base64", size: file.size, content: Buffer.from(file.text).toString("base64") } : null);
    });
    files[1]!.sha = "d".repeat(40);
    vi.stubGlobal("fetch", fetcher);
    const report = await inspectDependencies(index(files));
    expect(report).toMatchObject({ advisoryCoverage: 2, advisoryUnavailable: false });
    expect(report.dependencies.find((entry) => entry.name === "example")).toMatchObject({ advisories: ["TEST-ADVISORY-1"], outdated: true });
    const sbom = cyclonedx(index(files), report);
    expect(sbom).toMatchObject({ bomFormat: "CycloneDX", specVersion: "1.5", metadata: { component: { version: revision } } });
    expect(sbom.components.find((entry) => entry.name === "floating")).not.toHaveProperty("version");
  });
});
