import { z } from "zod";
import { fromError, ok, serviceUnavailable, sessionRequired, validationError } from "@/lib/api/respond";
import { getDatabase } from "@/lib/db/client";
import { currentUserId } from "@/lib/session";
import { getRepository } from "@/lib/github/repos";
import { enforceBudget } from "@/lib/infra/budget";
import { registerRepositories } from "@/lib/trending/store";
import { repositoryInput } from "@/lib/validation/repository";

export async function POST(request: Request) {
  const db = getDatabase();
  if (!db) return serviceUnavailable("Tracking", "PostgreSQL is not configured for repository tracking.");
  try {
    const user = await currentUserId();
    if (!user) return sessionRequired();
    const parsed = z.object({ repository: repositoryInput }).safeParse(await request.json().catch(() => null));
    if (!parsed.success) return validationError(parsed.error.issues.map((issue) => issue.message));
    await enforceBudget("refresh", user);
    await enforceBudget("analysis");
    const repo = await getRepository(parsed.data.repository, request.signal);
    const [tracked] = await registerRepositories([repo.data], "explicit", db);
    if (!tracked) return serviceUnavailable("Tracking", "The tracked repository pool is full or this repository cannot be tracked.");
    return ok({ item: tracked, message: "Scheduled for collection; historical growth appears after both boundaries have observations." }, { status: 201 });
  } catch (error) { return fromError(error); }
}
