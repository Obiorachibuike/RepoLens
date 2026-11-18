import "server-only";
import { timingSafeEqual } from "node:crypto";

export function hasBearer(request: Request, secret: string | undefined): boolean {
  if (!secret || secret.length < 16) return false;
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ") || header.length > 512) return false;
  const actual = Buffer.from(header.slice(7));
  const expected = Buffer.from(secret);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
