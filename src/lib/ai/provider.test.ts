// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { answerQuestion, estimateCost, promptVersion, validateAnswer } from "./provider";
import type { RepoContext } from "./context";

const revision = "a".repeat(40);
const citation = { id: "S1", path: "src/index.ts", from: 1, to: 2, url: `https://github.com/test/repo/blob/${revision}/src/index.ts#L1-L2` };
const context: RepoContext = { revision, partial: false, excerpts: [{ citation, text: "1: export function displayTitle() {\n2:   return 'Repo title'; }\n" }] };
const grounded = { answer: "The title comes from `displayTitle()` [S1].", citations: ["S1"], confidence: "confirmed" };
const hooks = () => ({ reserve: vi.fn(async () => "reservation"), complete: vi.fn(async () => undefined) });
const open = (value: object) => Response.json({ choices: [{ message: { content: JSON.stringify(value) }, finish_reason: "stop" }], usage: { prompt_tokens: 123, completion_tokens: 19 } });
const sse = (events: (object | "[DONE]")[]) => {
  const encoder = new TextEncoder();
  const buffer = encoder.encode(events.map((event) => `data: ${event === "[DONE]" ? event : JSON.stringify(event)}\r\n\r\n`).join(""));
  const stream = new ReadableStream({ start(controller) { for (let i = 0; i < buffer.length; i += 17) controller.enqueue(buffer.slice(i, i + 17)); controller.close(); } });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream" } });
};

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
beforeEach(() => {
  vi.stubEnv("AI_PROVIDER", "openai");
  vi.stubEnv("OPENAI_API_KEY", "local-test-token");
  vi.stubEnv("AI_MODEL", "gpt-4.1-mini");
  vi.stubEnv("AI_FALLBACK_PROVIDER", "");
  vi.stubEnv("AI_STREAM_UPSTREAM", "on");
});

describe("grounded model answers", () => {
  it("rejects nonexistent inline citations, missing citations and malformed output", () => {
    expect(() => validateAnswer(JSON.stringify({ ...grounded, answer: "Some unsupported claim [S9]" }), context)).toThrow();
    expect(() => validateAnswer(JSON.stringify({ ...grounded, answer: "Unsupported claim", citations: [] }), context)).toThrow();
    expect(() => validateAnswer("<not JSON>", context)).toThrow();
  });
  it("uses server-owned links and downgrades confidence for incomplete evidence", () => {
    expect(validateAnswer(JSON.stringify({ ...grounded, citations: ["S1", "S1"], url: "https://not-github.invalid/" }), { ...context, partial: true })).toEqual({ content: grounded.answer, citations: [citation], confidence: "partial" });
  });
  it("receives streamed chunks, records usage and releases only validated output", async () => {
    const body = JSON.stringify({ ...grounded, answer: "The title is ‘Repo title’ [S1]." });
    const fetcher = vi.fn(async () => sse([
      { choices: [{ delta: { content: body.slice(0, 23) }, finish_reason: null }] },
      { choices: [{ delta: { content: body.slice(23) }, finish_reason: "stop" }] },
      { choices: [], usage: { prompt_tokens: 90, completion_tokens: 21 } }, "[DONE]",
    ]));
    vi.stubGlobal("fetch", fetcher);
    const usage = hooks(), progress = vi.fn();
    const input = `What does this module return? const api_key = "${"not-a-real-key".repeat(3)}"`;
    const result = await answerQuestion(input, [], context, usage, { progress });
    expect(result.answer).toMatchObject({ content: "The title is ‘Repo title’ [S1].", citations: [citation] });
    expect(result.cacheKey).toMatch(/^[a-f0-9]{64}$/);
    expect(usage.complete).toHaveBeenCalledWith("reservation", "success", { inputTokens: 90, outputTokens: 21 }, null);
    expect(progress.mock.calls.some(([msg]) => msg.includes("Receiving"))).toBe(true);
    expect(JSON.stringify(progress.mock.calls)).not.toContain("Repo title");
    const [url, init] = (fetcher.mock.calls as unknown as [string, RequestInit][])[0]!;
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect(init).toMatchObject({ cache: "no-store", redirect: "error" });
    expect(JSON.parse(String(init.body))).toMatchObject({ stream: true, stream_options: { include_usage: true } });
    expect(init.body).not.toContain("not-a-real-key");
  });
  it("uses the configured fallback once after bad citations and tracks each provider attempt", async () => {
    vi.stubEnv("AI_FALLBACK_PROVIDER", "anthropic");
    vi.stubEnv("AI_FALLBACK_MODEL", "configured-fallback");
    vi.stubEnv("ANTHROPIC_API_KEY", "test-other-provider");
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(open({ ...grounded, citations: ["S2"] }))
      .mockResolvedValueOnce(sse([
        { type: "message_start", message: { usage: { input_tokens: 55, output_tokens: 0 } } },
        { type: "content_block_start", content_block: { type: "text", text: "" } },
        { type: "content_block_delta", delta: { type: "text_delta", text: JSON.stringify(grounded) } },
        { type: "content_block_stop" },
        { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 12 } },
        { type: "message_stop" },
      ]));
    vi.stubGlobal("fetch", fetcher);
    const usage = hooks();
    const result = await answerQuestion("Where is the title set?", [], context, usage);
    expect(result.answer.content).toBe(grounded.answer);
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual(["https://api.openai.com/v1/chat/completions", "https://api.anthropic.com/v1/messages"]);
    expect(usage.reserve).toHaveBeenNthCalledWith(2, "anthropic", "configured-fallback", promptVersion);
    expect(usage.complete).toHaveBeenNthCalledWith(1, "reservation", "failed", { inputTokens: 123, outputTokens: 19 }, null);
    expect(usage.complete).toHaveBeenNthCalledWith(2, "reservation", "success", { inputTokens: 55, outputTokens: 12 }, null);
  });
  it("keys the cache to evidence, prior turns and model settings; skips spending on hits", async () => {
    const fetcher = vi.fn(async () => open(grounded)); vi.stubGlobal("fetch", fetcher);
    const usage = hooks(), question = "Where does the title come from?";
    const first = await answerQuestion(question, [], context, usage);
    const lookup = vi.fn(async () => first.answer);
    const reused = await answerQuestion(question, [], context, usage, { cachedAnswer: lookup });
    expect(lookup).toHaveBeenCalledWith(first.cacheKey);
    expect(reused).toEqual({ answer: first.answer });
    expect(usage.reserve).toHaveBeenCalledTimes(1);
    const changed = await answerQuestion(question, [{ role: "user", content: "Only discuss desktop" }], context, usage);
    expect(changed.cacheKey).not.toBe(first.cacheKey);
    vi.stubEnv("AI_MODEL", "different-model");
    expect((await answerQuestion(question, [], context, usage)).cacheKey).not.toBe(first.cacheKey);
  });
  it("does not treat truncated streams as answers or spend on insufficient source", async () => {
    const fetcher = vi.fn(async () => sse([{ choices: [{ delta: { content: JSON.stringify(grounded) }, finish_reason: "stop" }] }]));
    vi.stubGlobal("fetch", fetcher);
    const usage = hooks();
    const insufficient = await answerQuestion("Which files are relevant?", [], null, usage);
    expect(insufficient.answer.confidence).toBe("insufficient"); expect(fetcher).not.toHaveBeenCalled();
    await expect(answerQuestion("Which file defines this?", [], context, usage)).rejects.toMatchObject({ kind: "unavailable" });
    expect(usage.complete).toHaveBeenCalledWith("reservation", "failed", { inputTokens: null, outputTokens: null }, null);
  });
  it("stops at the usage reservation limit and leaves unknown costs unknown", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    const usage = hooks(); usage.reserve.mockRejectedValueOnce(new Error("Daily cap"));
    await expect(answerQuestion("Which file defines this?", [], context, usage)).rejects.toThrow("Daily cap");
    expect(fetcher).not.toHaveBeenCalled();
    vi.stubEnv("OPENAI_INPUT_USD_PER_MTOK", "0.5"); vi.stubEnv("OPENAI_OUTPUT_USD_PER_MTOK", "2");
    expect(estimateCost("openai", { inputTokens: 500, outputTokens: 125 })).toBe(500);
    expect(estimateCost("openai", { inputTokens: null, outputTokens: 0 })).toBeNull();
  });
});
