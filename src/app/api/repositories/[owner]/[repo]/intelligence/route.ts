import { fromError, ok, validationError } from "@/lib/api/respond";
import { enforceBudget } from "@/lib/infra/budget";
import { assertRef } from "@/lib/github/repos";
import { getSourceIndex } from "@/lib/intelligence/source";
import { cyclonedx, inspectDependencies } from "@/lib/intelligence/dependencies";
import { intelligenceTabs, loadReport } from "@/lib/intelligence/reports";
import type { RepoRef } from "@/lib/validation/repository";
import { recordAnalysis } from "@/lib/workspace/analysis-history";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request, context: { params: Promise<RepoRef> }) {
  try {
    const ref = await context.params; assertRef(ref);
    const search = new URL(request.url).searchParams;
    const tab = intelligenceTabs.safeParse(search.get("view") ?? "health");
    const format = search.get("format") ?? "json";
    if (!tab.success || !["json", "cyclonedx"].includes(format) || (format === "cyclonedx" && tab.data !== "dependencies")) return validationError(["Invalid intelligence view or export format."]);
    await enforceBudget("analysis");
    if (format === "cyclonedx") {
      const index = await getSourceIndex(ref, request.signal);
      if (!index) return Response.json({ error: { kind: "not_found", message: "No source revision available for an SBOM." } }, { status: 404 });
      const inventory = await inspectDependencies(index);
      return new Response(JSON.stringify(cyclonedx(index, inventory), null, 2), { headers: { "Content-Type": "application/vnd.cyclonedx+json", "Content-Disposition": 'attachment; filename="repolens-sbom.cdx.json"', "Cache-Control": "no-store" } });
    }
    const result = await loadReport(ref, tab.data);
    if (result.tab === "health") await recordAnalysis(`${ref.owner}/${ref.repo}`, result.report);
    return ok(result);
  } catch (error) { return fromError(error); }
}
