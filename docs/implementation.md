# Implementation notes

## Baseline audit

- Next.js App Router serves UI and REST handlers; React/Tailwind and the existing primitives support both themes. Search, Discover, developer/code search, project ideas, repository detail, visualizations, and the eight-section metadata report already work.
- `src/lib/github/client.ts` owns outbound GitHub REST requests. The old cache was process-local, opt-in and lacked validators; the rate-limit page reported headers but didn't coordinate request admission.
- The persistent workspace uses `pg`, Drizzle, and additive SQL applied by `scripts/migrate.mjs`. Anonymous cookie sessions scope rows to a user; there is no GitHub OAuth. Saved repositories, collections, preferences, and search history fall back to browser storage. Keep those contracts intact.
- No AI provider was wired up; existing project idea mode is deterministic. No historical dataset, job runner, or cron configuration existed. The linked Vercel project uses Hobby (daily cron).
- Vitest baseline: 183 passing tests. The build uses local system fonts when restricted networking prevents external font loading.

## Delivery plan

1. Keep one GitHub HTTP boundary; add public-data checks, bounded Redis/memory caching, conditional validation, deduplication, backpressure and private diagnostics.
2. Add PostgreSQL-only tracking, snapshot and job state with bounded admission and resumable cron batches. Trending is an indexed read model, not a live search. Don't seed fake history.
3. Extend the existing analysis with scored evidence, bounded source retrieval, static reviews, dependencies and a source map. Layer owner-scoped chat on authorized public evidence.
4. Use the tracked pool and the existing workspace for dashboard, comparison, contribution discovery, recommendations and Watchtower. Build and test migrations and queries against PostgreSQL semantics, then verify deploy configuration without changing production.

## Verification notes for review

- The PostgreSQL read paths are covered by PGlite fixtures. The snapshot collector and every migration were also exercised against a disposable PostgreSQL server with GitHub metadata fetched live. An empty history correctly has no Growth rows even when Most Starred has results. The sample observations are not bundled with the application or deployed to production.
- Browser checks used desktop and mobile Chromium: default Trending filters and custom dates, keyboard repository lookup, mobile navigation, light theme persistence, Watchtower preference persistence, architecture file links/zoom, comparison, and the visible provider-not-configured state. Provider and advisory behavior is tested with controlled HTTP responses; paid inference and hosted Redis require configured credentials.
- A production rollout needs operator-managed PostgreSQL migrations, a public-only PAT, and the cron secret before activating collection. Optional Redis and AI keys can be added to their target environments. Existing records and user preferences are not reset.
