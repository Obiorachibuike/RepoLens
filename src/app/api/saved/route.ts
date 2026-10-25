import { z } from "zod";
import { fromError, ok, persistenceUnavailable, sessionRequired } from "@/lib/api/respond";
import { isDatabaseConfigured } from "@/lib/db/client";
import { listSaved, saveRepository } from "@/lib/db/queries";
import { currentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

const saveSchema = z.object({
  owner: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(100),
  fullName: z.string().trim().min(3).max(220),
  url: z.string().url().max(500),
  description: z.string().max(2000).nullish(),
  language: z.string().max(60).nullish(),
  stars: z.number().int().min(0).max(100_000_000).nullish(),
  note: z.string().max(2000).nullish(),
  collectionId: z.string().uuid().nullish(),
});

/** GET /api/saved — the caller's saved repositories. */
export async function GET() {
  try {
    if (!isDatabaseConfigured()) return persistenceUnavailable("saved-repositories", "Saved repositories are");
    const userId = await currentUserId();
    if (!userId) return sessionRequired();
    const rows = await listSaved(userId);
    return ok({ items: rows ?? [], configured: true });
  } catch (error) {
    return fromError(error);
  }
}

/** POST /api/saved — save (or refresh) a repository for this visitor. */
export async function POST(request: Request) {
  try {
    if (!isDatabaseConfigured()) return persistenceUnavailable("saved-repositories", "Saved repositories are");
    const userId = await currentUserId();
    if (!userId) return sessionRequired();

    const body: unknown = await request.json().catch(() => null);
    const parsed = saveSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: { kind: "validation", message: "Invalid save request.", issues: parsed.error.issues.map((i) => i.message) } },
        { status: 400 },
      );
    }

    const row = await saveRepository(userId, parsed.data);
    if (!row) return persistenceUnavailable("saved-repositories", "Saved repositories are");
    return ok({ item: row }, { status: 201 });
  } catch (error) {
    return fromError(error);
  }
}
