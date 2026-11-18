"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Bot, Copy, ExternalLink, MessageSquareText, Plus, Trash2 } from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useAppConfig } from "@/components/app-providers";
import { Button } from "@/components/ui/button";
import { ErrorState, Notice } from "@/components/ui/state";
import { field, PageHeading, panel, workspace } from "@/components/ui/workspace";
import { ensureSession } from "@/lib/storage/session-client";
import { cn } from "@/lib/utils";
import type { AiCitation } from "@/lib/db/schema";

type Conversation = { id: string; title: string; updatedAt: string };
type ChatEntry = { id: number; role: "user" | "assistant"; content: string; citations: AiCitation[]; confidence: "confirmed" | "partial" | "insufficient" | null };
type Payload = { conversations?: Conversation[]; active?: string; entries?: ChatEntry[]; error?: { message?: string } };
type ChatEvent = { type: "progress"; message: string } | { type: "result"; entries: ChatEntry[]; conversation: Conversation } | { type: "error"; error: { message: string } };
const suggested = ["What does this project do?", "Where is authentication implemented?", "Explain the main application flow.", "How can I contribute to this project?"];

export function RepositoryChat({ endpoint }: { endpoint: string }) {
  const config = useAppConfig();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [active, setActive] = useState<string>();
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState<string>();
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!config.database) return;
    const controller = new AbortController();
    async function initialize() {
      try {
        if (!await ensureSession()) throw new Error("Could not start a workspace session.");
        const response = await fetch(endpoint, { signal: controller.signal });
        const data: Payload = await response.json();
        if (!response.ok) throw new Error(data.error?.message ?? "Could not load conversation history.");
        if (!controller.signal.aborted) { setConversations(data.conversations ?? []); setActive(data.active); setEntries(data.entries ?? []); setReady(true); }
      } catch (error) { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Could not load chat."); }
    }
    void initialize();
    return () => controller.abort();
  }, [config.database, endpoint]);

  async function openConversation(id: string) {
    if (!id) { setActive(undefined); setEntries([]); setError(""); setQuestion(""); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch(`${endpoint}?conversationId=${encodeURIComponent(id)}`);
      const data: Payload = await response.json();
      if (!response.ok) throw new Error(data.error?.message ?? "Could not open conversation.");
      setActive(data.active); setEntries(data.entries ?? []);
    } catch (error) { setError(error instanceof Error ? error.message : "Could not open conversation."); }
    finally { setBusy(false); }
  }

  async function clear() {
    if (!active || !window.confirm("Delete this conversation and its messages?")) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`${endpoint}?conversationId=${encodeURIComponent(active)}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Could not delete this conversation.");
      setConversations((old) => old.filter((item) => item.id !== active)); setActive(undefined); setEntries([]); setMessage("Conversation deleted.");
    } catch (error) { setError(error instanceof Error ? error.message : "Could not clear chat."); }
    finally { setBusy(false); }
  }

  async function send(event: React.FormEvent) {
    event.preventDefault();
    const text = question.trim();
    if (text.length < 3 || busy || !ready || !config.ai) return;
    setError(""); setMessage(""); setPending(text); setProgress("Starting analysis…"); setBusy(true); setQuestion("");
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" }, body: JSON.stringify({ question: text, conversationId: active }) });
      if (!response.ok || !response.body || !response.headers.get("content-type")?.includes("ndjson")) {
        const data: Payload | null = await response.json().catch(() => null);
        throw new Error(data?.error?.message ?? "Could not get an answer.");
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let partial = "", final = false;
      try {
        while (true) {
          const result = await reader.read();
          if (result.done) break;
          partial += decoder.decode(result.value, { stream: true });
          const lines = partial.split("\n"); partial = lines.pop() ?? "";
          for (const line of lines.filter(Boolean)) {
            const e: ChatEvent = JSON.parse(line);
            if (e.type === "progress") setProgress(e.message);
            if (e.type === "error") throw new Error(e.error.message);
            if (e.type === "result") {
              final = true;
              setActive(e.conversation.id);
              setEntries((old) => [...old, ...e.entries].slice(-60));
              setConversations((old) => [e.conversation, ...old.filter((item) => item.id !== e.conversation.id)].slice(0, 30));
            }
          }
        }
      } finally { reader.releaseLock(); }
      if (!final) throw new Error("The connection closed before the answer was verified.");
    } catch (error) { setError(error instanceof Error ? error.message : "Could not get an answer."); setQuestion(text); }
    finally { setPending(undefined); setBusy(false); setProgress(""); area.current?.focus(); }
  }

  return <div className={workspace}>
    <PageHeading eyebrow="Analyze / AI chat" title="Ask the codebase" description="Explore the repository with answers grounded in sampled files. Citations open the exact GitHub revision and lines used." icon={<MessageSquareText className="size-4" />} />
    {!config.database && <Notice tone="warning" className="mb-4">Chat needs PostgreSQL for private conversation history. You can still open the repository’s analysis and architecture tabs.</Notice>}
    {config.database && !config.ai && <Notice tone="warning" className="mb-4">An AI provider isn’t configured for this deployment. Previous conversations remain available.</Notice>}
    {error && <ErrorState compact title="Chat could not continue" message={error} className="mb-4" />}
    <div className="grid items-start gap-4 lg:grid-cols-[225px_minmax(0,1fr)]">
      <aside className={cn(panel, "space-y-3 p-3")} aria-label="Conversations">
        <Button variant="secondary" className="w-full justify-start" onClick={() => void openConversation("")} disabled={busy || !config.database}><Plus /> New conversation</Button>
        <div className="space-y-1"><p className="px-2 pt-1 text-xs font-semibold text-text-muted">History</p>{conversations.length ? conversations.map((item) => <button key={item.id} type="button" disabled={busy} aria-pressed={active === item.id} className={cn("block w-full truncate rounded-md px-2 py-2 text-left text-xs hover:bg-surface-hover", item.id === active ? "bg-accent-soft text-accent-hover" : "text-text-secondary")} onClick={() => void openConversation(item.id)} title={item.title}>{item.title}</button>) : <p className="px-2 py-2 text-xs text-text-muted">No conversations yet.</p>}</div>
        {active && <Button size="sm" variant="ghost" onClick={() => void clear()} disabled={busy}><Trash2 /> Delete conversation</Button>}
      </aside>
      <div className={cn(panel, "min-w-0 overflow-hidden")}>
        <div aria-live="polite" className="min-h-60 space-y-4 px-4 py-5 sm:px-6">
          {!entries.length && !pending && <div className="space-y-4 py-5"><div className="inline-flex rounded-lg bg-accent-soft p-2 text-accent-hover"><Bot className="size-6" /></div><h2 className="text-xl font-semibold">Understand what’s inside</h2><p className="text-sm text-text-secondary">Try a starting question or ask about a specific file or module.</p><div className="flex flex-wrap gap-2">{suggested.map((item) => <Button key={item} size="sm" variant="outline" className="h-auto min-h-8 whitespace-normal text-left" disabled={busy || !ready || !config.ai} onClick={() => { setQuestion(item); area.current?.focus(); }}>{item}</Button>)}</div></div>}
          {entries.map((entry) => entry.role === "user" ? <div key={entry.id} className="ml-auto max-w-[90%] whitespace-pre-wrap break-words rounded-xl bg-accent-soft px-4 py-2.5 text-sm">{entry.content}</div> : <article key={entry.id} className="min-w-0 rounded-xl border border-border-subtle bg-background/65 p-4">
            <div className="mb-2 flex items-center justify-between gap-2"><p className="flex items-center gap-1.5 text-xs font-semibold text-accent-hover"><Bot className="size-4" /> RepoLens AI <span className="text-text-muted">· {entry.confidence === "confirmed" ? "Cited evidence" : entry.confidence === "partial" ? "Partial evidence" : "Evidence insufficient"}</span></p><Button aria-label="Copy response" size="icon" variant="ghost" onClick={async () => { try { await navigator.clipboard.writeText(entry.content); setMessage("Response copied."); } catch { setMessage("Could not access the clipboard."); } }}><Copy /></Button></div>
            <div className="repolens-markdown break-words text-sm"><Markdown remarkPlugins={[remarkGfm]} skipHtml components={{ a: ({ children }) => <span>{children}</span>, img: () => null }}>{entry.content}</Markdown></div>
            {entry.citations.length > 0 && <ul className="mt-3 flex flex-wrap gap-1.5">{entry.citations.map((citation) => <li key={citation.id} className="min-w-0 max-w-full"><a className="inline-flex items-center gap-1.5 break-all rounded border border-border px-2 py-1 text-xs text-accent-hover hover:bg-surface-hover" target="_blank" rel="noreferrer" href={citation.url.startsWith("https://github.com/") ? citation.url : undefined}>[{citation.id}] {citation.path}:{citation.from}–{citation.to} <ExternalLink className="size-3 shrink-0" /></a></li>)}</ul>}
          </article>)}
          {pending && <><div className="ml-auto max-w-[90%] whitespace-pre-wrap break-words rounded-xl bg-accent-soft px-4 py-2.5 text-sm">{pending}</div><p className="flex items-center gap-2 text-sm text-text-secondary" role="status"><Bot className="size-4 animate-pulse text-accent-hover" />{progress}</p></>}
        </div>
        <form className="border-t border-border-subtle p-4" onSubmit={send}>
          <div className="flex items-end gap-2"><textarea ref={area} className={cn(field, "min-h-18 resize-y py-2")} aria-label="Ask a question" placeholder="Ask about a module, API route, or workflow…" maxLength={1800} value={question} onChange={(event) => setQuestion(event.target.value)} disabled={!ready || !config.ai || busy} /><Button aria-label="Send question" type="submit" variant="primary" size="icon" className="size-10" disabled={!ready || !config.ai || busy || question.trim().length < 3}><ArrowUp /></Button></div>
          <p className="mt-2 text-xs text-text-muted">Only bounded public excerpts are sent to the configured AI provider. Never enter credentials. Answers may be incomplete.</p>
          <p role="status" className="mt-1 text-xs text-success">{message}</p>
        </form>
      </div>
    </div>
  </div>;
}
