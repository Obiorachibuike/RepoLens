import "server-only";
import { z } from "zod";
import type { Provider, Usage } from "./provider";

export const tokenCount = z.number().int().min(0).max(1_000_000).nullish();
export const openAiUsage = z.object({ prompt_tokens: tokenCount, completion_tokens: tokenCount });
export const anthropicUsage = z.object({ input_tokens: tokenCount, output_tokens: tokenCount });

const openFrame = z.object({
  choices: z.array(z.object({ delta: z.object({ content: z.string().nullish() }), finish_reason: z.string().nullish() })).max(1),
  usage: openAiUsage.nullish(),
});
const anthropicFrame = z.discriminatedUnion("type", [
  z.object({ type: z.literal("message_start"), message: z.object({ usage: anthropicUsage.optional() }) }),
  z.object({ type: z.literal("content_block_start"), content_block: z.object({ type: z.string(), text: z.string().optional() }) }),
  z.object({ type: z.literal("content_block_delta"), delta: z.object({ type: z.string(), text: z.string().optional() }) }),
  z.object({ type: z.literal("content_block_stop") }),
  z.object({ type: z.literal("message_delta"), delta: z.object({ stop_reason: z.string().nullish() }), usage: anthropicUsage.optional() }),
  z.object({ type: z.literal("message_stop") }),
  z.object({ type: z.literal("ping") }),
  z.object({ type: z.literal("error") }),
]);

/** Consume provider SSE, not arbitrary links or tools. Never forward unverified text. */
export async function readCompletionStream(response: Response, provider: Provider, onReceiving?: () => void) {
  if (!response.body) throw new Error("Missing AI stream");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const usage: Usage = { inputTokens: null, outputTokens: null };
  let buffer = "", payload = "", text = "", bytes = 0, completed = false, finish: string | null = null;
  function append(delta: string | null | undefined) {
    if (!delta) return;
    if (!text) onReceiving?.();
    text += delta;
    if (text.length > 32_000) throw new Error("AI stream exceeded its output limit");
  }
  function event(data: string) {
    if (provider === "openai") {
      if (data === "[DONE]") { completed = true; return; }
      const frame = openFrame.parse(JSON.parse(data));
      append(frame.choices[0]?.delta.content);
      finish = frame.choices[0]?.finish_reason ?? finish;
      if (frame.usage) { usage.inputTokens = frame.usage.prompt_tokens ?? null; usage.outputTokens = frame.usage.completion_tokens ?? null; }
      return;
    }
    const frame = anthropicFrame.parse(JSON.parse(data));
    switch (frame.type) {
      case "message_start":
        usage.inputTokens = frame.message.usage?.input_tokens ?? null;
        usage.outputTokens = frame.message.usage?.output_tokens ?? null;
        break;
      case "content_block_start": if (frame.content_block.type === "text") append(frame.content_block.text); break;
      case "content_block_delta": if (frame.delta.type === "text_delta") append(frame.delta.text); break;
      case "message_delta":
        finish = frame.delta.stop_reason ?? finish;
        usage.inputTokens = frame.usage?.input_tokens ?? usage.inputTokens;
        usage.outputTokens = frame.usage?.output_tokens ?? usage.outputTokens;
        break;
      case "message_stop": completed = true; break;
      case "error": throw new Error("AI stream reported a provider error");
    }
  }
  try {
    while (!completed) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 256_000) throw new Error("AI stream exceeded its transport limit");
      buffer += decoder.decode(value, { stream: true });
      for (let newline = buffer.indexOf("\n"); newline !== -1 && !completed; newline = buffer.indexOf("\n")) {
        const line = buffer.slice(0, newline).replace(/\r$/, "");
        buffer = buffer.slice(newline + 1);
        if (line.startsWith("data:")) payload += `${payload ? "\n" : ""}${line.slice(5).trimStart()}`;
        else if (line === "" && payload) { const data = payload; payload = ""; event(data); }
      }
    }
    if (!completed) throw new Error("AI stream closed before completion");
    return { text: finish === (provider === "openai" ? "stop" : "end_turn") ? text : "", usage };
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
