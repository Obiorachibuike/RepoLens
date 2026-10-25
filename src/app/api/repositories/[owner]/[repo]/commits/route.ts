import { fromError, ok } from "@/lib/api/respond";
import { getCommits } from "@/lib/github/repos";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ owner: string; repo: string }> };

/** GET /api/repositories/{owner}/{repo}/commits */
export async function GET(request: Request, context: Context) {
  try {
    const { owner, repo } = await context.params;
    const url = new URL(request.url);
    const perPage = Math.min(50, Math.max(1, Number(url.searchParams.get("per_page") ?? 20) || 20));
    const { data, rateLimit } = await getCommits({ owner, repo }, perPage, request.signal);
    return ok({ commits: data, rateLimit }, { revalidate: 120 });
  } catch (error) {
    return fromError(error);
  }
}
