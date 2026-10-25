import { fromError, ok } from "@/lib/api/respond";
import { getContents } from "@/lib/github/repos";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ owner: string; repo: string }> };

/**
 * GET /api/repositories/{owner}/{repo}/contents?path=src
 * One directory listing per call — the real GitHub contents API.
 */
export async function GET(request: Request, context: Context) {
  try {
    const { owner, repo } = await context.params;
    const url = new URL(request.url);
    const path = url.searchParams.get("path") ?? "";
    if (path.length > 300) {
      return ok({ entries: [], rateLimit: null });
    }
    const { data, rateLimit } = await getContents({ owner, repo }, path, request.signal);
    return ok({ entries: data, path, rateLimit }, { revalidate: 300 });
  } catch (error) {
    return fromError(error);
  }
}
