import Link from "next/link";
import { ScanSearch } from "lucide-react";
import { RepoLauncher } from "@/components/discovery/repo-launcher";
import { PageHeading, panel, workspace } from "@/components/ui/workspace";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
export const metadata = { title: "Analyze a repository" };
export default async function AnalyzeHub({ searchParams }: { searchParams: Promise<{ tool?: string }> }) {
  const tool = (await searchParams).tool;
  return <div className={workspace}>
    <PageHeading eyebrow="Analyze / Repository tools" title={tool === "chat" ? "AI repository chat" : "Understand any codebase"} description="Paste a public GitHub repository to open an evidence-based report, trace its structure, or ask a question about source code." icon={<ScanSearch className="size-4" />} />
    <div className={cn(panel, "max-w-3xl p-4 sm:p-6")}><RepoLauncher initialTool={typeof tool === "string" ? tool : undefined} /></div>
    <Link href="/compare" className={cn(buttonVariants({ variant: "outline" }), "mt-4")}>Compare multiple repositories →</Link>
  </div>;
}
