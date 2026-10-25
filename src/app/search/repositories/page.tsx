import type { Metadata } from "next";
import { SearchExperience } from "@/components/search/search-experience";
import { initialStateFromParams } from "@/lib/search/initial-state";
import { firstValues } from "@/lib/validation/search";

export const metadata: Metadata = {
  title: "Repository search",
  description: "Search GitHub repositories with filters for language, topics, stars, forks, dates and license.",
};

export default async function RepositorySearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = firstValues(await searchParams);
  const initialState = initialStateFromParams(params);
  const fromUrl = Object.keys(params).some((key) => (params[key] ?? "").length > 0);

  return <SearchExperience initialState={initialState} variant="results" fromUrl={fromUrl} />;
}
