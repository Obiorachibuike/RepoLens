# RepoLens

**Understand Any Codebase. Discover What’s Possible.**

RepoLens is a GitHub repository intelligence workspace. Search public GitHub repositories, explore their structure, compare maintenance signals, and follow changes over time. RepoLens distinguishes observations from heuristics and does not fill missing history, source evidence, or advisory coverage with invented data.

## Start here

Use Node.js 22.12+ (or Node.js 24 LTS) and npm. Use managed PostgreSQL and Upstash Redis for deployment. RepoLens itself does not need a separate worker or cache server.

```sh
npm ci
cp .env.example .env.local
# If using PostgreSQL, set DATABASE_URL in .env.local, then:
npm run db:migrate
npm run dev
```

Open `http://localhost:3000`. `npm run dev` and `npm start` bind to `0.0.0.0:3000`. The unauthenticated app can search public repositories and inspect metadata. Code search requires a GitHub PAT. Without PostgreSQL, saves, collections, search history, and local preferences remain in this browser; Trending, Watchtower, server-side report history, and chat need PostgreSQL. Without an AI provider, deterministic search and reports still work, and existing chat history remains readable.

## Workspace

| Area | What you can do |
| --- | --- |
| **Overview** `/` | Press `/` to focus search, open an `owner/repo` or GitHub URL, see recent health reports, saves, recommendations, and measured growth coverage. |
| **Discover** | `/search/repositories` supports Repository, Find Repo, and Project Idea modes. `/discover` has live search lists, `/trending` measured growth, `/contributions` real open issues, and `/recommendations` filters and workspace preferences. `/search/developers` and `/search/code` retain their own search. |
| **Analyze** `/analyze` | Jump to a repository's Details, Visualize, Analyze, Intelligence or Chat pages. `/compare` compares two or three distinct public repositories. Repository routes stay under `/repository/[owner]/[repo]`. |
| **Workspace** | `/saved`, `/collections`, `/history`, `/analysis-history` and `/watchlist` expose this browser's workspace. Watchtower alerts are in-app, not email or webhooks. |
| **Account** | `/settings` manages search and theme preferences. `/usage` shows your workspace's recorded provider attempts, tokens, and available cost estimates. `/diagnostics` is for operators with a separate credential. |

Existing search URLs with `q`, `mode`, and filter parameters still work, including on `/`. **Repository** sends GitHub qualifiers with a public-only boundary. **Find Repo** extracts keywords and technologies without AI. **Project Idea** uses the same deterministic extractor and offers follow-up searches. If a discovery query is too strict, it can remove only inferred qualifiers, reports what changed, and never relaxes user filters. GitHub search has a 1,000-result paging window. The optional local relevance score is an ordering aid, not project quality: applicable weights are name 35%, description 30%, topics 20%, language 10%, and logarithmic star popularity 5%.

Recommendations use explicit skill, language, technology and category filters. If no language is selected, RepoLens can use languages in recent saves and analyzed tracked repositories. Live suggestions use real GitHub topic, activity and issue filters; fast-growing suggestions need measured growth. Contribution Finder shows GitHub labels and assignment data. Difficulty suggestions are interpretations of labels, not verification that an issue is easy or still available.

## How the data flows

- **Next.js 15 App Router, React 19 and Tailwind CSS 4** serve the workspace and Route Handlers. Zod validates repository identifiers and request inputs. Server-only modules use `pg`/Drizzle and the shared GitHub REST client; the browser sends requests to relative app URLs.
- **`src/lib/github/client.ts`** owns outbound GitHub read requests. It fixes the API host/version, restricts rename redirects, checks repository visibility before authenticated subresource access, and isolates representations by normalized query, resource, API version, media type, and credential fingerprint. Fresh cache hits avoid calls; expired eligible entries run conditional revalidation (`ETag` and `Last-Modified`). GitHub `304` reuses the prior body and records the validation time. Transient failures can return the last known good response; missing/forbidden resources invalidate it. Forced collector reads do not substitute stale values.
- **Upstash REST** optionally shares bounded caches, leases, rate budgets and GitHub pacing across instances. Locks use expiring owner IDs and atomic compare-and-delete. The client coordinates core, search and code search separately and honors GitHub primary/secondary limit signals and `Retry-After`; it does not rotate credentials or aggressively retry. Discovery, analysis, snapshot and AI traffic have additional budgets. Without Redis, local caches and conservative process limits keep the app usable; they are not a cross-instance limiter. PostgreSQL still protects collector ownership and the daily AI attempt caps.
- **PostgreSQL** owns user records and permanent observations. `src/lib/trending/` admits repositories, saves validated metadata and snapshots, and uses indexed nearest-prior lookups to rank them. Watchtower derives change records from those observations. Redis failure does not delete history.
- **`src/lib/intelligence/`** reads GitHub text blobs from the default-branch commit and tree. It caps the tree at 12,000 entries and skips generated/vendor directories, symlinks, submodules, binary data, and unreadable files. No repositories are cloned or executed. Source links use the full commit SHA. The metadata analysis and visualizations are still available separately.
- **`src/lib/ai/`** handles redacted excerpts, provider adapters, stream parsing, citation validation and private conversation persistence. It does not run tools on the user's behalf. The only external API origins used for report enrichment/chat are GitHub, the npm registry, OSV, and the configured OpenAI or Anthropic adapter; there are no user-supplied provider URLs.

### Anonymous sessions and private data

`POST /api/session` issues an opaque, random `httpOnly`, `SameSite=Lax` cookie. HTTPS responses use a `Secure` cookie. This is a **browser workspace**, not a GitHub sign-in or cross-device account. Clearing site data can lose access to that workspace. Saves, collections, analysis history, preferences, watchlists, chat, and personal usage are scoped to the persisted session. Private responses are not CDN-cached. Never grant the application PAT private repository access or type credentials into searches or chat. Source redaction is a best-effort safeguard, not proof a public repository contains no secrets.

### Trending and Watchtower

`GET /api/trending` defaults to `period=7d&ranking=growth&language=all&page=1&limit=20`. Results exclude archived repositories. Periods are **24 hours** (`today` or `24h`), `3d`, `7d`, `14d`, `30d`, and **365 days** (`1y` or `365d`), all rolling UTC windows. Choosing `custom` starts with **2026-10-01 through 2026-11-18**, inclusive UTC; send `startDate` and `endDate` as `YYYY-MM-DD`. Current-day ranges end at the current time. Reversed, future, invalid, and more-than-366-day ranges are rejected. The language list comes from the tracked pool and `all` includes unreported languages.

For each boundary, the app uses the closest preceding observation within `SNAPSHOT_TOLERANCE_HOURS` (36 hours by default). Growth is `endingStars − startingStars` and requires distinct observations at both boundaries. `growth` ranks positive growth by stars gained and `percentage` ranks positive growth by `growth / startingStars × 100`; a zero start has no percentage. `stars` sorts by the latest recorded GitHub total, independently of growth coverage. Summaries are for the active filters, not just the current page. The API exposes actual observation timestamps, missing coverage, result count, and last collector status. It does **not** backfill October 2026 or infer past counts from current stars. On a clean install there is no growth ranking until the needed boundaries have been observed; longer windows can take months to populate.

Tracking is bounded. Collector discovery, repository searches, detail views and verified saves can admit candidates; logged-in browser sessions (anonymous cookies) can explicitly request tracking or add a watch. Passive admission reserves capacity for saves and explicit tracking. A full pool rejects new admissions rather than erasing observations. Watchtower caps a workspace at 20 entries. Stars, open items (issues and PRs), and archive status are measured with each successful snapshot. Detailed checks rotate through up to eight watched repositories per run for releases, default-branch commit, contributor samples and root manifest changes. Advisory changes use a fresh dependency report for the same revision when available; the collector does not run a full advisory scan. A first or unavailable measurement is not a change. The view derives up to eight recent events from the latest 24 observations per repository and keeps the user's read marker and category preferences in PostgreSQL.

### Intelligence, comparison, and chat

| Report | Evidence and limits |
| --- | --- |
| **Health** | A 0–100 heuristic with default weights: maintenance 20; documentation, testing, organization, dependencies 15 each; community and releases 10 each. The score normalizes measured weights only. Coverage is measured weight divided by configured weight. Unknown categories remain visible and do not count as zero. |
| **Architecture** | An explorable, zoomable map of evidenced path groups, with commit-pinned file links and SVG export. It does not assert a runtime call graph or inferred request paths. |
| **Security and code quality** | Sample up to 12 eligible text files per review. Findings show location, confidence and suggested remediation, not exploitability. Credential-like evidence is redacted. The absence of findings does not establish safety. |
| **Dependencies and SBOM** | Parse up to 10 supported manifests/lockfiles and retain up to 400 entries across npm, PyPI, Cargo, Go, Composer, RubyGems and Maven. Unknown versions, licenses and relationships stay unknown. Exact versions can be checked in a bounded OSV batch; up to six direct npm dependencies with stable versions can be compared to npm's latest tag. Export CycloneDX 1.5 for the inspected inventory, not a complete attestation. |
| **Compare** | Compare reported counts and clearly labeled samples. Reuses a recent full health report when available; a partial fallback leaves missing categories unavailable. |
| **AI chat** | Up to six redacted, line-numbered excerpts (14,000 characters), 1,800 user-question characters and six bounded prior turns. Chats and citations are stored per workspace/repository. Start, reopen, copy, or delete a conversation. The configured provider receives the question, recent turns and public source excerpts. |

The backend consumes provider SSE by default where configured and sends NDJSON progress to the browser. It **buffers raw model output** until JSON structure, citation IDs, redaction and bounds checks succeed; no unchecked token or fabricated file link is displayed. A verified citation locates an excerpt, but does not guarantee that every claim is correct. A failed or invalid primary response can try one configured fallback. No provider call is made when there isn't readable evidence. Up to 15 minutes of exact, validated repeats can reuse an owned assistant message in PostgreSQL (context, model, prompt version and revision must match); no private prompts or answers are cached in Redis. Cache expiry does not delete chat history; deleting a conversation removes its associated reuse entries.

## Environment variables

Use `.env.local` or set server-only variables in the deployment environment. Do not use `NEXT_PUBLIC_` for credentials, commit filled-in environment files, or put bearer secrets in URLs. `.env.example` contains blank values and defaults in comments.

| Variable | Purpose / default |
| --- | --- |
| `GITHUB_TOKEN` | One PAT with public read access only, e.g. a classic token with **no `repo` scope**. A supported fine-grained PAT should be limited to public repositories with no write permissions (check code search endpoint support). No organization, workflow, packages, or admin access is needed. GitHub normally allows 60 core requests/hour anonymously, 5,000/hour for a PAT, 10/30 search requests/minute respectively, and a separate authenticated code search bucket. RepoLens uses lower ceilings. |
| `GITHUB_PERSONAL_ACCESS_TOKEN` | Optional legacy name, used only if `GITHUB_TOKEN` is empty. Do not configure a second active credential. |
| `DATABASE_URL`, `PG_POOL_MAX` | PostgreSQL connection string (use TLS as required by your provider) and per-instance connection cap (4 by default). Managed pooled URLs are recommended for app traffic; use a direct/session-mode connection when applying migrations. |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | In Upstash, create/select a Redis database and copy its **HTTPS REST URL and REST token**, not a `redis://` TCP URL. Both are optional. Use different Redis and database resources for production and preview unless intentionally sharing them. |
| `CRON_SECRET`, `DIAGNOSTICS_SECRET` | Independent server-only operator credentials. Use at least 32 cryptographically random characters (minimum accepted: 16). Without a valid value the corresponding endpoint denies all requests. |
| `TRACKED_POOL_LIMIT`, `SNAPSHOT_INTERVAL_HOURS`, `SNAPSHOT_TOLERANCE_HOURS` | Defaults: 40 eligible repositories, 20 hours before a repository is due again, 36-hour prior-observation tolerance. Cadence is eligibility, not a scheduler. |
| `SNAPSHOT_BATCH_SIZE`, `SNAPSHOT_CONCURRENCY` | Defaults: 40 due repositories per invocation and 3 concurrent observations. The job may defer work to stay within the runtime deadline and rate limits. |
| `AI_PROVIDER`, `AI_MODEL` | `openai` or `anthropic`; use a model that accepts the adapter's request format. Defaults: `gpt-4.1-mini` (Chat Completions, JSON mode), `claude-haiku-4-5` (Messages). If provider is unset, an OpenAI key (or generic key) selects OpenAI, otherwise Anthropic if its key is set. |
| `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `AI_API_KEY` | Provider-specific keys take precedence. `AI_API_KEY` is accepted for the primary only. |
| `AI_FALLBACK_PROVIDER`, `AI_FALLBACK_MODEL` | Optional different provider using its own key; model uses that provider's default when unset. |
| `AI_TIMEOUT_MS`, `AI_MAX_OUTPUT_TOKENS`, `AI_STREAM_UPSTREAM`, `AI_ANSWER_CACHE_TTL` | Per-provider timeout 12,000 ms, 950 output tokens, streaming on (`off` requests JSON instead), cache reuse TTL 900 seconds (`0` disables reuse). |
| `AI_DAILY_GLOBAL_ATTEMPTS`, `AI_DAILY_SESSION_ATTEMPTS` | Durable UTC-day ceilings: 160 provider attempts across the instance's database, 24 per workspace. Fallback attempts consume reservations too. |
| `{OPENAI,ANTHROPIC}_{INPUT,OUTPUT}_USD_PER_MTOK` | Optional model prices in USD per million tokens. Unset prices or unreported token counts mean cost is unknown, not zero. Estimates are not billing totals. For custom and fallback models, configure prices to match the selected provider/model. |
| `REPOLENS_OVERVIEW_PROJECTS` | Set to `off` to skip the overview's optional recommendation lookup. |

Other tunables are annotated in `.env.example`: resource TTLs (`GITHUB_*_TTL`, seconds), provider/report/advisory limits, category weights (`REPOLENS_HEALTH_*_WEIGHT`), and per-workflow route budgets (`REPOLENS_*_LIMIT`). Values outside the supported range fall back to defaults. TTL changes do not change the historical data retention policy.

## Migrations and deployment

RepoLens is a single Next.js application, suitable for Vercel or a Node host. `npm run db:migrate` applies ordered SQL in `drizzle/` under a PostgreSQL advisory lock and records it in `_repolens_migrations`. It is safe to run again. `0000` is the existing workspace; `0001` adds tracking, snapshots, jobs and watches; `0002` adds analysis history, private chat and usage; `0003` adds indexed chat reuse and rotates Watchtower probes. Back up existing data and **apply migrations to the intended database before serving upgraded traffic**. Do not reset the schema or run migrations at app startup, from a request, or with every parallel Vercel build. The checked-in SQL sequence is the migration runner's source of truth.

1. Point the Vercel project at the repository, use Next.js and a supported Node.js version, and set the necessary environment variables for the appropriate environment. Migrate the corresponding PostgreSQL database first. Use a separate Preview database for branch smoke tests.
2. Deploy a preview from the branch under review. Confirm the build succeeded and check `/api/config` (only configuration booleans), `/trending`, an intelligence view, and an authorized diagnostics request. Confirm Redis availability and PostgreSQL connectivity with diagnostics, not the presence of an environment variable alone. Leave `ARENA_PREVIEW` unset outside the isolated browser sandbox so normal anti-framing headers stay enabled.
3. The checked-in `vercel.json` schedules **03:00 UTC daily** on Vercel production (`GET /api/cron/trending-snapshots`, `Authorization: Bearer <CRON_SECRET>`). This frequency works on Hobby; invocation time can drift and previews do not receive production cron events. For a manual or external scheduled run, send `POST` with the same header. To collect more often or process large pools, use a plan or external scheduler that supports the desired interval. Do not run a resident worker or bypass GitHub limits. Wait for the next configured run or retry via the scheduler after a pause; unprocessed rows stay due. Never use an external service that requires putting the secret in the URL.

From an authorized operator shell with the appropriate variables already set:

```sh
curl --fail-with-body -X POST -H "Authorization: Bearer ${CRON_SECRET}" \
  "${REPOLENS_URL}/api/cron/trending-snapshots"
curl --fail-with-body -H "Authorization: Bearer ${DIAGNOSTICS_SECRET}" \
  "${REPOLENS_URL}/api/admin/diagnostics"
```

The job records rows processed, failures and deferred counts, and uses expiring Redis/local and PostgreSQL leases. HTTP `202` means another worker is running, `429` means collection paused on a limit, and `503` indicates missing prerequisites or job failure. Successful invocations can be partial. GitHub cache/limit counters and Redis operations in diagnostics describe the responding process; collection runs and usage aggregates come from PostgreSQL. Diagnostics never return credentials, connection strings, prompts, or raw upstream errors.

## Verification and API entry points

```sh
npm run typecheck
npm run lint
npm run test
npm run build
```

Tests exercise legacy search/README handling and the new workflows. PGlite runs the production snapshot query and SQL migrations in-process; it tests coverage, pagination, deduplication, ownership, cache expiry, watch preferences and protected routes. Outbound HTTP is mocked for GitHub client and AI transport tests (including `304`, cooldowns, Redis fallback, known-secret redaction, source pinning, model fallback and citation rejection). No live tokens are needed to run the suite.

- `/api/trending`, `/api/contributions`, `/api/recommendations`, `/api/compare` are GET routes. Compare accepts repeated `repo=owner/name` parameters.
- `/api/repositories/[owner]/[repo]/intelligence?view=health|architecture|security|dependencies|quality` reads a report. `view=dependencies&format=cyclonedx` downloads the SBOM. The existing detail, analyze, readme, languages, contents, contributors, and commits APIs remain available.
- `/api/repositories/[owner]/[repo]/chat` supports GET/POST/DELETE with an owned conversation ID. The app negotiates NDJSON via `Accept: application/x-ndjson`; default API replies are JSON. `/api/usage` is scoped to the current session.
- `/api/watchlist` supports GET/POST/PATCH/DELETE. `/api/tracking` POST admits a public repository on request. `/api/session`, `/api/saved`, `/api/collections`, `/api/history` and `/api/preferences` preserve workspace storage and behavior; recommendation settings extend the existing preference document.

### Troubleshooting

| Symptom | Check |
| --- | --- |
| Trending has no growth or a sparse language filter | Switch to Most Starred for current totals. Check recorded boundaries, elapsed time, cadence, and tolerance before changing the pool. There is no legitimate way to fill gaps with today's counts. |
| Snapshot job not running or missing data | Check production Cron settings, separate `CRON_SECRET`, the public-read PAT, PostgreSQL migrations, job run status and any deployment protection. Increasing batch size alone won't raise available GitHub quota. |
| Settings says services are configured but a feature fails | `/api/config` reports only presence. Check `/api/admin/diagnostics` for DB/Redis connectivity, recent collector states and usage. Missing/expired GitHub credentials cause `401`, and rate limiting surfaces retry timing. |
| Reports lack exact versions/advisories | Lockfiles or parts of the tree may exceed sampling limits. OSV/npm registry access is separate from GitHub; unavailable advisory responses are not clean scans. Allow outbound HTTPS to `api.osv.dev` and `registry.npmjs.org` for these checks. |
| Chat has no answer or numbers in usage are absent | Validate provider key/model and limits, then check PostgreSQL migrations and daily caps. Exact repeats can be reused without a new provider attempt. Some failures have no reported usage. Use a narrower codebase question instead of relying on model inference. |
| Build or local GitHub TLS failures behind a proxy | Use the platform's trusted CA via `NODE_EXTRA_CA_CERTS`; do not disable certificate verification. If using a protected branch preview behind an iframe proxy, set `ARENA_PREVIEW=1` only in that sandbox. |

The baseline audit and implementation plan are in [docs/implementation.md](docs/implementation.md).
