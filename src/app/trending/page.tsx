import type { Metadata } from "next";
import { TrendingView } from "@/components/trending/trending-view";
import { firstValues } from "@/lib/validation/search";

export const metadata: Metadata = { title: "Trending", description: "Explore measured GitHub star growth from real RepoLens historical snapshots." };

export default async function TrendingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = firstValues(await searchParams);
  return <TrendingView initial={params} />;
}
