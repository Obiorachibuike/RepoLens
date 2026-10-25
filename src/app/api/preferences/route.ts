import { z } from "zod";
import { fromError, ok, persistenceUnavailable, sessionRequired } from "@/lib/api/respond";
import { isDatabaseConfigured } from "@/lib/db/client";
import { getPreferences, updatePreferences } from "@/lib/db/queries";
import { currentUserId } from "@/lib/session";
import { PER_PAGE_OPTIONS, SEARCH_MODES, SORT_OPTIONS } from "@/lib/validation/search";

export const dynamic = "force-dynamic";

const preferencesSchema = z.object({
  theme: z.enum(["dark", "light", "system"]).optional(),
  defaultMode: z.enum(SEARCH_MODES).optional(),
  defaultSort: z.enum(SORT_OPTIONS).optional(),
  defaultPerPage: z
    .number()
    .refine((value): value is (typeof PER_PAGE_OPTIONS)[number] => (PER_PAGE_OPTIONS as readonly number[]).includes(value))
    .optional(),
});

/** GET /api/preferences */
export async function GET() {
  try {
    if (!isDatabaseConfigured()) return persistenceUnavailable("preferences", "Preferences are");
    const userId = await currentUserId();
    if (!userId) return sessionRequired();
    return ok({ preferences: await getPreferences(userId) });
  } catch (error) {
    return fromError(error);
  }
}

/** PATCH /api/preferences */
export async function PATCH(request: Request) {
  try {
    if (!isDatabaseConfigured()) return persistenceUnavailable("preferences", "Preferences are");
    const userId = await currentUserId();
    if (!userId) return sessionRequired();

    const parsed = preferencesSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return Response.json({ error: { kind: "validation", message: "Invalid preferences." } }, { status: 400 });
    }
    const preferences = await updatePreferences(userId, parsed.data);
    return ok({ preferences });
  } catch (error) {
    return fromError(error);
  }
}
