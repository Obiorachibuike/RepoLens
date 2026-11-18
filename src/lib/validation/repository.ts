import { z } from "zod";

export const repoRefSchema = z.object({
  owner: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/),
  repo: z.string().regex(/^[A-Za-z0-9._-]{1,100}$/).refine((value) => value !== "." && value !== ".."),
});
export type RepoRef = z.infer<typeof repoRefSchema>;
export const repositoryInput = z.string().trim().min(3).max(240).transform((value, ctx) => {
  const match = /^(?:https:\/\/github\.com\/)?([^/?#]+)\/([^/?#]+)\/?$/i.exec(value);
  const result = repoRefSchema.safeParse({ owner: match?.[1], repo: match?.[2]?.replace(/\.git$/i, "") });
  if (!result.success) { ctx.addIssue({ code: "custom", message: "Enter owner/repository or an HTTPS GitHub repository URL." }); return z.NEVER; }
  return result.data;
});
export const repoFilePath = z.string().min(1).max(450).refine((value) =>
  !/[\\\u0000-\u001f\u007f]/.test(value) && value.split("/").every((part) => part !== "" && part !== "." && part !== ".." && !/^(?:%2e|%2f|%5c)/i.test(part)));
export function githubRepoUrl({ owner, repo }: RepoRef) {
  return `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
}
export function repoLensUrl({ owner, repo }: RepoRef) {
  return `/repository/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
}
