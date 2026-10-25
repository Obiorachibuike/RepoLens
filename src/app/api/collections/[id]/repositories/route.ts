import { z } from "zod";
import { fromError, ok, serviceUnavailable } from "@/lib/api/respond";
import { isDatabaseConfigured } from "@/lib/db/client";
import { addToCollection, removeFromCollection } from "@/lib/db/queries";
import { currentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

const bodySchema = z.object({ savedRepositoryId: z.string().uuid() });

/** POST /api/collections/{id}/repositories — add a saved repository. */
export async function POST(request: Request, context: Context) {
  try {
    if (!isDatabaseConfigured()) return serviceUnavailable("collections", "DATABASE_URL is not configured.");
    const userId = await currentUserId();
    if (!userId) return Response.json({ error: { kind: "unauthorized", message: "No session." } }, { status: 401 });

    const { id } = await context.params;
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return Response.json({ error: { kind: "validation", message: "savedRepositoryId is required." } }, { status: 400 });
    }
    const result = await addToCollection(userId, id, parsed.data.savedRepositoryId);
    if (!result) {
      return Response.json(
        { error: { kind: "not_found", message: "Collection or saved repository not found for this user." } },
        { status: 404 },
      );
    }
    return ok({ item: result }, { status: 201 });
  } catch (error) {
    return fromError(error);
  }
}

/** DELETE /api/collections/{id}/repositories — remove a saved repository. */
export async function DELETE(request: Request, context: Context) {
  try {
    if (!isDatabaseConfigured()) return serviceUnavailable("collections", "DATABASE_URL is not configured.");
    const userId = await currentUserId();
    if (!userId) return Response.json({ error: { kind: "unauthorized", message: "No session." } }, { status: 401 });

    const { id } = await context.params;
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return Response.json({ error: { kind: "validation", message: "savedRepositoryId is required." } }, { status: 400 });
    }
    const removed = await removeFromCollection(userId, id, parsed.data.savedRepositoryId);
    if (!removed) return Response.json({ error: { kind: "not_found", message: "Collection not found." } }, { status: 404 });
    return ok({ removed: true });
  } catch (error) {
    return fromError(error);
  }
}
