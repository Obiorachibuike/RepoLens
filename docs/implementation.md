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
