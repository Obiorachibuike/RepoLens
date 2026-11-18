/** Server modules use this for bounded numeric configuration; empty means default. */
export function envInt(name: string, fallback: number, min: number, max: number): number {
  const value = process.env[name]?.trim();
  const parsed = value ? Number(value) : NaN;
  return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}
