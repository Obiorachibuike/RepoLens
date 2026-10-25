import type { PerPage, SearchMode, SortOption } from "@/lib/validation/search";

export interface LocalPreferences {
  theme: "dark" | "light" | "system";
  defaultMode: SearchMode;
  defaultSort: SortOption;
  defaultPerPage: PerPage;
}

export const DEFAULT_PREFERENCES: LocalPreferences = {
  theme: "dark",
  defaultMode: "repository",
  defaultSort: "best-match",
  defaultPerPage: 20,
};

const KEY = "repolens:prefs";

export function readPreferences(): LocalPreferences {
  if (typeof window === "undefined") return DEFAULT_PREFERENCES;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<LocalPreferences>;
    return {
      theme: parsed.theme ?? DEFAULT_PREFERENCES.theme,
      defaultMode: parsed.defaultMode ?? DEFAULT_PREFERENCES.defaultMode,
      defaultSort: parsed.defaultSort ?? DEFAULT_PREFERENCES.defaultSort,
      defaultPerPage: parsed.defaultPerPage ?? DEFAULT_PREFERENCES.defaultPerPage,
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function writePreferences(preferences: LocalPreferences): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(preferences));
  } catch {
    /* storage unavailable — preferences simply will not persist */
  }
}

export function clearPreferences(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
