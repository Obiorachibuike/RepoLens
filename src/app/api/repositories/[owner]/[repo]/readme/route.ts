import { fromError, ok } from "@/lib/api/respond";
import { getReadme } from "@/lib/github/repos";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ owner: string; repo: string }> };

/** GET /api/repositories/{owner}/{repo}/readme — raw Markdown (never HTML). */
export async function GET(request: Request, context: Context) {
  try {
    const { owner, repo } = await context.params;
    const readme = await getReadme({ owner, repo }, request.signal);
    return ok({ ...readme }, { revalidate: 300 });
  } catch (error) {
    return fromError(error);
  }
}
