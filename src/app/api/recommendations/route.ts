import { fromError, ok, searchParamsToRecord, validationError } from "@/lib/api/respond";
import { recommendationSignals, recommendProjects } from "@/lib/discovery/recommendations";
import { recommendationProfile } from "@/lib/discovery/filters";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const signals = await recommendationSignals();
    const profile = recommendationProfile.safeParse({ ...signals.profile, ...searchParamsToRecord(new URL(request.url)) });
    if (!profile.success) return validationError(["Invalid project recommendation preferences."]);
    return ok({ profile: profile.data, ...await recommendProjects(profile.data, signals) });
  } catch (error) { return fromError(error); }
}
