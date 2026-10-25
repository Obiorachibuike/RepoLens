import { z } from "zod";
import { fromError, ok, persistenceUnavailable, sessionRequired } from "@/lib/api/respond";
import { isDatabaseConfigured } from "@/lib/db/client";
import { createCollection, listCollections } from "@/lib/db/queries";
import { currentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(60),
  description: z.string().trim().max(280).nullish(),
});

/** GET /api/collections */
export async function GET() {
  try {
    if (!isDatabaseConfigured()) return persistenceUnavailable("collections", "Collections are");
    const userId = await currentUserId();
    if (!userId) return sessionRequired();
    return ok({ items: (await listCollections(userId)) ?? [] });
  } catch (error) {
    return fromError(error);
  }
}

/** POST /api/collections */
export async function POST(request: Request) {
  try {
    if (!isDatabaseConfigured()) return persistenceUnavailable("collections", "Collections are");
    const userId = await currentUserId();
    if (!userId) return sessionRequired();

    const parsed = createSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return Response.json(
        { error: { kind: "validation", message: "Invalid collection.", issues: parsed.error.issues.map((i) => i.message) } },
        { status: 400 },
      );
    }
    const row = await createCollection(userId, parsed.data.name, parsed.data.description ?? null);
    if (!row) return persistenceUnavailable("collections", "Collections are");
    return ok({ item: row }, { status: 201 });
  } catch (error) {
    return fromError(error);
  }
}

