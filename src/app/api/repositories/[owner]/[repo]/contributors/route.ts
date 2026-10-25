import { fromError, ok } from "@/lib/api/respond";
import { getContributors } from "@/lib/github/repos";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ owner: string; repo: string }> };

/** GET /api/repositories/{owner}/{repo}/contributors */
export async function GET(request: Request, context: Context) {
  try {
    const { owner, repo } = await context.params;
    const url = new URL(request.url);
    const perPage = Math.min(30, Math.max(1, Number(url.searchParams.get("per_page") ?? 12) || 12));
    const { data, rateLimit } = await getContributors({ owner, repo }, perPage, request.signal);
    return ok({ contributors: data, rateLimit }, { revalidate: 300 });
  } catch (error) {
    return fromError(error);
  }
}
