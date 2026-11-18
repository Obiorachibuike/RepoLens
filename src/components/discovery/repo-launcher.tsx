"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { field } from "@/components/ui/workspace";
import { repositoryInput, repoLensUrl } from "@/lib/validation/repository";

const tools = { health: ["Repository health", "/intelligence"], architecture: ["Architecture explorer", "/intelligence?view=architecture"], security: ["Security analysis", "/intelligence?view=security"], dependencies: ["Dependency intelligence", "/intelligence?view=dependencies"], quality: ["Code quality", "/intelligence?view=quality"], chat: ["AI repository chat", "/chat"], metadata: ["Metadata analysis", "/analyze"] } as const;
export function RepoLauncher({ initialTool, compact = false }: { initialTool?: string; compact?: boolean }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [tool, setTool] = useState<keyof typeof tools>(initialTool && Object.hasOwn(tools, initialTool) ? initialTool as keyof typeof tools : "health");
  const [value, setValue] = useState("");
  return <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); const repo = repositoryInput.safeParse(value); if (!repo.success) { setError(repo.error.issues[0]?.message ?? "Invalid repository."); return; } setError(""); router.push(`${repoLensUrl(repo.data)}${tools[tool][1]}`); }}>
    <label className="block space-y-2 text-xs font-medium text-text-secondary">Public GitHub repository<input className={field} value={value} onChange={(e) => setValue(e.target.value)} placeholder="owner/repository or GitHub URL" maxLength={240} required /></label>
    <div className="flex flex-wrap items-end gap-2 sm:flex-nowrap">{!compact && <label className="min-w-0 flex-1 space-y-2 text-xs font-medium text-text-secondary">Analysis tool<select className={field} value={tool} onChange={(e) => setTool(e.target.value as keyof typeof tools)}>{Object.entries(tools).map(([key, [label]]) => <option value={key} key={key}>{label}</option>)}</select></label>}<Button type="submit" variant="primary" className="h-10">{initialTool === "chat" && compact ? "Open chat" : "Open repository"}<ArrowRight /></Button></div>
    {error && <p role="alert" className="text-xs text-danger">{error}</p>}
  </form>;
}
