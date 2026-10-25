import { z } from "zod";
import { fromError, ok, persistenceUnavailable, sessionRequired } from "@/lib/api/respond";
import { isDatabaseConfigured } from "@/lib/db/client";
import { addHistory, clearHistory, listHistory } from "@/lib/db/queries";
import { currentUserId } from "@/lib/session";
import { SEARCH_MODES, SORT_OPTIONS } from "@/lib/validation/search";

export const dynamic = "force-dynamic";

const addSchema = z.object({
  query: z.string().trim().min(1).max(400),
  mode: z.enum(SEARCH_MODES),
  sort: z.enum(SORT_OPTIONS).default("best-match"),
  filters: z
    .object({
      language: z.string().nullish(),
      topics: z.array(z.string()).nullish(),
      minStars: z.number().nullish(),
      minForks: z.number().nullish(),
      pushedAfter: z.string().nullish(),
      license: z.string().nullish(),
      archived: z.string().nullish(),
    })
    .default({}),
  resultCount: z.number().int().min(0).nullish(),
});

/** GET /api/history */
export async function GET(request: Request) {
  try {
    if (!isDatabaseConfigured()) return persistenceUnavailable("history", "Search history is");
    const userId = await currentUserId();
    if (!userId) return sessionRequired();
    const limit = Math.min(100, Math.max(1, Number(new URL(request.url).searchParams.get("limit") ?? 30) || 30));
    return ok({ items: (await listHistory(userId, limit)) ?? [] });
  } catch (error) {
    return fromError(error);
  }
}

/** POST /api/history — record a search (used by client-side searches). */
export async function POST(request: Request) {
  try {
    if (!isDatabaseConfigured()) return persistenceUnavailable("history", "Search history is");
    const userId = await currentUserId();
    if (!userId) return sessionRequired();

    const parsed = addSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return Response.json({ error: { kind: "validation", message: "Invalid history entry." } }, { status: 400 });
    }
    const { query, mode, sort, filters, resultCount } = parsed.data;
    const row = await addHistory(userId, {
      query,
      mode,
      sort,
      filters: {
        language: filters.language ?? null,
        topics: filters.topics ?? [],
        minStars: filters.minStars ?? null,
        minForks: filters.minForks ?? null,
        pushedAfter: filters.pushedAfter ?? null,
        license: filters.license ?? null,
        archived: filters.archived ?? null,
      },
      resultCount: resultCount ?? null,
    });
    return ok({ item: row }, { status: 201 });
  } catch (error) {
    return fromError(error);
  }
}

/** DELETE /api/history — clear everything for this visitor. */
export async function DELETE() {
  try {
    if (!isDatabaseConfigured()) return persistenceUnavailable("history", "Search history is");
    const userId = await currentUserId();
    if (!userId) return sessionRequired();
    const cleared = await clearHistory(userId);
    return ok({ cleared });
  } catch (error) {
    return fromError(error);
  }
}
