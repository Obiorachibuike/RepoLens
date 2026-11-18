import "server-only";
import type { AiCitation } from "@/lib/db/schema";
import { getSourceIndex, keywords, chooseFiles, sourceLink, sampleFiles, type SourceIndex, type SourceText } from "@/lib/intelligence/source";
import { redactLine, redactSource } from "@/lib/intelligence/redact";
import type { RepoRef } from "@/lib/validation/repository";

export type Excerpt = { citation: AiCitation; text: string };
export type RepoContext = { revision: string; excerpts: Excerpt[]; partial: boolean };
export function extractExcerpts(index: SourceIndex, sampled: SourceText[], terms: string[]): Excerpt[] {
  const excerpts: Excerpt[] = [];
  let remaining = 14_000;
  for (const file of sampled) {
    if (redactLine(file.path) !== file.path) continue;
    const lines = redactSource(file.text).split(/\r?\n/);
    let bestLine = 0, highest = 0;
    for (let start = 0; start < Math.min(lines.length, 1300); start += 12) {
      const block = lines.slice(start, start + 34).join(" ").toLowerCase();
      const score = terms.filter((term) => block.includes(term)).length;
      if (score > highest) { highest = score; bestLine = start; }
    }
    const window = lines.slice(bestLine, bestLine + 48);
    let text = "", count = 0;
    const maxChars = Math.min(3200, remaining);
    for (const line of window) {
      const value = `${bestLine + count + 1}: ${line.length > 260 ? `${line.slice(0, 260)} …` : line}\n`;
      if (text.length + value.length > maxChars) break;
      text += value;
      count++;
    }
    if (!count) break;
    remaining -= text.length;
    const from = bestLine + 1, to = bestLine + count;
    excerpts.push({ citation: { id: `S${excerpts.length + 1}`, path: file.path, from, to, url: sourceLink(index, file.path, from, to) }, text });
    if (excerpts.length >= 6 || remaining < 300) break;
  }
  return excerpts;
}

export async function retrieveContext(ref: RepoRef, question: string, signal?: AbortSignal): Promise<RepoContext | null> {
  const budget = AbortSignal.timeout(14_000);
  const merged = signal ? AbortSignal.any([signal, budget]) : budget;
  const index = await getSourceIndex(ref, merged);
  if (!index) return null;
  const terms = keywords(question);
  const selected = chooseFiles(index.files, terms, 6).filter((file) => !/(?:^|\/)(?:\.env(?:\.|$)|\.npmrc|.*secrets?\.[^/]+$)/i.test(file.path));
  const { files, skipped } = await sampleFiles(index, selected, { signal: merged });
  return { revision: index.revision, excerpts: extractExcerpts(index, files, terms), partial: index.truncated || skipped > 0 };
}
