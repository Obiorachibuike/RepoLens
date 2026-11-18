"use client";
import { useState } from "react";
import { ArrowRight, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { field, panel } from "@/components/ui/workspace";
import { categories, recommendationProfile, type RecommendationProfile } from "@/lib/discovery/filters";
import { ensureSession } from "@/lib/storage/session-client";
import { cn } from "@/lib/utils";

export function RecommendationForm({ profile, persisted }: { profile: RecommendationProfile; persisted: boolean }) {
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  return <form action="/recommendations" className={cn(panel, "p-4")}>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <label className="space-y-2 text-xs font-medium text-text-secondary">Interest<select name="category" className={field} defaultValue={profile.category}>{Object.entries(categories).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label>
      <label className="space-y-2 text-xs font-medium text-text-secondary">Language<input name="language" maxLength={45} className={field} defaultValue={profile.language} placeholder="Infer from workspace" /></label>
      <label className="space-y-2 text-xs font-medium text-text-secondary">Framework or GitHub topic<input name="technology" maxLength={45} className={field} defaultValue={profile.technology} placeholder="e.g. nextjs or django" /></label>
      <label className="space-y-2 text-xs font-medium text-text-secondary">Skill level<select name="skill" className={field} defaultValue={profile.skill}><option value="all">All levels</option><option value="beginner">Beginner</option><option value="experienced">Experienced</option></select></label>
    </div>
    <div className="mt-3 flex flex-wrap items-center gap-2"><Button type="submit" variant="primary">Apply preferences <ArrowRight /></Button>{persisted && <Button variant="outline" disabled={saving} onClick={async (e) => {
      const form = e.currentTarget.form;
      if (!form) return;
      const validated = recommendationProfile.safeParse(Object.fromEntries(new FormData(form)));
      if (!validated.success) { setStatus("Check language and GitHub topic format."); return; }
      setSaving(true); setStatus("");
      try {
        if (!await ensureSession()) throw new Error("Could not start a workspace session.");
        const response = await fetch("/api/preferences", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recommendations: validated.data }) });
        if (!response.ok) throw new Error("Could not save preferences.");
        setStatus("Preferences saved for this workspace.");
      } catch (error) { setStatus(error instanceof Error ? error.message : "Could not save preferences."); }
      finally { setSaving(false); }
    }}><Save /> Save preferences</Button>}<span role="status" className="text-xs text-text-muted">{status}</span></div>
  </form>;
}
