import { z } from "zod";
import { fromError, ok, validationError } from "@/lib/api/respond";
import { repositoryInput } from "@/lib/validation/repository";
import { compareRepositories } from "@/lib/intelligence/compare";
import { enforceBudget } from "@/lib/infra/budget";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(request: Request) {
  const input = z.array(repositoryInput).min(2).max(3).safeParse(new URL(request.url).searchParams.getAll("repo"));
  if (!input.success) return validationError(["Enter two or three public GitHub repositories."]);
  if (new Set(input.data.map((ref) => `${ref.owner}/${ref.repo}`.toLowerCase())).size !== input.data.length) return validationError(["Use different repositories for each comparison."]);
  try { await enforceBudget("analysis"); return ok({ items: await compareRepositories(input.data) }); } catch (error) { return fromError(error); }
}
