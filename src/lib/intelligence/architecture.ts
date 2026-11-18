import type { SourceIndex } from "./source";

export type ArchitectureNode = { id: string; label: string; description: string; paths: string[]; count: number };
const categories = [
  ["web", "Frontend", "Page, component, or view paths.", /(?:^|\/)(?:pages|views|components|frontend|client|app)\/.+\.(?:tsx|jsx|vue|svelte|html)$/i],
  ["api", "Routes & backend", "Routing and controller paths, not confirmed runtime entrypoints.", /(?:^|\/)(?:api|controllers?|routes?|server|backend|handlers?)\/|(?:^|\/)route\.[jt]s$/i],
  ["data", "Data layer", "Schema, migration, model and data access paths.", /(?:^|\/)(?:db|migrations|schema|models|prisma|drizzle|repositories)(?:\/|\.|-)|\.sql$/i],
  ["auth", "Identity & access", "Authentication, session or identity filenames.", /(?:^|\/|[-_])(?:auth|oauth|login|sessions?|identity)(?:\/|\.|[-_])/i],
  ["jobs", "Jobs & schedules", "Workflow, queue, worker or cron definitions.", /(?:^|\/)(?:\.github\/workflows|jobs|workers?|queue|cron)(?:\/|\.)|(?:^|\/)vercel\.json$/i],
  ["services", "Services & integrations", "Service and integration module paths; no external calls are inferred.", /(?:^|\/)(?:integrations|services|providers|clients|adapters)(?:\/|\.)/i],
  ["state", "State management", "Store, reducer and state module paths.", /(?:^|\/)(?:state|stores?|reducers?|context)(?:\/|\.)/i],
  ["build", "Dependencies & runtime", "Dependency manifests and deployment configuration.", /(?:^|\/)(?:package\.json|go\.mod|pyproject\.toml|Cargo\.toml|requirements\.txt|pom\.xml|Dockerfile|Gemfile|compose\.ya?ml)$/i],
  ["tests", "Tests", "Test paths; tests were not executed.", /(?:^|\/)(?:tests?|__tests__|specs?)(?:\/|\.)|\.(?:test|spec)\.[jt]sx?$/i],
] as const;

export function mapArchitecture(index: SourceIndex) {
  return categories.flatMap(([id, label, description, rule]): ArchitectureNode[] => {
    const matches = index.files.filter(({ path }) => rule.test(path));
    const paths = matches.map(({ path }) => path).sort((a, b) => a.length - b.length || a.localeCompare(b)).slice(0, 8);
    return paths.length ? [{ id, label, description, paths, count: matches.length }] : [];
  });
}
