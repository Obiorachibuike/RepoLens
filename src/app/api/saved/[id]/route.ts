import { z } from "zod";
import { fromError, ok, persistenceUnavailable, sessionRequired } from "@/lib/api/respond";
import { isDatabaseConfigured } from "@/lib/db/client";
import { deleteSaved, updateSaved } from "@/lib/db/queries";
import { currentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  note: z.string().max(2000).nullable().optional(),
  collectionId: z.string().uuid().nullable().optional(),
});

/** PATCH /api/saved/{id} — update note or collection (ownership enforced). */
export async function PATCH(request: Request, context: Context) {
  try {
    if (!isDatabaseConfigured()) return persistenceUnavailable("saved-repositories", "Saved repositories are");
    const userId = await currentUserId();
    if (!userId) return sessionRequired();

    const { id } = await context.params;
    const parsed = patchSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return Response.json({ error: { kind: "validation", message: "Invalid update." } }, { status: 400 });
    }

    const row = await updateSaved(userId, id, parsed.data);
    if (!row) return Response.json({ error: { kind: "not_found", message: "Saved repository not found." } }, { status: 404 });
    return ok({ item: row });
  } catch (error) {
    return fromError(error);
  }
}

/** DELETE /api/saved/{id} */
export async function DELETE(_request: Request, context: Context) {
  try {
    if (!isDatabaseConfigured()) return persistenceUnavailable("saved-repositories", "Saved repositories are");
    const userId = await currentUserId();
    if (!userId) return sessionRequired();

    const { id } = await context.params;
    const deleted = await deleteSaved(userId, id);
    if (!deleted) return Response.json({ error: { kind: "not_found", message: "Saved repository not found." } }, { status: 404 });
    return ok({ deleted: true });
  } catch (error) {
    return fromError(error);
  }
}
