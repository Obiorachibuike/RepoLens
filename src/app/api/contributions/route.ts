import { fromError, ok, searchParamsToRecord, validationError } from "@/lib/api/respond";
import { findContributions } from "@/lib/discovery/issues";
import { issueFilters } from "@/lib/discovery/filters";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const parsed = issueFilters.safeParse(searchParamsToRecord(new URL(request.url)));
  if (!parsed.success) return validationError(["Invalid contribution filters."]);
  try { return ok(await findContributions(parsed.data)); } catch (error) { return fromError(error); }
}
