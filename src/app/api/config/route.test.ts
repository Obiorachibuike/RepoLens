import { afterEach, describe, expect, it } from "vitest";
import { GET as getConfig } from "./route";
import { isDatabaseConfigured } from "@/lib/db/client";

describe("GET /api/config", () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
  });

  it("exposes only booleans about optional features", async () => {
    delete process.env.GITHUB_TOKEN;
    delete process.env.DATABASE_URL;
    delete process.env.AI_API_KEY;

    const response = await getConfig();
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toEqual({
      github: { authenticated: false },
      database: false,
      ai: false,
      codeSearch: false,
    });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("reports configured integrations without echoing their values", async () => {
    process.env.GITHUB_TOKEN = "ghs_supersecretvalue";
    process.env.DATABASE_URL = "postgresql://user:secret@localhost:5432/repolens";
    process.env.AI_API_KEY = "ai_supersecretvalue";

    const response = await getConfig();
    const text = await response.text();
    const body = JSON.parse(text) as Record<string, unknown>;
    expect(body).toEqual({
      github: { authenticated: true },
      database: true,
      ai: true,
      codeSearch: true,
    });
    expect(isDatabaseConfigured()).toBe(true);
    // No credential material may appear in the response.
    expect(text).not.toContain("ghs_supersecretvalue");
    expect(text).not.toContain("ai_supersecretvalue");
    expect(text).not.toContain("postgresql://");
  });
});
