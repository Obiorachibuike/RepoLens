import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind classes with conflict resolution. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Compact number formatting that preserves the real value.
 * 850 -> "850", 12400 -> "12.4k", 37500 -> "37.5k", 1200000 -> "1.2m"
 */
export function formatCompact(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const abs = Math.abs(value);
  if (abs < 1000) return String(value);
  const units: Array<[number, string]> = [
    [1_000_000_000, "b"],
    [1_000_000, "m"],
    [1_000, "k"],
  ];
  for (const [size, suffix] of units) {
    if (abs >= size) {
      const scaled = value / size;
      const rounded = Math.abs(scaled) >= 100 ? Math.round(scaled) : Number(scaled.toFixed(1));
      return `${rounded}${suffix}`;
    }
  }
  return String(value);
}

/** Full, locale-formatted number — used in titles/aria labels so nothing is lost. */
export function formatExact(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "Not available";
  return new Intl.NumberFormat("en-US").format(value);
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "Not available";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Not available";
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "Not available";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Not available";
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "unknown";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "unknown";
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const units: Array<[number, string]> = [
    [31_536_000, "year"],
    [2_592_000, "month"],
    [604_800, "week"],
    [86_400, "day"],
    [3_600, "hour"],
    [60, "minute"],
  ];
  for (const [size, label] of units) {
    if (seconds >= size) {
      const value = Math.floor(seconds / size);
      return `${value} ${label}${value === 1 ? "" : "s"} ago`;
    }
  }
  return "just now";
}

export function daysBetween(fromIso: string | null | undefined, to: Date = new Date()): number | null {
  if (!fromIso) return null;
  const from = new Date(fromIso);
  if (Number.isNaN(from.getTime())) return null;
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / 86_400_000));
}

export function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function percentage(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 1000) / 10;
}

/** Deterministic, dependency-free hash — used for stable UI keys. */
export function stableId(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function titleCase(value: string): string {
  return value.replace(/(^|[\s-])(\p{L})/gu, (_m, sep: string, char: string) => sep + char.toUpperCase());
}
