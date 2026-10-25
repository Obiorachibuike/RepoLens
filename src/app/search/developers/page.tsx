import type { Metadata } from "next";
import { DeveloperSearch } from "@/components/developers/developer-search";
import { firstValues } from "@/lib/validation/search";

export const metadata: Metadata = {
  title: "Developer search",
  description: "Search public GitHub developer profiles by name, company, location and language.",
};

export default async function DeveloperSearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = firstValues(await searchParams);
  return <DeveloperSearch initialQuery={params.q ?? ""} />;
}
