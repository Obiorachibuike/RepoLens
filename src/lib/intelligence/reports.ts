import "server-only";
import { z } from "zod";
import { getOrSetCachedData } from "@/lib/infra/cache";
import { envInt } from "@/lib/infra/config";
import { getSourceIndex, chooseFiles, sampleFiles, type SourceIndex } from "./source";
import { mapArchitecture } from "./architecture";
import { inspectDependencies } from "./dependencies";
import { scanQuality, scanSecurity } from "./static-review";
import { getHealthReport } from "./health";
import { redactLine } from "./redact";
import type { RepoRef } from "@/lib/validation/repository";

export const intelligenceTabs = z.enum(["health", "architecture", "security", "dependencies", "quality"]);
export const tabLabel = { health: "Health", architecture: "Architecture", security: "Security", dependencies: "Dependencies", quality: "Code quality" } as const;
const preferredSecurity = /(?:^|\/)(?:\.env(?:\.|$)|\.npmrc|.*config|settings|auth|login|sessions?|config|secrets?|credentials?|db|api)(?:[/._-]|$)/i;
const preferredQuality = /(?:^|\/)(?:src|lib|app|services?|controllers)\/.+\.(?:[jt]sx?|py|go|rs|java|cs|rb)$/i;

export async function loadReport(ref: RepoRef, tab: z.infer<typeof intelligenceTabs>) {
  if (tab === "health") return { tab, report: await getHealthReport(ref) } as const;
  const index = await getSourceIndex(ref);
  if (!index) return { tab: "empty" as const };
  const info = { ref: index.ref, revision: index.revision, truncated: index.truncated };
  if (tab === "architecture") {
    const nodes = await getOrSetCachedData(reportKey("architecture", index), envInt("REPOLENS_ARCHITECTURE_TTL", 86400, 60, 604800), async () => mapArchitecture(index).map((node) => ({ ...node, paths: node.paths.filter((path) => redactLine(path) === path) })));
    return { tab, ...info, nodes } as const;
  }
  if (tab === "dependencies") return { tab, ...info, report: await inspectDependencies(index) } as const;
  const source = await getOrSetCachedData(reportKey(tab, index), 3600, async () => {
    const selected = chooseFiles(index.files, [], 12, tab === "security" ? preferredSecurity : preferredQuality);
    const { files, skipped } = await sampleFiles(index, selected, { signal: AbortSignal.timeout(18_000) });
    if (selected.length && !files.length) throw new Error("No source files could be inspected");
    return { findings: tab === "security" ? scanSecurity(files) : scanQuality(files), scanned: files.length, skipped, analyzedAt: new Date().toISOString() };
  });
  if (tab === "security") {
    const deps = await inspectDependencies(index).catch(() => null);
    return { tab, ...info, ...source, advisoryCoverage: deps?.advisoryCoverage ?? 0, inventoryCount: deps?.dependencies.length ?? null, dependencyFindings: deps?.dependencies.filter((dep) => dep.advisories?.length).slice(0, 50) ?? [] } as const;
  }
  return { tab, ...info, ...source } as const;
}
function reportKey(tab: string, index: SourceIndex) { return `${tab}:v1:${index.ref.owner.toLowerCase()}/${index.ref.repo.toLowerCase()}:${index.revision}`; }
