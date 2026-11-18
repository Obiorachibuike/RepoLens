import { notFound } from "next/navigation";
import { getRepository } from "@/lib/github/repos";
import { GithubApiError } from "@/lib/github/errors";
import { RepoHeader } from "@/components/repository/repo-header";
import { RepositoryChat } from "@/components/chat/repository-chat";
import { repoLensUrl, type RepoRef } from "@/lib/validation/repository";

export const dynamic = "force-dynamic";
export const metadata = { title: "AI repository chat" };
export default async function ChatPage({ params }: { params: Promise<RepoRef> }) {
  try {
    const { data } = await getRepository(await params);
    const base = repoLensUrl({ owner: data.owner.login, repo: data.name });
    return <><RepoHeader repository={data} active="chat" /><RepositoryChat endpoint={`/api/repositories${base.slice("/repository".length)}/chat`} /></>;
  } catch (error) {
    if (error instanceof GithubApiError && (error.kind === "not_found" || error.kind === "validation")) notFound();
    throw error;
  }
}
