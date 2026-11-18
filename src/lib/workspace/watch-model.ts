import { z } from "zod";
import type { WatchPreferences, WatchSignals } from "@/lib/db/schema";

export const watchLabels = { stars: "Stars", issues: "Open issues & PRs", releases: "Release", commits: "Default branch commit", contributors: "Contributor sample", dependencies: "Root dependency manifests", advisories: "Advisory matches", archived: "Archival status" } satisfies Record<keyof WatchPreferences, string>;
export const watchPreferencesSchema = z.object({ stars: z.boolean(), issues: z.boolean(), releases: z.boolean(), commits: z.boolean(), contributors: z.boolean(), dependencies: z.boolean(), advisories: z.boolean(), archived: z.boolean() }).partial().strict();
export type WatchSnapshot = { capturedAt: string; stars: number; issues: number; archived: boolean; signals: WatchSignals };
export type WatchEvent = { at: string; changes: { category: keyof WatchPreferences; label: string; before: string; after: string }[]; unread: boolean };
export type WatchItem = { id: string; owner: string; name: string; url: string; archived: boolean; status: string; lastChecked: string | null; nextCheck: string; seenAt: string; preferences: WatchPreferences; events: WatchEvent[]; unread: number };

export function deriveWatchEvents(snapshots: WatchSnapshot[], prefs: WatchPreferences, seenAt: string): WatchEvent[] {
  const prior = new Map<keyof WatchPreferences, string>();
  const events: WatchEvent[] = [];
  for (const observed of [...snapshots].reverse()) {
    const measured: Partial<Record<keyof WatchPreferences, string>> = {
      stars: String(observed.stars), issues: String(observed.issues), archived: observed.archived ? "Archived" : "Active",
      releases: observed.signals.release, commits: observed.signals.head?.slice(0, 12), contributors: observed.signals.contributorSample?.slice(0, 8), dependencies: observed.signals.manifestFingerprint?.slice(0, 8), advisories: observed.signals.advisories,
    };
    const changes: WatchEvent["changes"] = [];
    for (const category of Object.keys(watchLabels) as (keyof WatchPreferences)[]) {
      const before = prior.get(category), after = measured[category];
      if (after === undefined) continue; // Don't interpret an unavailable reading as a change.
      if (before !== undefined && before !== after && prefs[category]) changes.push({ category, label: watchLabels[category], before, after });
      prior.set(category, after);
    }
    if (changes.length) events.push({ at: observed.capturedAt, changes, unread: Date.parse(observed.capturedAt) > Date.parse(seenAt) });
  }
  return events.reverse();
}
