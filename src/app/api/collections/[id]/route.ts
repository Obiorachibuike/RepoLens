import { z } from "zod";
import { fromError, ok, persistenceUnavailable, sessionRequired } from "@/lib/api/respond";
import { isDatabaseConfigured } from "@/lib/db/client";
import { deleteCollection, listCollectionRepositories, updateCollection } from "@/lib/db/queries";
import { currentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  description: z.string().trim().max(280).nullable().optional(),
});

/** GET /api/collections/{id} — the repositories inside one collection. */
export async function GET(_request: Request, context: Context) {
  try {
    if (!isDatabaseConfigured()) return persistenceUnavailable("collections", "Collections are");
    const userId = await currentUserId();
    if (!userId) return sessionRequired();
    const { id } = await context.params;
    const items = await listCollectionRepositories(userId, id);
    if (!items) return Response.json({ error: { kind: "not_found", message: "Collection not found." } }, { status: 404 });
    return ok({ items });
  } catch (error) {
    return fromError(error);
  }
}

/** PATCH /api/collections/{id} — rename or re-describe (ownership enforced). */
export async function PATCH(request: Request, context: Context) {
  try {
    if (!isDatabaseConfigured()) return persistenceUnavailable("collections", "Collections are");
    const userId = await currentUserId();
    if (!userId) return sessionRequired();
    const { id } = await context.params;
    const parsed = patchSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return Response.json({ error: { kind: "validation", message: "Invalid update." } }, { status: 400 });
    }
    const row = await updateCollection(userId, id, parsed.data);
    if (!row) return Response.json({ error: { kind: "not_found", message: "Collection not found." } }, { status: 404 });
    return ok({ item: row });
  } catch (error) {
    return fromError(error);
  }
}

/** DELETE /api/collections/{id} */
export async function DELETE(_request: Request, context: Context) {
  try {
    if (!isDatabaseConfigured()) return persistenceUnavailable("collections", "Collections are");
    const userId = await currentUserId();
    if (!userId) return sessionRequired();
    const { id } = await context.params;
    const deleted = await deleteCollection(userId, id);
    if (!deleted) return Response.json({ error: { kind: "not_found", message: "Collection not found." } }, { status: 404 });
    return ok({ deleted: true });
  } catch (error) {
    return fromError(error);
  }
}
