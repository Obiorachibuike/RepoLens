import type { Metadata } from "next";
import { SearchExperience } from "@/components/search/search-experience";
import { initialStateFromParams } from "@/lib/search/initial-state";
import { firstValues } from "@/lib/validation/search";

export const metadata: Metadata = {
  title: "Find Your Next Project",
  description:
    "Search the real GitHub API by keyword, language, topic, stars and dates — then inspect, visualize and analyze any repository.",
};

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = firstValues(await searchParams);
  const initialState = initialStateFromParams(params);
  const fromUrl = Object.keys(params).some((key) => key !== "mode" && (params[key] ?? "").length > 0);

  return <SearchExperience initialState={initialState} variant="home" fromUrl={fromUrl} />;
}
