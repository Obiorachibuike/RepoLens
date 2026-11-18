import { CompareView } from "@/components/discovery/compare-view";
export const metadata = { title: "Compare repositories" };
export default async function ComparePage({ searchParams }: { searchParams: Promise<{ repo?: string | string[] }> }) {
  const { repo } = await searchParams;
  return <CompareView initial={(Array.isArray(repo) ? repo : repo ? [repo] : []).slice(0, 3).map((item) => item.slice(0, 240))} />;
}
