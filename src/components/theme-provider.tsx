"use client";

import * as React from "react";

export type Theme = "dark" | "light" | "system";

const STORAGE_KEY = "repolens:theme";

interface ThemeContextValue {
  theme: Theme;
  resolved: "dark" | "light";
  setTheme: (theme: Theme) => void;
  cycleTheme: () => void;
}

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

function resolveTheme(theme: Theme): "dark" | "light" {
  if (theme === "system") {
    if (typeof window === "undefined" || !window.matchMedia) return "dark";
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }
  return theme;
}

function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  const resolved = resolveTheme(theme);
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.classList.toggle("light", resolved === "light");
  root.style.colorScheme = resolved;
}

export function ThemeProvider({
  children,
  initialTheme = "dark",
}: {
  children: React.ReactNode;
  initialTheme?: Theme;
}) {
  const [theme, setThemeState] = React.useState<Theme>(initialTheme);
  const [resolved, setResolved] = React.useState<"dark" | "light">(
    initialTheme === "light" ? "light" : "dark",
  );

  // Read the persisted preference once, after mount, to avoid hydration drift.
  React.useEffect(() => {
    let stored: Theme | null = null;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw === "dark" || raw === "light" || raw === "system") stored = raw;
    } catch {
      stored = null;
    }
    const next = stored ?? initialTheme;
    setThemeState(next);
    setResolved(resolveTheme(next));
    applyTheme(next);

    const media = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => {
      if ((stored ?? initialTheme) !== "system") return;
      const value = resolveTheme("system");
      setResolved(value);
      applyTheme("system");
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [initialTheme]);

  const setTheme = React.useCallback((next: Theme) => {
    setThemeState(next);
    setResolved(resolveTheme(next));
    applyTheme(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* storage may be unavailable (private mode) — theme still applies */
    }
  }, []);

  const cycleTheme = React.useCallback(() => {
    const order: Theme[] = ["dark", "light", "system"];
    const index = order.indexOf(theme);
    setTheme(order[(index + 1) % order.length] ?? "dark");
  }, [theme, setTheme]);

  const value = React.useMemo(
    () => ({ theme, resolved, setTheme, cycleTheme }),
    [theme, resolved, setTheme, cycleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = React.useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used inside <ThemeProvider>");
  return context;
}
