import { fetchRateLimits } from "@/lib/github/client";
import { fromError, ok } from "@/lib/api/respond";

export const dynamic = "force-dynamic";

/** Live GitHub rate-limit buckets (GET /rate_limit). */
export async function GET(request: Request) {
  try {
    const data = await fetchRateLimits(request.signal);
    return ok({ ...data }, { revalidate: 30 });
  } catch (error) {
    return fromError(error);
  }
}
