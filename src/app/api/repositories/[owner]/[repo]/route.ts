import { fromError, ok } from "@/lib/api/respond";
import { getRepository } from "@/lib/github/repos";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ owner: string; repo: string }> };

/** GET /api/repositories/{owner}/{repo} — full repository metadata. */
export async function GET(request: Request, context: Context) {
  try {
    const { owner, repo } = await context.params;
    const { data, rateLimit } = await getRepository({ owner, repo }, request.signal);
    return ok({ repository: data, rateLimit }, { revalidate: 60 });
  } catch (error) {
    return fromError(error);
  }
}
