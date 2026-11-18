// @vitest-environment node
import { readFile } from "node:fs/promises";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "@/lib/db/schema";
import type { Database } from "@/lib/db/client";
import { addChatTurn, chatHistory, readCachedAnswer, usageFor } from "@/lib/ai/store";
import { addWatch, listWatchlist } from "./watch-store";
import { summarizeUsage } from "./usage";
import { GET as getChat, POST as postChat, DELETE as deleteChat } from "@/app/api/repositories/[owner]/[repo]/chat/route";
import { GET as getUsage } from "@/app/api/usage/route";
import { DELETE as stopWatch, PATCH as changeWatch } from "@/app/api/watchlist/route";
import { POST as collect } from "@/app/api/cron/trending-snapshots/route";
import { rawRepository } from "@/test-utils/fixtures";
import { GET as getDiagnostics } from "@/app/api/admin/diagnostics/route";

const state = vi.hoisted(() => ({ retrieve: vi.fn(), database: null as Database | null, user: null as string | null, probe: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ getDatabase: () => state.database, checkDatabase: state.probe }));
vi.mock("@/lib/session", () => ({ currentUserId: async () => state.user }));
vi.mock("@/lib/ai/context", () => ({ retrieveContext: state.retrieve }));

const pg = new PGlite({ extensions: { pgcrypto } });
const db = drizzle(pg, { schema }) as unknown as Database;
const context = { params: Promise.resolve({ owner: "test", repo: "project" }) };
const repository = "test/project";
const base = "http://localhost/api";
const chat = `${base}/repositories/${repository}/chat`;
let firstUser: string, otherUser: string, trackedId: string;

beforeAll(async () => {
  await pg.exec(await readFile("drizzle/0000_init.sql", "utf8"));
  const first = await pg.query<{ id: string }>("INSERT INTO users(anonymous_key) VALUES ('existing-workspace') RETURNING id");
  firstUser = first.rows[0]!.id;
  await pg.query("UPDATE users SET preferences = preferences || $2::jsonb WHERE id = $1", [firstUser, '{"theme":"light"}']);
  for (const file of ["0001_repository_tracking", "0002_workspace_intelligence", "0003_private_chat_cache_and_watch_probes"]) await pg.exec(await readFile(`drizzle/${file}.sql`, "utf8"));
  otherUser = (await pg.query<{ id: string }>("INSERT INTO users(anonymous_key) VALUES ('separate-workspace') RETURNING id")).rows[0]!.id;
  trackedId = (await pg.query<{ id: string }>(`INSERT INTO tracked_repositories(github_repository_id,owner,name,full_name,repository_url,current_stars,current_forks,open_issues)
    VALUES (52,'test','project','test/project','https://github.com/test/project',5,0,0) RETURNING id`)).rows[0]!.id;
  state.database = db;
}, 20_000);
afterAll(async () => { await pg.close(); });
beforeEach(() => { state.database = db; state.user = null; state.probe.mockReset(); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

const citation = { id: "S1", path: "index.ts", from: 2, to: 4, url: `https://github.com/${repository}/blob/${"a".repeat(40)}/index.ts#L2-L4` };
const answer = { content: "The handler reads in the specified configuration [S1].", citations: [citation], confidence: "confirmed" as const };

describe("workspace migrations and authorization", () => {
  it("preserves preexisting preference rows", async () => {
    expect(await pg.query("SELECT preferences->>'theme' AS theme FROM users WHERE id = $1", [firstUser])).toMatchObject({ rows: [{ theme: "light" }] });
  });
  it("gates private reads and writes without a persisted session", async () => {
    const responses = await Promise.all([getChat(new Request(chat), context), postChat(new Request(chat, { method: "POST" }), context), getUsage()]);
    expect(responses.map((res) => res.status)).toEqual([401, 401, 401]);
    expect(responses.every((res) => res.headers.get("cache-control") === "no-store")).toBe(true);
  });
  it("reads, reuses and deletes messages only for the matching owner and repository", async () => {
    const key = "bounded-cache-content-id";
    const secretLike = `ghp_${"A".repeat(34)}`;
    const { conversation } = await addChatTurn(db, firstUser, repository, undefined, `Why is ${secretLike} in the config?`, answer, key);
    const chatUrl = `${chat}?conversationId=${conversation.id}`;
    state.user = otherUser;
    expect((await getChat(new Request(chatUrl), context)).status).toBe(404);
    expect((await deleteChat(new Request(chatUrl, { method: "DELETE" }), context)).status).toBe(404);
    expect(await readCachedAnswer(db, otherUser, repository, key)).toBeNull();
    expect(await readCachedAnswer(db, firstUser, "test/other", key)).toBeNull();
    state.user = firstUser;
    const read = await getChat(new Request(chatUrl), context);
    expect(read.status).toBe(200); expect(read.headers.get("cache-control")).toBe("no-store");
    const body = await read.text(); expect(body).toContain("REDACTED"); expect(body).not.toContain(secretLike);
    expect(await readCachedAnswer(db, firstUser, repository, key)).toEqual(answer);
    expect((await deleteChat(new Request(chatUrl, { method: "DELETE" }), context)).status).toBe(200);
    expect(await chatHistory(db, firstUser, repository, conversation.id)).toEqual([]);
    expect(await readCachedAnswer(db, firstUser, repository, key)).toBeNull();
  });
  it("does not reuse expired answers or return global usage on a user route", async () => {
    const { conversation } = await addChatTurn(db, firstUser, repository, undefined, "Which config?", answer, "expired");
    await pg.query("UPDATE ai_messages SET created_at = now() - interval '1 hour' WHERE conversation_id=$1", [conversation.id]);
    expect(await readCachedAnswer(db, firstUser, repository, "expired")).toBeNull();
    await pg.exec("DELETE FROM analysis_usage"); // Isolate the aggregate from other integration tests.
    const firstUsage = usageFor(db, firstUser);
    const id = await firstUsage.reserve("openai", "test-model", "test-version");
    await firstUsage.complete(id, "success", { inputTokens: 6, outputTokens: 3 }, 20);
    await usageFor(db, otherUser).reserve("anthropic", "other-model", "test-version");
    state.user = firstUser;
    const response = await getUsage(); expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ last30Days: { attempts: 1, successes: 1, input: 6, output: 3, costMicros: 20 } });
    expect(await summarizeUsage(db)).toMatchObject({ attempts: 2, pending: 1 });
    vi.stubEnv("AI_DAILY_SESSION_ATTEMPTS", "1");
    await expect(firstUsage.reserve("openai", "test-model", "test-version")).rejects.toMatchObject({ kind: "rate_limited" });
  });
  it("streams progress, then stores and reuses a validated result only in the owning workspace", async () => {
    vi.stubEnv("AI_PROVIDER", "openai"); vi.stubEnv("OPENAI_API_KEY", "test-only-model-credential");
    state.retrieve.mockResolvedValue({ revision: "a".repeat(40), partial: false, excerpts: [{ citation, text: "2: export const config = {};" }] });
    const fetcher = vi.fn(async () => Response.json({ choices: [{ message: { content: JSON.stringify({ answer: answer.content, citations: ["S1"], confidence: "confirmed" }) } }] }));
    vi.stubGlobal("fetch", fetcher);
    const start = () => postChat(new Request(chat, { method: "POST", headers: { Accept: "application/x-ndjson" }, body: JSON.stringify({ question: "Which config does this use?" }) }), context);
    state.user = firstUser;
    const first = await start();
    expect(first.headers.get("content-type")).toContain("application/x-ndjson");
    const events = (await first.text()).trim().split("\n").map((line) => JSON.parse(line));
    expect(events[0]).toMatchObject({ type: "progress" });
    expect(events.at(-1)).toMatchObject({ type: "result", entries: [{ role: "user" }, { role: "assistant", citations: [citation] }] });
    expect(await (await start()).text()).toContain("Reusing a verified response from your workspace");
    expect(fetcher).toHaveBeenCalledTimes(1);
    state.user = otherUser;
    const separate = await (await start()).text();
    expect(separate).not.toContain("Reusing a verified response from your workspace");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("does not check diagnostics or reveal any data until bearer authorization succeeds", async () => {
    vi.stubEnv("DIAGNOSTICS_SECRET", "test-operator-credential");
    for (const token of ["", "Bearer test-operator-credentiaL", "Basic test-operator-credential"]) {
      const result = await getDiagnostics(new Request(`${base}/admin/diagnostics`, { headers: { Authorization: token } }));
      expect(result.status).toBe(401);
    }
    expect(state.probe).not.toHaveBeenCalled();
    state.probe.mockResolvedValue({ configured: false, connected: false });
    const result = await getDiagnostics(new Request(`${base}/admin/diagnostics`, { headers: { Authorization: "Bearer test-operator-credential" } }));
    expect(result.status).toBe(200); expect(result.headers.get("cache-control")).toBe("no-store");
    expect(await result.text()).not.toContain("test-operator-credential");
  });
});

describe("Watchtower data and preferences", () => {
  it("derives change records without alerts from missing readings and rejects other users' writes", async () => {
    const watch = await addWatch(db, firstUser, trackedId);
    expect(await addWatch(db, firstUser, trackedId)).toBe(watch);
    const values = [[10, false, '{"release":"v1"}', "2026-01-01T06:00Z"], [10, false, '{}', "2026-01-02T06:00Z"], [12, true, '{"release":"v2"}', "2026-01-03T06:00Z"]];
    for (const [stars, archived, signals, at] of values) await pg.query(`INSERT INTO repository_snapshots(tracked_repository_id,stars,forks,open_issues,archived,signals,captured_at,collection_slot)
      VALUES($1,$2,0,0,$3,$4,$5,date_trunc('hour',$5::timestamptz))`, [trackedId, stars, archived, signals, at]);
    await pg.query("UPDATE repository_watchlists SET seen_at='2026-01-01T00:00Z' WHERE id=$1", [watch]);
    const makePatch = (patch: object) => new Request(`${base}/watchlist`, { method: "PATCH", body: JSON.stringify({ id: watch, ...patch }) });
    const makeDelete = () => new Request(`${base}/watchlist?id=${watch}`, { method: "DELETE" });
    state.user = otherUser;
    expect(await listWatchlist(db, otherUser)).toEqual([]);
    expect((await changeWatch(makePatch({ markRead: true }))).status).toBe(404);
    expect((await stopWatch(makeDelete())).status).toBe(404);
    const [item] = await listWatchlist(db, firstUser);
    expect(item?.preferences.advisories).toBe(true);
    expect(item?.events).toHaveLength(1);
    expect(item?.events[0]?.changes.map((change) => change.category)).toEqual(["stars", "releases", "archived"]);
    expect(item?.unread).toBe(1);
    state.user = firstUser;
    expect((await changeWatch(makePatch({ markRead: true, preferences: { stars: false } }))).status).toBe(200);
    const [updated] = await listWatchlist(db, firstUser);
    expect(updated?.unread).toBe(0);
    expect(updated?.events[0]?.changes.map((change) => change.category)).toEqual(["releases", "archived"]);
    expect((await stopWatch(makeDelete())).status).toBe(200);
  });
});

it("collects and deduplicates observations, including archived watched repositories", async () => {
  await addWatch(db, firstUser, trackedId);
  await pg.query("UPDATE tracked_repositories SET archived = true, next_check_at = now() - interval '1 hour' WHERE id = $1", [trackedId]);
  vi.stubEnv("GITHUB_TOKEN", "test-only-github-credential"); vi.stubEnv("CRON_SECRET", "test-only-job-credential");
  let started!: () => void, unblock!: () => void;
  const seeingDetail = new Promise<void>((resolve) => { started = resolve; });
  const holdingDetail = new Promise<void>((resolve) => { unblock = resolve; });
  const fetcher = vi.fn(async (input: string) => {
    const { pathname } = new URL(input); expect(new URL(input).hostname).toBe("api.github.com");
    if (pathname === "/search/repositories") return Response.json({ items: [] });
    if (pathname === "/repos/test/project") {
      started(); await holdingDetail;
      return Response.json({ ...rawRepository, id: 52, full_name: repository, name: "project", owner: { login: "test" }, stargazers_count: 145, archived: false });
    }
    if (pathname.endsWith("/commits")) return Response.json([{ sha: "b".repeat(40) }]);
    if (pathname.endsWith("/releases")) return Response.json([{ tag_name: "v3" }]);
    return Response.json([]);
  });
  vi.stubGlobal("fetch", fetcher);
  const jobRequest = () => new Request(`${base}/cron/trending-snapshots`, { method: "POST", headers: { Authorization: "Bearer test-only-job-credential" } });
  const first = collect(jobRequest());
  try { await seeingDetail; expect((await collect(jobRequest())).status).toBe(202); }
  finally { unblock(); }
  expect(await (await first).json()).toMatchObject({ state: "success", collected: 1, failed: 0 });
  expect(await (await collect(jobRequest())).json()).toMatchObject({ collected: 0 });
  const { rows } = await pg.query<{ stars: number; signals: object }>("SELECT stars, signals FROM repository_snapshots WHERE tracked_repository_id=$1 AND captured_at > now() - interval '1 minute'", [trackedId]);
  expect(rows).toMatchObject([{ stars: 145, signals: { head: "b".repeat(40), release: "v3" } }]);
  const [item] = await listWatchlist(db, firstUser);
  expect(item).toMatchObject({ archived: false, status: "active", lastProbe: expect.any(String) });
}, 12_000);
