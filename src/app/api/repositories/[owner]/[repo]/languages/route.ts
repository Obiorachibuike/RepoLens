import { fromError, ok } from "@/lib/api/respond";
import { getLanguages } from "@/lib/github/repos";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ owner: string; repo: string }> };

/** GET /api/repositories/{owner}/{repo}/languages — byte counts + percentages. */
export async function GET(request: Request, context: Context) {
  try {
    const { owner, repo } = await context.params;
    const { data, rateLimit } = await getLanguages({ owner, repo }, request.signal);
    return ok({ languages: data, rateLimit }, { revalidate: 300 });
  } catch (error) {
    return fromError(error);
  }
}
