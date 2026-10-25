# RepoLens — Find Your Next Project

RepoLens is a full-stack GitHub search, repository discovery and repository intelligence
application. You describe what you want — a concept, a repository, or a whole project idea —
and RepoLens turns it into a real GitHub search, ranks the results with a documented scoring
formula, and then lets you inspect, visualize and analyze any repository you find.

Everything it shows comes from the GitHub REST API. Nothing is fabricated: no invented star
counts, no placeholder charts, no fake "100% match" badges. When RepoLens cannot get data, it
says so.

---

## 1. Features

- **Three search modes** that share one design system but behave differently:
  - `</> Repository` — raw GitHub query text plus structured filters, passed through verbatim.
  - `⌕ Find Repo` — natural-language description of a repository → deterministic query construction.
  - `♧ Project Idea` — natural-language project idea → keyword/technology extraction → real search
    plus follow-up suggestions.
- **Structured filters**: language, topics, minimum stars, minimum forks, created/updated date
  ranges, license, archived inclusion/exclusion, and free-text qualifiers you type yourself.
- **Sorting**: best match (GitHub's own ordering), most stars, most forks, recently updated,
  most help-wanted issues — ascending or descending, paginated up to GitHub's 1,000-result window.
- **Repository details page**: metadata, safely rendered README preview, file tree, contributors,
  recent commits, and a save action.
- **Visualize page**: real language distribution with correct percentages, directory tree,
  contributors and recent activity — only from data GitHub returned.
- **Analyze page**: an eight-section, evidence-based report (see §10).
- **Saved repositories and collections**: persisted in PostgreSQL when `DATABASE_URL` is set,
  otherwise in the browser with an explicit "not synced" notice.
- **Search history** with the same storage rule, recorded server-side on the first page of a search.
- **Discover page**: curated starting points plus three live GitHub-derived lists.
- **Developer search** and **code search** (code search requires a GitHub token — the UI explains
  this instead of pretending).
- **Dark, dense, responsive UI**: results are a table on desktop and cards on mobile, with no
  horizontal overflow.

## 2. Tech stack

| Layer      | Choice                                                            |
| ---------- | ----------------------------------------------------------------- |
| Framework  | Next.js 15.5 (App Router, Route Handlers, server components)      |
| Language   | TypeScript 5.9, `strict` + `noUncheckedIndexedAccess`             |
| UI         | React 19, Tailwind CSS v4, Radix UI primitives, lucide icons      |
| Markdown   | `react-markdown` + `remark-gfm` + `rehype-sanitize`               |
| Validation | Zod 4 (all query parameters and request bodies)                   |
| Database   | PostgreSQL via Drizzle ORM + `pg` (optional)                      |
| Testing    | Vitest 5 + Testing Library + jsdom                                |
| Linting    | ESLint 9 with `eslint-config-next` (also enforced during build)   |

There is no Redis, no job queue, no worker process and no extra backend service.

## 3. Project structure

```
src/
  app/                       pages + API route handlers
    api/                     20 route handlers (see §12)
    repository/[owner]/[repo]  details / visualize / analyze
    search/{repositories,developers,code}
    discover, saved, collections, history, settings
  components/
    ui/                      design-system primitives
    search/                  modes, search bar, filters, results table, hook
    repository/              header, README viewer, file tree
    saved | collections | history | settings | developers | code
  lib/
    github/                  API client, mappers, search, repositories, errors
    query/                   intent extraction, query building, relevance, follow-ups
    analyze/                 evidence collection + deterministic analysis
    validation/              zod schemas for every request
    api/                     response helpers and shared response shapes
    db/                      Drizzle schema, client, queries
    storage/                 browser-local fallback + preferences
drizzle/, scripts/migrate.mjs   SQL migration + runner
```

## 4. Getting started

```bash
npm install
cp .env.example .env    # optional — every variable is optional
npm run dev             # http://localhost:3000
```

RepoLens works with **zero configuration**. Without a token you get GitHub's unauthenticated
limits (60 core / 10 search requests per minute) and the UI tells you when they are exhausted.

## 5. Environment variables

| Variable       | Required | Effect                                                                                     |
| -------------- | -------- | ------------------------------------------------------------------------------------------ |
| `GITHUB_TOKEN` | No       | Raises limits to 5,000 core / 30 search per minute and unlocks GitHub **code search**.      |
| `DATABASE_URL` | No       | Enables server-side saved repositories, collections, search history and preferences.        |
| `AI_PROVIDER`  | No       | Reserved. RepoLens' discovery modes use a deterministic local extractor by default.         |
| `AI_API_KEY`   | No       | Reserved. **No AI key is needed for search, discovery or analysis.**                        |
| `AI_MODEL`     | No       | Reserved.                                                                                  |

Tokens are only ever read on the server (`src/lib/github/client.ts`, `src/lib/db/client.ts`).
Nothing is prefixed with `NEXT_PUBLIC_`, so no credential can reach the browser.
`GET /api/config` exposes only booleans — never values (see §11).

## 6. Search modes in detail

| Mode           | Input                       | What RepoLens does                                                                                                            |
| -------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `repository`   | Raw query text              | Passed to `GET /search/repositories` verbatim, so `topic:machine-learning language:Python stars:>100` works exactly as on GitHub. |
| `find-repo`    | Description of a repository | Extracts technologies, topics, signals and keywords; builds a real query; shows the "how this was interpreted" panel.             |
| `project-idea` | Description of an idea      | Same extraction, capped at four keywords, plus deterministic follow-up suggestions you can run with one click.                    |

Switching modes changes the placeholder, the helper text, the request the UI sends and the
panels that render — while keeping the same visual language.

**Intent extraction is deterministic** (no network, no AI):
`src/lib/query/intent.ts` removes GitHub qualifiers you typed (preserving their casing), matches
technology aliases longest-first, matches category phrases as whole words (so `ar` never matches
inside `library`), flags signals such as *lightweight*, *self-hosted*, *actively maintained* or
*beginner friendly*, and drops stopwords. The `ignored` list is returned so the UI can show what
was deliberately discarded.

**Query construction** (`src/lib/query/build.ts`) records an audit trail for every qualifier with
its `source`: `user`, `inferred` or `filter`. The query is capped at GitHub's 256-character limit;
when something had to be dropped, the dropped terms are reported in `warnings`.

**Automatic relaxation.** Discovery modes AND several inferred qualifiers together, which GitHub
often matches too strictly. If a discovery query returns zero results, the route retries with up
to two broader variants (first without inferred topics, then without inferred topics *and*
language) and — only if one of them finds something — returns those results with `relaxed` set and
a warning naming the dropped qualifiers. User-typed qualifiers and structured filters are never
relaxed. If nothing matches at all, the precise query is kept and the empty state is shown.

## 7. Relevance scoring — how it works and why it is honest

GitHub does not return a relevance score. RepoLens therefore computes a **local, deterministic**
0–100 score and labels it as such everywhere it appears (the column tooltip states this in words).

| Signal           | Weight | Notes                                                              |
| ---------------- | ------ | ------------------------------------------------------------------ |
| Name match       | 0.35   | Exact name/owner match scores 1, otherwise token overlap.          |
| Description      | 0.30   | Share of query terms present in the description.                   |
| Topics           | 0.20   | Only when topics were requested.                                   |
| Language         | 0.10   | Only when a language was requested or detected.                    |
| Popularity       | 0.05   | `log10(stars) / 5`, capped — deliberately a small factor.          |

Only the signals that apply are averaged (so a search without a language filter is not penalised).
Bands: `exact` ≥ 90, `strong` ≥ 70, `good` ≥ 45, `partial` ≥ 20, otherwise `weak`. These thresholds
are calibrated to what the formula can actually produce — an exact name match alone scores ~57,
so it is shown as `good`, never as a fabricated 100%.

GitHub's own ordering is preserved alongside the score as `githubRank`
(`(page − 1) × perPage + index + 1`), and the tooltip shows it.

## 8. GitHub API usage

| Purpose             | Endpoint                                                    |
| ------------------- | ----------------------------------------------------------- |
| Repository search   | `GET /search/repositories`                                   |
| Developer search    | `GET /search/users` (+ optional `GET /users/{login}` enrich) |
| Code search         | `GET /search/code` (authenticated only)                      |
| Repository details  | `GET /repos/{owner}/{repo}`                                  |
| README              | `GET /repos/{owner}/{repo}/readme`                           |
| Languages           | `GET /repos/{owner}/{repo}/languages`                        |
| Contributors        | `GET /repos/{owner}/{repo}/contributors`                     |
| Commits             | `GET /repos/{owner}/{repo}/commits`                          |
| File tree           | `GET /repos/{owner}/{repo}/contents`                         |
| Community profile   | `GET /repos/{owner}/{repo}/community/profile`                |
| Latest release      | `GET /repos/{owner}/{repo}/releases/latest`                  |
| Rate limits         | `GET /rate_limit`                                            |

Client behaviour (`src/lib/github/client.ts`):

- Requests are **de-duplicated** while in flight and served from a short in-memory cache when the
  caller opts in (`cacheSeconds`), which keeps `/discover` (three live lists) cheap.
- Every request has a **timeout** (aborted via `AbortSignal`) and respects the caller's signal.
- Failures become typed `GithubApiError`s with a `kind`
  (`rate_limited | unauthorized | forbidden | not_found | validation | unavailable | timeout | network | unknown`),
  a human message, an optional hint and a reset time. Raw upstream payloads and stack traces never
  reach the client.
- The rate-limit bucket actually consumed (`core` vs `search`) is reported back with every response,
  so the UI can show real remaining quota.

## 9. Error handling

| Situation                        | Status | What the visitor sees                                                             |
| -------------------------------- | ------ | ---------------------------------------------------------------------------------- |
| Invalid parameters               | 400    | "That search could not be processed" + per-field issues                            |
| Bad or missing token             | 401    | Explains that the token is rejected, never echoes it                               |
| Forbidden / secondary limit      | 403    | Explains the restriction and when to retry                                         |
| Unknown repository               | 404    | "Repository not found" with a way back to search                                   |
| Malformed query (`stars:>abc`)   | 422    | GitHub's validation message plus a hint about qualifier syntax                     |
| Rate limit / secondary limit     | 429    | Reset time + `Retry-After`, plus a suggestion to set `GITHUB_TOKEN`                |
| Timeout                          | 504    | "GitHub took too long to respond"                                                  |
| Network failure / GitHub 5xx     | 502/503| "Could not reach GitHub's API" — no internal detail leaked                         |
| Empty results                    | 200    | Empty state with a "Clear filters" action                                          |
| Persistence not configured       | 503    | Names `DATABASE_URL` and states that data stays in the browser                     |

## 10. Repository analysis — what it does and what it does not claim

`src/lib/analyze/collect.ts` gathers evidence from six endpoints, and
`src/lib/analyze/analyze.ts` turns it into a report with exactly eight sections:

1. **Project overview** 2. **Technology stack** 3. **Maintenance indicators**
4. **Documentation availability** 5. **Repository structure** 6. **Potential strengths**
7. **Potential limitations** 8. **Recommended next steps**

Rules the analysis obeys:

- Every finding carries the endpoint it came from (`evidence`), e.g. `GET /repos (pushed_at)`.
- Every finding is typed `fact` (read straight from the API) or `interpretation` (a judgement
  RepoLens draws from those facts), and toned `positive | neutral | caution`.
- Missing data is listed in `unavailable` — it is never guessed.
- Toolchain detection comes from filenames (`package.json`, `Cargo.toml`, …) and is always
  labelled an **inference**.
- The report always carries this disclaimer: *"This analysis is generated from public GitHub
  metadata only … RepoLens has not cloned, executed, tested or security-scanned this code."*

## 11. Persistence and privacy

- With `DATABASE_URL`: saved repositories, collections, search history and preferences live in
  PostgreSQL (Drizzle schema in `src/lib/db/schema.ts`, migration in `drizzle/0000_init.sql`,
  runner `npm run db:migrate`).
- Without it: the same features work in `localStorage` under `repolens:*` keys, and the UI shows a
  persistent notice that the data is **stored in this browser only and is not synced across devices**.
  No fake "saved to your account" message is ever shown.
- Identity is an anonymous, `httpOnly`, `sameSite=lax` cookie (`repolens_session`) created by
  `POST /api/session`. No account, no email, no third-party login.
- **Ownership is enforced on every private route**: each handler checks
  `isDatabaseConfigured()` → `currentUserId()`, and every query is scoped to that user id.
  Without a database you get 503, without a session 401 — never another visitor's data.
- Credentials stay server-side. `GET /api/config` returns only booleans
  (`github.authenticated`, `database`, `ai`, `codeSearch`) and is unit-tested to contain no
  token, connection string or header.

## 12. API reference

All responses are JSON. Errors always use `{ error: { kind, message, hint, status, retryAfterSeconds, resetAt, issues? } }`.

| Method | Path                                              | Purpose                                            |
| ------ | ------------------------------------------------- | -------------------------------------------------- |
| GET    | `/api/search/repositories`                        | All three search modes (`mode=repository\|find-repo\|project-idea`) |
| GET    | `/api/search/developers`                          | GitHub user search with optional profile enrichment |
| GET    | `/api/search/code`                                | Code search (requires `GITHUB_TOKEN`)               |
| GET    | `/api/repositories/[owner]/[repo]`                | Repository details                                  |
| GET    | `/api/repositories/[owner]/[repo]/readme`         | README (sanitized client-side, truncated flag)      |
| GET    | `/api/repositories/[owner]/[repo]/languages`      | Byte counts + percentages                           |
| GET    | `/api/repositories/[owner]/[repo]/contributors`   | Contributors                                        |
| GET    | `/api/repositories/[owner]/[repo]/commits`        | Recent commits                                      |
| GET    | `/api/repositories/[owner]/[repo]/contents`       | Directory listing / file tree                       |
| GET    | `/api/repositories/[owner]/[repo]/analyze`        | Eight-section evidence-based analysis               |
| GET    | `/api/rate-limit`                                 | Live GitHub `core` and `search` buckets             |
| GET    | `/api/config`                                     | Booleans describing configured optional features    |
| POST   | `/api/session`                                    | Create the anonymous session cookie                 |
| GET/POST | `/api/saved`, PATCH/DELETE `/api/saved/[id]`     | Saved repositories                                  |
| GET/POST | `/api/collections`, `/api/collections/[id]`, `/api/collections/[id]/repositories` | Collections      |
| GET/POST/DELETE | `/api/history`                             | Search history                                      |
| GET/PUT | `/api/preferences`                                | Default mode, sort, page size, theme                |

## 13. Design system

Dark, dense and calm — no glassmorphism, no oversized cards, no bright purple washes, no
illustrations and no decorative animation. Colour tokens, the type scale and radii are defined once
in `src/app/globals.css` (Tailwind v4 `@theme`) and used everywhere through the primitives in
`src/components/ui/`. Type is Inter when available, falling back to a modern system stack
(`next/font/google` cannot reach Google Fonts in restricted networks, so the font is requested via
CSS rather than bundled).

Layout constants that match the specification: hero heading
**"Find Your Next Project"**, description **"Enter a concept to discover and analyze relevant
open-source projects."**, both centred; a 720px search bar with a 52px input and an integrated
Search button; per-mode helper text; a right-aligned sort control; and a wide results table.

Results table (desktop): **Repository · Language · Stars · Relevance · Actions**, where Actions are
compact labelled buttons — Details, Visualize, Analyze, GitHub (new tab) — plus a save toggle.
Below `md` the same data renders as cards with a single Actions menu, so nothing scrolls sideways.

## 14. Testing

```bash
npm test          # vitest run
npm run test:watch
```

Current suite: **183 tests across 16 files**, all passing. Coverage focuses on behaviour that is
easy to fake and hard to notice when it breaks:

- **Query layer** — intent extraction (whole-word phrase matching, stopwords, qualifier
  passthrough, signals), query building (qualifier audit trail, 256-character cap, discovery
  fallbacks), relevance scoring and band thresholds.
- **GitHub client** — error mapping for 401/403/404/422/429/5xx, timeout via `AbortSignal`,
  in-flight de-duplication, and a test asserting the token can never be serialised into a payload.
- **Route handlers** — search sorting/paging/`githubRank`/`beyondWindow`, discovery relaxation,
  validation errors, and the private-data contract (503 without `DATABASE_URL`, 401 without a
  session, user-scoped reads with one).
- **Analysis** — all eight sections, fact vs interpretation typing, missing-data reporting,
  archived/no-license/stale detection, and that the report never claims code was executed.
- **UI** — mode switching changes placeholder/helper/API mode, results table links and formats,
  README sanitisation (no `<script>`, no `onerror`, no `javascript:` URLs), and the browser-local
  storage fallback.

Tests run against mocked `fetch`, so they exercise the real code paths (routes, mappers,
components) without spending GitHub quota.

## 15. Deployment

RepoLens is a standard Next.js app and deploys to Vercel with no extra infrastructure:

```bash
npm run build && npm start
```

Add `GITHUB_TOKEN` (and optionally `DATABASE_URL`) in the project's environment variables. When you
add a database, run `npm run db:migrate` once to apply `drizzle/0000_init.sql`. The app also runs on
any Node host or Docker container; `npm run dev` and `npm start` bind to `0.0.0.0:3000`.

Notes for restricted networks: server-side `fetch` needs the platform's CA bundle (on Node set
`NODE_EXTRA_CA_CERTS`), and GitHub avatar images are loaded with `images.unoptimized` +
plain `<img>` so no external image optimizer is required.

## 16. Roadmap and limitations

Known limitations, stated plainly:

- GitHub caps search pagination at 1,000 results; the UI says so (`beyondWindow`) instead of
  pretending there are more pages.
- The relevance score is a local heuristic. It is useful for ordering and triage, not a measure of
  project quality.
- Repository analysis reads metadata only. It cannot judge code quality, security or test coverage,
  and it does not try to.
- GitHub's legacy code search returns 0 results for many valid-looking queries and requires a token;
  RepoLens surfaces GitHub's own response and never substitutes repository results for code results.
- Browser-local saves are per-device and are lost when site data is cleared — hence the notice.

Possible next steps: saved search subscriptions, contributor-level analysis, comparison of two
repositories, and an optional AI-assisted summary that is clearly labelled as AI output.

## License

MIT — see the repository for details.
