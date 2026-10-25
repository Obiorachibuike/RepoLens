import { fromError, ok } from "@/lib/api/respond";
import { GithubApiError } from "@/lib/github/errors";
import { collectEvidence } from "@/lib/analyze/collect";
import { analyzeRepository } from "@/lib/analyze/analyze";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ owner: string; repo: string }> };

/**
 * GET /api/repositories/{owner}/{repo}/analyze
 * Evidence-based analysis built from public GitHub metadata only.
 */
export async function GET(request: Request, context: Context) {
  try {
    const { owner, repo } = await context.params;
    const evidence = await collectEvidence({ owner, repo }, request.signal);
    const analysis = analyzeRepository(evidence);
    return ok({ analysis, repository: evidence.repository, unavailableCalls: evidence.failed, rateLimit: evidence.rateLimit });
  } catch (error) {
    if (error instanceof GithubApiError && error.kind === "not_found") {
      return fromError(
        new GithubApiError({
          kind: "not_found",
          status: 404,
          message: "That repository was not found on GitHub. It may be private, renamed or deleted.",
        }),
      );
    }
    return fromError(error);
  }
}
