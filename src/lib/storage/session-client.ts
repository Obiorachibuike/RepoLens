"use client";

// All browser providers share one first-use cookie request. Concurrent POSTs
// without a cookie would otherwise create different workspace identities.
let pending: Promise<boolean> | null = null;
export function ensureSession(): Promise<boolean> {
  if (!pending) {
    pending = fetch("/api/session", { method: "POST" }).then(async (response) => {
      if (!response.ok) return false;
      const body = await response.json() as { hasSession?: boolean };
      return body.hasSession === true;
    }).catch(() => false).then((ready) => {
      if (!ready) pending = null;
      return ready;
    });
  }
  return pending;
}
