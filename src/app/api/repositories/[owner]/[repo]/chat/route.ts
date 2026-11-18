import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { ok, fromError, sessionRequired, serviceUnavailable, validationError } from "@/lib/api/respond";
import { getDatabase } from "@/lib/db/client";
import { aiConversations } from "@/lib/db/schema";
import { currentUserId } from "@/lib/session";
import { assertRef } from "@/lib/github/repos";
import { GithubApiError } from "@/lib/github/errors";
import { enforceBudget } from "@/lib/infra/budget";
import { acquireLease } from "@/lib/infra/redis";
import { addChatTurn, chatHistory, ownedConversation, readCachedAnswer, usageFor } from "@/lib/ai/store";
import { answerQuestion, allowQuestion, isAiConfigured } from "@/lib/ai/provider";
import { retrieveContext } from "@/lib/ai/context";
import { redactSource } from "@/lib/intelligence/redact";
import type { RepoRef } from "@/lib/validation/repository";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Context = { params: Promise<RepoRef> };
const idSchema = z.uuid();
const turnSchema = z.object({ conversationId: idSchema.optional(), question: z.string().trim().min(3).max(1800) }).strict();
const repoKey = ({ owner, repo }: RepoRef) => `${owner}/${repo}`.toLowerCase();
const notFound = () => fromError(new GithubApiError({ kind: "not_found", message: "Conversation not found." }));
const noDb = () => serviceUnavailable("Repository chat", "Chat history and ownership require a PostgreSQL connection.");

export async function GET(request: Request, context: Context) {
  const db = getDatabase();
  if (!db) return noDb();
  try {
    const user = await currentUserId();
    if (!user) return sessionRequired();
    const ref = await context.params; assertRef(ref);
    const repository = repoKey(ref);
    const id = new URL(request.url).searchParams.get("conversationId");
    if (id && !idSchema.safeParse(id).success) return validationError(["Invalid conversation ID."]);
    const conversations = await db.select({ id: aiConversations.id, title: aiConversations.title, updatedAt: aiConversations.updatedAt })
      .from(aiConversations).where(and(eq(aiConversations.userId, user), eq(aiConversations.repository, repository))).orderBy(desc(aiConversations.updatedAt)).limit(30);
    const active = id ?? conversations[0]?.id;
    if (id) {
      const [mine] = await db.select({ id: aiConversations.id }).from(aiConversations).where(ownedConversation(user, repository, id)).limit(1);
      if (!mine) return notFound();
    }
    return ok({ conversations, active, entries: await chatHistory(db, user, repository, active), aiConfigured: isAiConfigured() });
  } catch (error) { return fromError(error); }
}

export async function POST(request: Request, context: Context) {
  const db = getDatabase();
  if (!db) return noDb();
  try {
    const user = await currentUserId();
    if (!user) return sessionRequired();
    if (!isAiConfigured()) return serviceUnavailable("Repository chat", "Configure an AI provider to ask questions. Existing history remains readable.");
    const ref = await context.params; assertRef(ref);
    const repository = repoKey(ref);
    const parsed = turnSchema.safeParse(await readBoundedJson(request));
    if (!parsed.success) return validationError(["Enter a question of 3–1,800 characters and a valid conversation ID if continuing a chat."]);
    const { conversationId } = parsed.data;
    const question = redactSource(parsed.data.question);
    if (conversationId) {
      const [mine] = await db.select({ id: aiConversations.id }).from(aiConversations).where(ownedConversation(user, repository, conversationId)).limit(1);
      if (!mine) return notFound();
    }
    await enforceBudget("ai", user);
    await enforceBudget("ai-global");
    const lease = await acquireLease(`chat:${user}:${conversationId ?? repository}`, 65_000);
    if (!lease) return Response.json({ error: { kind: "rate_limited", message: "A question is already running in this conversation." } }, { status: 409 });

    const run = async (progress: (state: string) => void) => {
      try {
        const history = await chatHistory(db, user, repository, conversationId, 6);
        progress("Retrieving repository evidence…");
        const previous = history.filter((item) => item.role === "user").at(-1)?.content.slice(0, 260) ?? "";
        const sources = allowQuestion(question) ? await retrieveContext(ref, `${question}\n${previous}`, request.signal) : null;
        const { answer, cacheKey } = await answerQuestion(question, history, sources, usageFor(db, user), {
          signal: request.signal, progress, cachedAnswer: (key) => readCachedAnswer(db, user, repository, key),
        });
        request.signal.throwIfAborted();
        return await addChatTurn(db, user, repository, conversationId, question, answer, cacheKey);
      } finally { await lease.release(); }
    };

    if (request.headers.get("Accept")?.includes("application/x-ndjson")) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({ async start(controller) {
        const send = (event: object) => { if (!request.signal.aborted) { try { controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`)); } catch { /* client disconnected */ } } };
        try { send({ type: "result", ...await run((message) => send({ type: "progress", message })) }); }
        catch (error) { send({ type: "error", ...await fromError(error).json() }); }
        finally { try { controller.close(); } catch { /* client disconnected */ } }
      } });
      return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "private, no-store" } });
    }
    return ok(await run(() => undefined), { status: 201 });
  } catch (error) { return fromError(error); }
}

export async function DELETE(request: Request, context: Context) {
  const db = getDatabase(); if (!db) return noDb();
  try {
    const user = await currentUserId(); if (!user) return sessionRequired();
    const ref = await context.params; assertRef(ref);
    const id = idSchema.safeParse(new URL(request.url).searchParams.get("conversationId"));
    if (!id.success) return validationError(["Invalid conversation ID."]);
    const [deleted] = await db.delete(aiConversations).where(ownedConversation(user, repoKey(ref), id.data)).returning({ id: aiConversations.id });
    return deleted ? ok({ deleted: true }) : notFound();
  } catch (error) { return fromError(error); }
}

async function readBoundedJson(request: Request): Promise<unknown> {
  if (!request.body) return null;
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let length = 0, body = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return JSON.parse(body + decoder.decode());
      length += value.byteLength;
      if (length > 12_000) return null;
      body += decoder.decode(value, { stream: true });
    }
  } catch { return null; }
  finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
}
