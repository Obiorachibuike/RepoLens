import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { boundedText } from "@/lib/github/client";
import { getOrSetCachedData, setCachedData } from "@/lib/infra/cache";
import { envInt } from "@/lib/infra/config";
import { sampleFiles, type SourceIndex, type SourceText } from "./source";
import { redactLine } from "./redact";

type Ecosystem = "npm" | "PyPI" | "crates.io" | "Go" | "Packagist" | "RubyGems" | "Maven";
type Relation = "direct" | "transitive" | "unknown";
export type Dependency = { name: string; ecosystem: Ecosystem; version: string | null; constraint: string | null; relation: Relation; source: string; resolved: boolean; license: string | null; latest: string | null; outdated: boolean | null; advisories: string[] | null };
export type DependencyReport = { dependencies: Dependency[]; manifests: string[]; skipped: number; advisoryCoverage: number; advisoryUnavailable: boolean; truncated: boolean; analyzedAt: string };
const manifest = /(?:^|\/)(?:package(?:-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|requirements(?:-[\w-]+)?\.txt|pyproject\.toml|Cargo\.(?:toml|lock)|go\.mod|composer\.(?:json|lock)|Gemfile(?:\.lock)?|pom\.xml)$/i;
const exactPatterns: Record<Ecosystem, RegExp> = {
  npm: /^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/, PyPI: /^\d[\w.+!-]*$/, "crates.io": /^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/,
  Go: /^v\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/, Packagist: /^v?\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/,
  RubyGems: /^\d+\.\d+(?:\.[\w-]+)*$/, Maven: /^\d[\w.+-]*$/,
};
const validName = /^[A-Za-z0-9@][A-Za-z0-9_@./:-]{0,219}$/;
const safeRange = /^[\w.^~*=<>,|+! -]{1,100}$/;
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
function json(text: string) { try { const value: unknown = JSON.parse(text); return isObject(value) ? value : null; } catch { return null; } }

export function inventory(files: SourceText[]) {
  const all: Dependency[] = [];
  let skipped = 0;
  const coverage = new Map<string, Set<string>>();
  const dirs = new Map<string, SourceText[]>();
  for (const file of files) {
    const parent = file.path.split("/").slice(0, -1).join("/");
    const entries = dirs.get(parent) ?? [];
    entries.push(file); dirs.set(parent, entries);
  }
  for (const [dir, entries] of dirs) {
    const direct = coverage.get(dir) ?? new Set<string>();
    coverage.set(dir, direct);
    const ordered = [...entries].sort((a, b) => Number(/lock\./.test(a.path) || a.path.endsWith(".lock")) - Number(/lock\./.test(b.path) || b.path.endsWith(".lock")));
    for (const file of ordered) {
      const nameOfFile = file.path.split("/").at(-1)?.toLowerCase();
      const add = (ecosystem: Ecosystem, name: unknown, raw: unknown, resolved = false, relation: Relation = "direct", license?: unknown) => {
        if (typeof name !== "string" || !validName.test(name) || redactLine(name) !== name) return;
        const constraint = typeof raw === "string" ? raw.trim().slice(0, 130) : "";
        const candidate = constraint.replace(/^==\s*/, "");
        const version = exactPatterns[ecosystem].test(candidate) && redactLine(candidate) === candidate ? candidate : null;
        const normalizedName = ecosystem === "PyPI" ? name.toLowerCase().replace(/[-_.]+/g, "-") : name;
        const key = `${ecosystem}:${normalizedName}`;
        if (!resolved && relation === "direct") direct.add(key);
        const finalRelation = resolved && relation === "unknown" && direct.has(key) ? "direct" : relation;
        all.push({ name: normalizedName, ecosystem, version, constraint: constraint ? (safeRange.test(constraint) && redactLine(constraint) === constraint ? constraint : "Non-registry or unsupported constraint") : null, relation: finalRelation,
          source: redactLine(file.path), resolved, license: typeof license === "string" && /^[A-Za-z0-9.()+ -]{1,90}$/.test(license) && redactLine(license) === license ? license : null, latest: null, outdated: null, advisories: null });
      };
      switch (nameOfFile) {
        case "package.json": {
          const data = json(file.text); if (!data) { skipped++; break; }
          for (const field of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
            const deps = data[field];
            if (isObject(deps)) for (const [pkg, value] of Object.entries(deps)) add("npm", pkg, value);
          }
          break;
        }
        case "package-lock.json": {
          const data = json(file.text); if (!data) { skipped++; break; }
          if (isObject(data.packages)) {
            const root = data.packages[""];
            if (isObject(root)) for (const field of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
              const deps = root[field]; if (isObject(deps)) for (const pkg of Object.keys(deps)) direct.add(`npm:${pkg}`);
            }
            for (const [path, info] of Object.entries(data.packages)) {
              if (!path.includes("node_modules/") || !isObject(info) || !info.version || info.link) continue;
              const pkg = path.split("node_modules/").at(-1) ?? "";
              add("npm", info.name ?? pkg, info.version, true, direct.has(`npm:${pkg}`) && (path.match(/node_modules\//g)?.length ?? 0) === 1 ? "direct" : direct.size > 0 ? "transitive" : "unknown", info.license);
            }
          } else if (isObject(data.dependencies)) {
            const visit = (deps: Record<string, unknown>, depth: number) => {
              if (depth > 12 || all.length > 4000) return;
              for (const [pkg, info] of Object.entries(deps)) if (isObject(info)) {
                add("npm", pkg, info.version, true, depth > 0 ? "transitive" : direct.has(`npm:${pkg}`) ? "direct" : direct.size ? "transitive" : "unknown", info.license);
                if (isObject(info.dependencies)) visit(info.dependencies, depth + 1);
              }
            };
            visit(data.dependencies, 0);
          } else skipped++;
          break;
        }
        case "pnpm-lock.yaml": {
          const block = file.text.split(/^packages:[ \t]*\r?\n/m)[1]?.split(/^\S/m)[0] ?? "";
          for (const m of block.matchAll(/^ {2}['"]?\/?(@?[\w.-]+(?:\/[\w.-]+)?)[@/](\d+\.\d+\.\d+(?:-[\w.-]+)?)(?:\([^\n]*\))?['"]?:[ \t]*(?:\{|\r?$)/gm)) add("npm", m[1], m[2], true, direct.size && !direct.has(`npm:${m[1]}`) ? "transitive" : "unknown");
          break;
        }
        case "yarn.lock": {
          let active: string | undefined;
          for (const line of file.text.split(/\r?\n/)) {
            if (/^\S/.test(line)) active = /^(?:["'])?(@?[\w.-]+(?:\/[\w.-]+)?)@/.exec(line)?.[1];
            const match = /^\s+version:?\s+["']?([\w.+-]+)/.exec(line);
            if (active && match?.[1]) add("npm", active, match[1], true, direct.size && !direct.has(`npm:${active}`) ? "transitive" : "unknown");
          }
          break;
        }
        case "pyproject.toml": {
          const project = /(?:^|\n)\[project\]([\s\S]*?)(?=\n\[|$)/.exec(file.text)?.[1] ?? "";
          const list = /(?:^|\n)\s*dependencies\s*=\s*\[([\s\S]*?)\]\s*(?:#.*)?(?:\n|$)/.exec(project)?.[1] ?? "";
          for (const m of list.matchAll(/["']([\w.-]+)(?:\[[^\]]+\])?([^"';]*)(?:;[^"']*)?["']/g)) add("PyPI", m[1], m[2]);
          const poetry = /(?:^|\n)\[tool\.poetry\.dependencies\]([\s\S]*?)(?=\n\[|$)/.exec(file.text)?.[1] ?? "";
          for (const m of poetry.matchAll(/^\s*([\w.-]+)\s*=\s*["']([^"']+)["']/gm)) if (m[1] !== "python") add("PyPI", m[1], m[2]);
          break;
        }
        case "cargo.toml": {
          const blocks = file.text.split(/^\s*\[/m).filter((b) => /^(?:dependencies|dev-dependencies|build-dependencies)\]/.test(b));
          for (const block of blocks) for (const m of block.matchAll(/^\s*([\w-]+)\s*=\s*(?:\{[^\n]*?version\s*=\s*)?["']([^"']+)["']/gm)) {
            // Cargo uses a caret range even when the manifest spells 1.2.3.
            const range = m[2] ?? ""; add("crates.io", m[1], range.startsWith("=") ? range.replace(/^=/, "==") : exactPatterns["crates.io"].test(range) ? `^${range}` : range);
          }
          break;
        }
        case "cargo.lock": {
          for (const block of file.text.split(/\[\[package\]\]/)) {
            const pkg = /^name\s*=\s*"([^"]+)"/m.exec(block)?.[1];
            const version = /^version\s*=\s*"([^"]+)"/m.exec(block)?.[1];
            if (block.includes('source = "registry+')) add("crates.io", pkg, version, true, direct.size && !direct.has(`crates.io:${pkg}`) ? "transitive" : "unknown");
          }
          break;
        }
        case "go.mod": {
          const entries = file.text.split(/\r?\n/);
          let block = false;
          for (const line of entries) {
            if (/^\s*require\s*\(/.test(line)) { block = true; continue; }
            if (/^\s*\)/.test(line)) block = false;
            if (!block && !/^\s*require\s/.test(line)) continue;
            const m = /^\s*(?:require\s+)?([^\s]+)\s+(v\d[^\s]+)/.exec(line);
            if (m) add("Go", m[1], m[2], true, line.includes("// indirect") ? "transitive" : "direct");
          }
          break;
        }
        case "composer.json": case "composer.lock": {
          const data = json(file.text); if (!data) { skipped++; break; }
          for (const field of nameOfFile === "composer.json" ? ["require", "require-dev"] : ["packages", "packages-dev"]) {
            const deps = data[field];
            if (isObject(deps)) for (const [pkg, value] of Object.entries(deps)) if (pkg.includes("/")) add("Packagist", pkg, value);
            if (Array.isArray(deps)) for (const info of deps) if (isObject(info)) add("Packagist", info.name, info.version, true, direct.size && !direct.has(`Packagist:${info.name}`) ? "transitive" : "unknown", Array.isArray(info.license) ? info.license[0] : null);
          }
          break;
        }
        case "gemfile": {
          for (const m of file.text.matchAll(/^\s*gem\s+["']([\w.-]+)["'](?:,\s*["']([^"']+)["'])?/gm)) add("RubyGems", m[1], m[2]);
          break;
        }
        case "gemfile.lock": {
          const specs = /(?:^|\n)GEM\n([\s\S]*?)(?=\n[A-Z]|$)/.exec(file.text)?.[1] ?? "";
          for (const m of specs.matchAll(/^ {4}([\w.-]+) \(([\w.+-]+)\)$/gm)) add("RubyGems", m[1], m[2], true, direct.size && !direct.has(`RubyGems:${m[1]}`) ? "transitive" : "unknown");
          break;
        }
        case "pom.xml": {
          // Text-only subset; never expand XML entities, parent POMs or plugins.
          for (const m of file.text.replace(/<!--[\s\S]*?-->/g, "").replace(/<dependencyManagement>[\s\S]*?<\/dependencyManagement>/g, "").matchAll(/<dependency>([\s\S]*?)<\/dependency>/g)) {
            const block = m[1] ?? "";
            const group = /<groupId>\s*([\w.-]+)\s*<\/groupId>/.exec(block)?.[1];
            const artifact = /<artifactId>\s*([\w.-]+)\s*<\/artifactId>/.exec(block)?.[1];
            if (group && artifact) add("Maven", `${group}:${artifact}`, /<version>\s*([^<]+)<\/version>/.exec(block)?.[1]);
          }
          break;
        }
        default: {
          if (nameOfFile?.startsWith("requirements")) for (const m of file.text.matchAll(/^\s*([\w.-]+)(?:\[[^\]]+\])?\s*([<>=!~][^\s;#]+)?/gm)) add("PyPI", m[1], m[2]);
          break;
        }
      }
    }
  }
  const locked = new Set(all.filter((item) => item.resolved && item.relation === "direct" && item.version).map((item) => `${item.ecosystem}:${item.name}:${item.source.split("/").slice(0, -1).join("/")}`));
  const unique = new Map<string, Dependency>();
  for (const item of all) {
    if (!item.resolved && locked.has(`${item.ecosystem}:${item.name}:${item.source.split("/").slice(0, -1).join("/")}`)) continue;
    const key = `${item.ecosystem}:${item.name}:${item.version ?? item.constraint ?? "?"}:${item.relation}`;
    if (!unique.has(key) || item.resolved) unique.set(key, item);
  }
  const dependencies = [...unique.values()].sort((a, b) => Number(b.relation === "direct") - Number(a.relation === "direct") || a.name.localeCompare(b.name));
  return { dependencies, skipped };
}

const advisoryId = z.string().regex(/^[A-Za-z0-9][\w.-]{1,80}$/);
const osvResponse = z.object({ results: z.array(z.object({ vulns: z.array(z.object({ id: advisoryId })).optional() })) });

async function queryAdvisories(deps: Dependency[]) {
  const exact = deps.filter((entry): entry is Dependency & { version: string } => Boolean(entry.version));
  const groups = new Map<string, (Dependency & { version: string })[]>();
  for (const dep of exact) {
    const key = `${dep.ecosystem}:${dep.name}:${dep.version}`;
    const current = groups.get(key) ?? [];
    current.push(dep); groups.set(key, current);
  }
  const requests = [...groups].slice(0, envInt("REPOLENS_ADVISORY_BATCH_LIMIT", 80, 1, 150));
  if (!requests.length) return { count: 0, failed: false };
  const queries = requests.map(([, group]) => { const item = group[0]!; return { package: { ecosystem: item.ecosystem, name: item.name }, version: item.version }; });
  const key = `advisories:osv:${createHash("sha256").update(JSON.stringify(queries)).digest("hex")}`;
  try {
    const results = await getOrSetCachedData(key, envInt("REPOLENS_ADVISORY_TTL", 3600, 60, 86400), async () => {
      const response = await fetch("https://api.osv.dev/v1/querybatch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ queries }), cache: "no-store", redirect: "error", signal: AbortSignal.timeout(4500) });
      if (!response.ok) throw new Error("Advisories unavailable");
      const parsed = osvResponse.parse(JSON.parse(await boundedText(response, 512 * 1024)));
      if (parsed.results.length !== requests.length) throw new Error("Invalid advisory response");
      return parsed.results;
    });
    let count = 0;
    requests.forEach(([, group], i) => group.forEach((dep) => { dep.advisories = results[i]?.vulns?.map((v) => v.id).slice(0, 20) ?? []; count++; }));
    return { count, failed: false };
  } catch { return { count: 0, failed: true }; }
}

async function npmLatest(dependencies: Dependency[]) {
  const stable = /^\d+\.\d+\.\d+$/;
  const small = dependencies.filter((dep) => dep.ecosystem === "npm" && dep.relation === "direct" && dep.version && stable.test(dep.version) && /^(?:@[\w.-]+\/)?[\w.-]+$/.test(dep.name)).slice(0, 6);
  await Promise.all(small.map(async (dep) => {
    try {
      const latest = await getOrSetCachedData(`registry:npm:${createHash("sha256").update(dep.name).digest("hex")}`, 21_600, async () => {
        const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(dep.name)}/latest`, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(3000) });
        if (!response.ok) throw new Error("Registry lookup failed");
        const parsed = z.object({ version: z.string().max(100), license: z.string().max(100).optional() }).parse(JSON.parse(await boundedText(response, 256_000)));
        return parsed;
      });
      dep.latest = latest.version;
      if (dep.version === latest.version && !dep.license && latest.license && /^[A-Za-z0-9.()+ -]+$/.test(latest.license)) dep.license = latest.license;
      if (!stable.test(latest.version)) return;
      const old = dep.version!.split(".").map(Number);
      const next = latest.version.split(".").map(Number);
      const diff = next.map((value, i) => value - (old[i] ?? value)).find((value) => value !== 0) ?? 0;
      dep.outdated = diff > 0;
    } catch { /* Version freshness remains unknown. */ }
  }));
}

export async function inspectDependencies(index: SourceIndex): Promise<DependencyReport> {
  const key = `dependencies:v1:${index.ref.owner.toLowerCase()}/${index.ref.repo.toLowerCase()}:${index.revision}`;
  // The inventory is commit-bound; advisory and registry checks are refreshed
  // separately so an advisory update doesn't require a new repository commit.
  const source = await getOrSetCachedData(key, envInt("REPOLENS_DEPENDENCY_TTL", 21_600, 60, 86400), async () => {
    const recognized = index.files.filter(({ path }) => manifest.test(path)).sort((a, b) => a.path.split("/").length - b.path.split("/").length || a.path.localeCompare(b.path));
    const selected = recognized.slice(0, 10);
    const { files, skipped } = await sampleFiles(index, selected, { maxBytes: 512 * 1024, signal: AbortSignal.timeout(14_000) });
    const parsed = inventory(files);
    if (selected.length && !files.length) throw new Error("No dependency manifests could be read");
    return { dependencies: parsed.dependencies.slice(0, 400), manifests: files.map((file) => redactLine(file.path)), skipped: skipped + parsed.skipped, truncated: index.truncated || recognized.length > 10 || parsed.dependencies.length > 400 };
  });
  const dependencies = source.dependencies.map((dep) => ({ ...dep }));
  const [advisories] = await Promise.all([queryAdvisories(dependencies), npmLatest(dependencies)]);
  if (advisories.count) {
    const ids = [...new Set(dependencies.flatMap((item) => item.advisories ?? []))].sort();
    const fingerprint = createHash("sha256").update(ids.join("\n")).digest("hex").slice(0, 12);
    await setCachedData(`watch-advisories:${index.ref.owner.toLowerCase()}/${index.ref.repo.toLowerCase()}`, { revision: index.revision, label: `${ids.length} matched advisory IDs (${fingerprint})` }, 3600);
  }
  return { ...source, dependencies, advisoryCoverage: advisories.count, advisoryUnavailable: advisories.failed, analyzedAt: new Date().toISOString() };
}

const purlType: Record<Ecosystem, string> = { npm: "npm", PyPI: "pypi", "crates.io": "cargo", Go: "golang", Packagist: "composer", RubyGems: "gem", Maven: "maven" };
export function cyclonedx(index: SourceIndex, report: DependencyReport) {
  const components = report.dependencies.map((entry, i) => {
    const name = (entry.ecosystem === "Maven" ? entry.name.replace(":", "/") : entry.name).split("/").map(encodeURIComponent).join("/");
    const purl = `pkg:${purlType[entry.ecosystem]}/${name}${entry.version ? `@${encodeURIComponent(entry.version)}` : ""}`;
    return {
      type: "library", "bom-ref": `${purl}#${i + 1}`, name: entry.name, purl,
      ...(entry.version ? { version: entry.version } : {}),
      ...(entry.license ? { licenses: [{ license: { name: entry.license } }] } : {}),
      properties: [{ name: "repolens:manifest", value: entry.source }, { name: "repolens:relation", value: entry.relation }, { name: "repolens:lock-evidence", value: String(entry.resolved) }],
    };
  });
  return { bomFormat: "CycloneDX", specVersion: "1.5", version: 1, metadata: { timestamp: report.analyzedAt, component: { type: "application", name: `${index.ref.owner}/${index.ref.repo}`, version: index.revision } }, components };
}
