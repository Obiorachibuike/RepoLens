import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db/client";
import { isGithubAuthenticated } from "@/lib/github/client";

export const dynamic = "force-dynamic";

/**
 * Public, non-secret capability flags.
 *
 * Only booleans describing which *optional* features are configured are exposed —
 * never values. The client uses this to decide between server persistence and
 * local browser storage, and to explain missing optional features.
 */
export async function GET() {
  return NextResponse.json(
    {
      github: { authenticated: isGithubAuthenticated() },
      database: isDatabaseConfigured(),
      ai: Boolean(process.env.AI_API_KEY),
      codeSearch: isGithubAuthenticated(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
