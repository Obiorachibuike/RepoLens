import type { RepositorySummary } from "@/lib/github/types";

/** Realistic GitHub payload fragments used by unit tests. */

export const rawRepository = {
  id: 10270250,
  name: "react",
  full_name: "facebook/react",
  owner: {
    login: "facebook",
    avatar_url: "https://avatars.githubusercontent.com/u/69631?v=4",
    type: "Organization",
    html_url: "https://github.com/facebook",
  },
  description: "The library for web and native user interfaces.",
  html_url: "https://github.com/facebook/react",
  homepage: "https://react.dev",
  language: "JavaScript",
  topics: ["javascript", "library", "react", "ui"],
  stargazers_count: 231000,
  forks_count: 47000,
  open_issues_count: 1200,
  watchers_count: 231000,
  subscribers_count: 6700,
  network_count: 47000,
  archived: false,
  disabled: false,
  fork: false,
  license: { key: "mit", name: "MIT License", spdx_id: "MIT" },
  default_branch: "main",
  size: 900000,
  created_at: "2013-05-24T19:15:54Z",
  updated_at: "2026-01-05T10:00:00Z",
  pushed_at: "2026-01-04T18:30:00Z",
  has_issues: true,
  has_wiki: true,
  has_pages: false,
  has_discussions: true,
  visibility: "public",
  is_template: false,
};

export const repositorySummary: RepositorySummary = {
  id: 10270250,
  fullName: "facebook/react",
  name: "react",
  owner: {
    login: "facebook",
    avatarUrl: "https://avatars.githubusercontent.com/u/69631?v=4",
    type: "Organization",
    htmlUrl: "https://github.com/facebook",
  },
  description: "The library for web and native user interfaces.",
  htmlUrl: "https://github.com/facebook/react",
  homepage: "https://react.dev",
  language: "JavaScript",
  topics: ["javascript", "library", "react", "ui"],
  stargazersCount: 231000,
  forksCount: 47000,
  openIssuesCount: 1200,
  watchersCount: 231000,
  archived: false,
  disabled: false,
  fork: false,
  license: { key: "mit", name: "MIT License", spdxId: "MIT" },
  defaultBranch: "main",
  size: 900000,
  createdAt: "2013-05-24T19:15:54Z",
  updatedAt: "2026-01-05T10:00:00Z",
  pushedAt: "2026-01-04T18:30:00Z",
  searchScore: 1.0,
};

/** A repository with missing/odd metadata, to exercise the fallbacks. */
export const sparseRawRepository = {
  id: 999,
  name: "mystery",
  full_name: "someone/mystery",
  html_url: "https://github.com/someone/mystery",
  // no owner, no description, no language, no topics, no license
};
