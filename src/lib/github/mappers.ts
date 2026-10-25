import type {
  CodeSearchItem,
  CommitSummary,
  ContributorSummary,
  DeveloperSummary,
  LanguageStat,
  LicenseSummary,
  OwnerSummary,
  RepositoryDetail,
  RepositorySummary,
  TreeEntry,
} from "./types";
import { percentage } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/* Raw GitHub payload shapes (only the fields RepoLens reads)                  */
/* -------------------------------------------------------------------------- */

interface RawOwner {
  login: string;
  avatar_url?: string | null;
  type?: string;
  html_url?: string;
}

interface RawLicense {
  key?: string;
  name?: string;
  spdx_id?: string | null;
}

export interface RawRepository {
  id: number;
  name: string;
  full_name: string;
  owner?: RawOwner;
  description?: string | null;
  html_url: string;
  homepage?: string | null;
  language?: string | null;
  topics?: string[];
  stargazers_count?: number;
  forks_count?: number;
  open_issues_count?: number;
  watchers_count?: number;
  watchers?: number;
  subscribers_count?: number;
  network_count?: number;
  archived?: boolean;
  disabled?: boolean;
  fork?: boolean;
  license?: RawLicense | null;
  default_branch?: string;
  size?: number;
  created_at?: string;
  updated_at?: string;
  pushed_at?: string | null;
  has_issues?: boolean;
  has_wiki?: boolean;
  has_pages?: boolean;
  has_discussions?: boolean;
  visibility?: string;
  is_template?: boolean;
  score?: number;
}

function mapOwner(owner: RawOwner | undefined, fallbackLogin: string): OwnerSummary {
  return {
    login: owner?.login ?? fallbackLogin,
    avatarUrl: owner?.avatar_url ?? null,
    type: owner?.type ?? "User",
    htmlUrl: owner?.html_url ?? `https://github.com/${owner?.login ?? fallbackLogin}`,
  };
}

function mapLicense(license: RawLicense | null | undefined): LicenseSummary | null {
  if (!license || !license.key || license.key === "no-license") return null;
  return {
    key: license.key,
    name: license.name ?? license.key,
    spdxId: license.spdx_id && license.spdx_id !== "NOASSERTION" ? license.spdx_id : null,
  };
}

export function mapRepositorySummary(repo: RawRepository): RepositorySummary {
  const ownerLogin = repo.full_name.includes("/")
    ? repo.full_name.split("/")[0] ?? repo.name
    : repo.owner?.login ?? "";
  return {
    id: repo.id,
    fullName: repo.full_name,
    name: repo.name,
    owner: mapOwner(repo.owner, ownerLogin),
    description: repo.description?.trim() ? repo.description.trim() : null,
    htmlUrl: repo.html_url,
    homepage: repo.homepage?.trim() ? repo.homepage.trim() : null,
    language: repo.language ?? null,
    topics: Array.isArray(repo.topics) ? repo.topics.filter(Boolean) : [],
    stargazersCount: repo.stargazers_count ?? 0,
    forksCount: repo.forks_count ?? 0,
    openIssuesCount: repo.open_issues_count ?? 0,
    watchersCount: repo.watchers_count ?? repo.watchers ?? 0,
    archived: Boolean(repo.archived),
    disabled: Boolean(repo.disabled),
    fork: Boolean(repo.fork),
    license: mapLicense(repo.license),
    defaultBranch: repo.default_branch ?? "main",
    size: repo.size ?? 0,
    createdAt: repo.created_at ?? "",
    updatedAt: repo.updated_at ?? "",
    pushedAt: repo.pushed_at ?? repo.updated_at ?? "",
    searchScore: typeof repo.score === "number" ? repo.score : null,
  };
}

export function mapRepositoryDetail(repo: RawRepository): RepositoryDetail {
  return {
    ...mapRepositorySummary(repo),
    networkCount: repo.network_count ?? null,
    subscribersCount: repo.subscribers_count ?? null,
    hasIssues: Boolean(repo.has_issues),
    hasWiki: Boolean(repo.has_wiki),
    hasPages: Boolean(repo.has_pages),
    hasDiscussions: Boolean(repo.has_discussions),
    visibility: repo.visibility ?? "public",
    isTemplate: Boolean(repo.is_template),
  };
}

export function mapLanguages(raw: Record<string, number> | null | undefined): LanguageStat[] {
  if (!raw) return [];
  const entries = Object.entries(raw).filter(([, bytes]) => Number.isFinite(bytes));
  const total = entries.reduce((sum, [, bytes]) => sum + bytes, 0);
  return entries
    .map(([language, bytes]) => ({ language, bytes, percentage: percentage(bytes, total) }))
    .sort((a, b) => b.bytes - a.bytes);
}

export function mapContributors(raw: unknown): ContributorSummary[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
    .map((entry) => ({
      login: typeof entry.login === "string" ? entry.login : "unknown",
      avatarUrl: typeof entry.avatar_url === "string" ? entry.avatar_url : null,
      htmlUrl:
        typeof entry.html_url === "string"
          ? entry.html_url
          : `https://github.com/${typeof entry.login === "string" ? entry.login : ""}`,
      contributions: typeof entry.contributions === "number" ? entry.contributions : 0,
      type: typeof entry.type === "string" ? entry.type : "User",
    }));
}

export function mapCommits(raw: unknown): CommitSummary[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
    .map((entry) => {
      const commit = (entry.commit ?? {}) as Record<string, unknown>;
      const author = commit.author as Record<string, unknown> | undefined;
      const githubAuthor = entry.author as Record<string, unknown> | null | undefined;
      const message = typeof commit.message === "string" ? commit.message.split("\n")[0] ?? "" : "";
      return {
        sha: typeof entry.sha === "string" ? entry.sha : "",
        htmlUrl: typeof entry.html_url === "string" ? entry.html_url : "",
        message: message || "(no message)",
        authorName: typeof author?.name === "string" ? author.name : null,
        authorLogin: typeof githubAuthor?.login === "string" ? githubAuthor.login : null,
        authorAvatarUrl: typeof githubAuthor?.avatar_url === "string" ? githubAuthor.avatar_url : null,
        date: typeof author?.date === "string" ? author.date : null,
      };
    })
    .filter((commit) => commit.sha.length > 0);
}

export function mapContents(raw: unknown): TreeEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
    .map((entry) => {
      const type = entry.type === "dir" ? "directory" : "file";
      return {
        path: typeof entry.path === "string" ? entry.path : "",
        name: typeof entry.name === "string" ? entry.name : "",
        type,
        size: typeof entry.size === "number" ? entry.size : null,
        downloadUrl: typeof entry.download_url === "string" ? entry.download_url : null,
      } as TreeEntry;
    })
    .filter((entry) => entry.path.length > 0)
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

export function mapDeveloper(raw: Record<string, unknown>, score: number | null): DeveloperSummary {
  const str = (value: unknown) => (typeof value === "string" && value.trim() ? value : null);
  const num = (value: unknown) => (typeof value === "number" ? value : null);
  return {
    login: str(raw.login) ?? "unknown",
    id: num(raw.id) ?? 0,
    avatarUrl: str(raw.avatar_url),
    htmlUrl: str(raw.html_url) ?? `https://github.com/${str(raw.login) ?? ""}`,
    type: str(raw.type) ?? "User",
    name: str(raw.name),
    bio: str(raw.bio),
    company: str(raw.company),
    location: str(raw.location),
    blog: str(raw.blog),
    publicRepos: num(raw.public_repos),
    followers: num(raw.followers),
    following: num(raw.following),
    createdAt: str(raw.created_at),
    searchScore: score,
    partial: false,
  };
}

export function mapCodeSearchItem(raw: Record<string, unknown>, index: number): CodeSearchItem {
  const repo = raw.repository as RawRepository | undefined;
  const matches = Array.isArray(raw.text_matches) ? raw.text_matches : [];
  return {
    id: typeof raw.sha === "string" ? raw.sha : `code-${index}`,
    name: typeof raw.name === "string" ? raw.name : "file",
    path: typeof raw.path === "string" ? raw.path : "",
    sha: typeof raw.sha === "string" ? raw.sha : "",
    htmlUrl: typeof raw.html_url === "string" ? raw.html_url : "",
    repository: repo ? mapRepositorySummary(repo) : null,
    textMatches: matches
      .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
      .map((entry) => {
        const fragment = typeof entry.fragment === "string" ? entry.fragment : null;
        const repo2 = entry.repository as Record<string, unknown> | undefined;
        return {
          repository:
            typeof repo2?.full_name === "string"
              ? repo2.full_name
              : typeof entry.object_url === "string"
                ? entry.object_url
                : null,
          path: typeof entry.path === "string" ? entry.path : null,
          fragment,
          language: typeof entry.language === "string" ? entry.language : null,
          htmlUrl: typeof entry.html_url === "string" ? entry.html_url : null,
        };
      }),
  };
}
