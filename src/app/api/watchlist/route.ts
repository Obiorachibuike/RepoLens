import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { fromError, ok, serviceUnavailable, sessionRequired, validationError } from "@/lib/api/respond";
import { getDatabase } from "@/lib/db/client";
import { repositoryWatchlists } from "@/lib/db/schema";
import { currentUserId } from "@/lib/session";
import { repositoryInput } from "@/lib/validation/repository";
import { enforceBudget } from "@/lib/infra/budget";
import { getRepository } from "@/lib/github/repos";
import { registerRepositories, snapshotCadenceHours } from "@/lib/trending/store";
import { watchPreferencesSchema } from "@/lib/workspace/watch-model";
import { addWatch, listWatchlist } from "@/lib/workspace/watch-store";

export const dynamic = "force-dynamic";
const offline = () => serviceUnavailable("Watchtower", "Watchtower needs PostgreSQL for saved preferences and historical observations.");
const owned = (id: string, user: string) => and(eq(repositoryWatchlists.id, id), eq(repositoryWatchlists.userId, user));
const notFound = () => Response.json({ error: { kind: "not_found", message: "Watch entry not found." } }, { status: 404 });
export async function GET() {
  try {
    const db = getDatabase(); if (!db) return offline();
    const user = await currentUserId(); if (!user) return sessionRequired();
    return ok({ items: await listWatchlist(db, user), intervalHours: snapshotCadenceHours() });
  } catch (error) { return fromError(error); }
}
export async function POST(request: Request) {
  try {
    const db = getDatabase(); if (!db) return offline();
    const user = await currentUserId(); if (!user) return sessionRequired();
    const input = z.object({ repository: repositoryInput }).safeParse(await request.json().catch(() => null));
    if (!input.success) return validationError(["Enter an owner/repository name or public GitHub repository URL."]);
    await enforceBudget("refresh", user); await enforceBudget("analysis");
    const { data } = await getRepository(input.data.repository, request.signal);
    const [tracked] = await registerRepositories([data], "explicit", db);
    if (!tracked) return serviceUnavailable("Tracking", "The tracking pool is full or this repository cannot be tracked.");
    const id = await addWatch(db, user, tracked.id);
    return ok({ id }, { status: 201 });
  } catch (error) { return fromError(error); }
}
export async function PATCH(request: Request) {
  try {
    const db = getDatabase(); if (!db) return offline();
    const user = await currentUserId(); if (!user) return sessionRequired();
    const input = z.object({ id: z.uuid(), preferences: watchPreferencesSchema.optional(), markRead: z.literal(true).optional() }).safeParse(await request.json().catch(() => null));
    if (!input.success || (!input.data.preferences && !input.data.markRead)) return validationError(["Invalid watch preference update."]);
    const { id, preferences, markRead } = input.data;
    const [item] = await db.update(repositoryWatchlists).set({ ...(preferences ? { preferences: sql`${repositoryWatchlists.preferences} || ${JSON.stringify(preferences)}::jsonb` } : {}), ...(markRead ? { seenAt: new Date() } : {}) }).where(owned(id, user)).returning({ id: repositoryWatchlists.id });
    return item ? ok({ updated: true }) : notFound();
  } catch (error) { return fromError(error); }
}
export async function DELETE(request: Request) {
  try {
    const db = getDatabase(); if (!db) return offline();
    const user = await currentUserId(); if (!user) return sessionRequired();
    const id = z.uuid().safeParse(new URL(request.url).searchParams.get("id"));
    if (!id.success) return validationError(["Invalid watch entry."]);
    const [item] = await db.delete(repositoryWatchlists).where(owned(id.data, user)).returning({ id: repositoryWatchlists.id });
    return item ? ok({ deleted: true }) : notFound();
  } catch (error) { return fromError(error); }
}
