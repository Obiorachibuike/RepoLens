import type { Metadata } from "next";
import { CodeSearch } from "@/components/code/code-search";
import { isGithubAuthenticated } from "@/lib/github/client";
import { firstValues } from "@/lib/validation/search";

export const metadata: Metadata = {
  title: "Code search",
  description: "Search file contents across public GitHub repositories (requires GITHUB_TOKEN).",
};

export const dynamic = "force-dynamic";

export default async function CodeSearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = firstValues(await searchParams);
  return <CodeSearch authenticated={isGithubAuthenticated()} initialQuery={params.q ?? ""} />;
}
