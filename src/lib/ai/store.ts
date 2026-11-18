import "server-only";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import type { Database } from "@/lib/db/client";
import { aiConversations, aiMessages, analysisUsage } from "@/lib/db/schema";
import { envInt } from "@/lib/infra/config";
import { limitError } from "@/lib/infra/budget";
import { GithubApiError } from "@/lib/github/errors";
import { redactSource } from "@/lib/intelligence/redact";
import type { ChatAnswer, Provider, Usage } from "./provider";

export function ownedConversation(userId: string, repository: string, id: string) {
  return and(eq(aiConversations.id, id), eq(aiConversations.userId, userId), eq(aiConversations.repository, repository));
}

export async function chatHistory(db: Database, userId: string, repository: string, conversationId?: string, limit = 60) {
  if (!conversationId) return [];
  const rows = await db.select({ id: aiMessages.id, role: aiMessages.role, content: aiMessages.content, citations: aiMessages.citations, confidence: aiMessages.confidence, createdAt: aiMessages.createdAt })
    .from(aiMessages).innerJoin(aiConversations, eq(aiConversations.id, aiMessages.conversationId)).where(ownedConversation(userId, repository, conversationId)).orderBy(desc(aiMessages.id)).limit(limit);
  return rows.reverse();
}

// Query scope is enforced by a join to the owning conversation. No private
// prompts, history, or replies are sent to Redis or a CDN for caching.
const cacheSeconds = () => envInt("AI_ANSWER_CACHE_TTL", 900, 0, 3600);
const scopedKey = (user: string, repository: string, key: string) => createHash("sha256").update(JSON.stringify([user, repository, key])).digest("hex");

export async function readCachedAnswer(db: Database, user: string, repository: string, key: string): Promise<ChatAnswer | null> {
  const ttl = cacheSeconds();
  if (!ttl) return null;
  const [row] = await db.select({ content: aiMessages.content, citations: aiMessages.citations, confidence: aiMessages.confidence })
    .from(aiMessages).innerJoin(aiConversations, eq(aiConversations.id, aiMessages.conversationId))
    .where(and(eq(aiMessages.answerCacheKey, scopedKey(user, repository, key)), eq(aiMessages.role, "assistant"), eq(aiConversations.userId, user), eq(aiConversations.repository, repository), gte(aiMessages.createdAt, new Date(Date.now() - ttl * 1000))))
    .orderBy(desc(aiMessages.createdAt)).limit(1);
  return row?.confidence && row.confidence !== "insufficient" && row.citations.length ? { ...row, confidence: row.confidence } : null;
}

export async function addChatTurn(db: Database, user: string, repository: string, id: string | undefined, question: string, answer: ChatAnswer, cacheKey?: string) {
  // Redact all stored input and the title as well as sent excerpts.
  const safeQuestion = redactSource(question);
  return db.transaction(async (tx) => {
    const [conversation] = id ? await tx.update(aiConversations).set({ updatedAt: new Date() }).where(ownedConversation(user, repository, id)).returning()
      : await tx.insert(aiConversations).values({ userId: user, repository, title: safeQuestion.replace(/\s+/g, " ").slice(0, 90) }).returning();
    if (!conversation) throw new GithubApiError({ kind: "not_found", message: "Conversation not found." });
    const entries = await tx.insert(aiMessages).values([
      { conversationId: conversation.id, role: "user", content: safeQuestion },
      { conversationId: conversation.id, role: "assistant", content: redactSource(answer.content), citations: answer.citations, confidence: answer.confidence, ...(cacheKey && cacheSeconds() ? { answerCacheKey: scopedKey(user, repository, cacheKey) } : {}) },
    ]).returning({ id: aiMessages.id, role: aiMessages.role, content: aiMessages.content, citations: aiMessages.citations, confidence: aiMessages.confidence, createdAt: aiMessages.createdAt });
    return { conversation: { id: conversation.id, title: conversation.title, updatedAt: conversation.updatedAt }, entries };
  });
}

export const usageFor = (db: Database, userId: string) => ({
  async reserve(provider: Provider, model: string, promptVersion: string) {
    return db.transaction(async (tx) => {
      // A hard durable budget remains in force when Redis is unavailable. No
      // network call holds the lock. Reservations count even if a worker dies.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(761304121)`);
      const start = new Date(); start.setUTCHours(0, 0, 0, 0);
      const counts = await tx.execute<{ global_count: number; user_count: number }>(sql`SELECT count(*)::int AS global_count, count(*) FILTER (WHERE user_id = ${userId})::int AS user_count FROM analysis_usage WHERE created_at >= ${start.toISOString()}::timestamptz`);
      const totals = counts.rows[0];
      if (!totals || totals.global_count >= envInt("AI_DAILY_GLOBAL_ATTEMPTS", 160, 1, 10000) || totals.user_count >= envInt("AI_DAILY_SESSION_ATTEMPTS", 24, 1, 500)) {
        throw limitError((start.getTime() + 86400_000 - Date.now()) / 1000, "The daily AI budget has been reached. Try again after midnight UTC.");
      }
      const [row] = await tx.insert(analysisUsage).values({ userId, provider, model, promptVersion }).returning({ id: analysisUsage.id });
      if (!row) throw new Error("AI reservation failed");
      return row.id;
    });
  },
  async complete(id: string, state: "success" | "failed", usage: Usage, costMicros: number | null) {
    await db.update(analysisUsage).set({ state, ...usage, costMicros }).where(and(eq(analysisUsage.id, id), eq(analysisUsage.userId, userId)));
  },
});
