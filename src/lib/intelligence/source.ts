import "server-only";
import { z } from "zod";
import { githubRequest } from "@/lib/github/client";
import { GithubApiError } from "@/lib/github/errors";
import { assertRef, getRepository } from "@/lib/github/repos";
import { githubRepoUrl, repoFilePath, type RepoRef } from "@/lib/validation/repository";

export interface SourceFile { path: string; sha: string; size: number }
export interface SourceIndex { ref: RepoRef; revision: string; files: SourceFile[]; truncated: boolean }
export interface SourceText extends SourceFile { text: string; url: string }
const sha = z.string().regex(/^[a-f0-9]{40}$/i);
const headShape = z.array(z.object({ sha, commit: z.object({ tree: z.object({ sha }) }) })).max(1);
const entryShape = z.object({ path: repoFilePath, mode: z.enum(["100644", "100755"]), type: z.literal("blob"), sha, size: z.number().int().nonnegative() });
const excluded = /(?:^|\/)(?:node_modules|vendor|dist|coverage|build|\.git|\.next|_site|third_party)(?:\/|$)/i;
const readable = /(?:\.(?:tsx?|jsx?|mjs|cjs|py|rb|go|rs|java|kt|swift|cs|php|vue|svelte|json|ya?ml|toml|xml|md|rst|sql|ini|cfg|conf|env|txt|sh|html|lock|mod)|(?:^|\/)(?:dockerfile|gemfile|makefile|\.gitignore|\.npmrc|\.env\.(?:example|sample)))$/i;

export async function getSourceIndex(ref: RepoRef, signal?: AbortSignal): Promise<SourceIndex | null> {
  assertRef(ref);
  const { data: repository } = await getRepository(ref, signal);
  const canonical = { owner: repository.owner.login, repo: repository.name };
  assertRef(canonical);
  const base = `/repos/${canonical.owner}/${canonical.repo}`;
  let commit;
  try {
    const { data } = await githubRequest<unknown>({ path: `${base}/commits`, query: { per_page: 1 }, signal });
    const parsed = headShape.safeParse(data);
    if (!parsed.success) throw new GithubApiError({ kind: "unavailable", message: "GitHub did not return a recognizable commit tree." });
    commit = parsed.data[0];
  } catch (error) {
    if (error instanceof GithubApiError && error.status === 409) return null;
    throw error;
  }
  if (!commit) return null;
  const { data } = await githubRequest<{ tree?: unknown[]; truncated?: boolean }>({ path: `${base}/git/trees/${commit.commit.tree.sha}`, query: { recursive: 1 }, signal });
  if (!Array.isArray(data.tree)) throw new GithubApiError({ kind: "unavailable", message: "GitHub did not return a file tree." });
  const files: SourceFile[] = [];
  const limit = 12_000;
  for (const raw of data.tree.slice(0, limit)) {
    const entry = entryShape.safeParse(raw);
    if (entry.success && !excluded.test(entry.data.path)) files.push({ path: entry.data.path, sha: entry.data.sha, size: entry.data.size });
  }
  return { ref: canonical, revision: commit.sha, files, truncated: Boolean(data.truncated) || data.tree.length > limit };
}

export function sourceLink(index: Pick<SourceIndex, "ref" | "revision">, path: string, from?: number, to?: number) {
  return `${githubRepoUrl(index.ref)}/blob/${index.revision}/${path.split("/").map(encodeURIComponent).join("/")}${from ? `#L${from}${to && to > from ? `-L${to}` : ""}` : ""}`;
}

export async function readSourceFile(index: SourceIndex, file: SourceFile, signal?: AbortSignal, maxBytes = 48 * 1024): Promise<SourceText | null> {
  if (file.size > maxBytes || !readable.test(file.path) || !sha.safeParse(file.sha).success) return null;
  const { owner, repo } = index.ref;
  const { data } = await githubRequest<{ encoding?: string; content?: string; sha?: string; size?: number }>({ path: `/repos/${owner}/${repo}/git/blobs/${file.sha}`, signal });
  if (data.encoding !== "base64" || data.sha !== file.sha || typeof data.content !== "string" || data.content.length > Math.ceil(maxBytes * 1.5)) return null;
  const buffer = Buffer.from(data.content, "base64");
  if (buffer.length > maxBytes || buffer.includes(0) || data.size !== buffer.length) return null;
  try { return { ...file, text: new TextDecoder("utf-8", { fatal: true }).decode(buffer), url: sourceLink(index, file.path) }; } catch { return null; }
}

export async function sampleFiles(index: SourceIndex, selected: SourceFile[], options: { maxBytes?: number; signal?: AbortSignal } = {}) {
  const files: SourceText[] = [];
  let skipped = 0;
  for (let offset = 0; offset < selected.length; offset += 3) {
    options.signal?.throwIfAborted();
    const results = await Promise.allSettled(selected.slice(offset, offset + 3).map((file) => readSourceFile(index, file, options.signal, options.maxBytes)));
    for (const result of results) {
      if (result.status === "fulfilled" && result.value) files.push(result.value);
      else skipped++;
    }
  }
  return { files, skipped };
}

const stopWords = new Set(["this", "that", "what", "where", "does", "which", "with", "about", "explain", "show", "file", "code", "work", "from", "have", "your", "repo", "project", "repository", "implemented", "please"]);
export function keywords(question: string) {
  const words = question.toLowerCase().match(/[a-z][a-z0-9_-]{2,32}/g) ?? [];
  const unique = new Set(words.filter((word) => !stopWords.has(word)));
  if ([...unique].some((word) => /auth|login|session/.test(word))) ["auth", "session", "login", "oauth"].forEach((word) => unique.add(word));
  if ([...unique].some((word) => /data|database|postgres/.test(word))) ["db", "schema", "database", "model", "prisma"].forEach((word) => unique.add(word));
  if ([...unique].some((word) => /endpoint|api|request|routing/.test(word))) ["api", "route", "endpoint", "controller"].forEach((word) => unique.add(word));
  return [...unique].slice(0, 25);
}

export function chooseFiles(files: SourceFile[], terms: string[], limit = 8, preferred?: RegExp): SourceFile[] {
  return files.filter((file) => file.size <= 48 * 1024 && readable.test(file.path) && !/\.(?:min\.js|lock)$|(?:^|\/)package-lock\.json$/i.test(file.path))
    .map((file) => {
      const path = file.path.toLowerCase();
      const relevance = terms.reduce((sum, term) => sum + (path.includes(term) ? 12 : 0), 0);
      const priority = preferred?.test(file.path) ? 48 : 0;
      const anchor = /(?:^|\/)(?:readme[^/]*\.md|package\.json|go\.mod|pyproject\.toml|cargo\.toml|main\.(?:go|py|rs)|index\.tsx?)$/.test(path) ? 10 : 0;
      const nest = path.split("/").length;
      return { file, score: relevance + priority + anchor - Math.min(8, nest) - (/test|fixture|example/.test(path) ? 2 : 0) };
    }).sort((a, b) => b.score - a.score || a.file.path.localeCompare(b.file.path)).slice(0, limit).map((item) => item.file);
}
