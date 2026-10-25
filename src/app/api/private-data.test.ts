import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Private-data contract, shared by every personal resource:
 *  - no DATABASE_URL  -> 503 with an explanation (the client falls back to localStorage)
 *  - no session       -> 401 telling the client to POST /api/session first
 *  - authenticated    -> data scoped to that visitor only
 */

const listSaved = vi.fn(async (_userId: string) => [{ id: "saved-1", full_name: "facebook/react" }]);
const listCollections = vi.fn(async (_userId: string) => [{ id: "collection-1", name: "AI" }]);
const listHistory = vi.fn(async (_userId: string, _limit: number) => [{ id: "history-1", query: "react" }]);
const getPreferences = vi.fn(async (_userId: string) => ({ theme: "dark" }));
const currentUserId = vi.fn(async (_override?: string | null) => null as string | null);

vi.mock("@/lib/db/queries", () => ({
  listSaved: (userId: string) => listSaved(userId),
  listCollections: (userId: string) => listCollections(userId),
  listHistory: (userId: string, limit: number) => listHistory(userId, limit),
  getPreferences: (userId: string) => getPreferences(userId),
}));

vi.mock("@/lib/session", () => ({
  currentUserId: () => currentUserId(),
}));

import { GET as getSaved } from "@/app/api/saved/route";
import { GET as getCollections } from "@/app/api/collections/route";
import { GET as getHistory } from "@/app/api/history/route";
import { GET as getPreferencesRoute } from "@/app/api/preferences/route";

const request = () => new Request("http://localhost/api/history?limit=30");

const routes = [
  { name: "/api/saved", call: () => getSaved(), probe: listSaved },
  { name: "/api/collections", call: () => getCollections(), probe: listCollections },
  { name: "/api/history", call: () => getHistory(request()), probe: listHistory },
  { name: "/api/preferences", call: () => getPreferencesRoute(), probe: getPreferences },
] as const;

beforeEach(() => {
  vi.clearAllMocks();
  currentUserId.mockResolvedValue(null);
  delete process.env.DATABASE_URL;
});

afterEach(() => {
  delete process.env.DATABASE_URL;
});

describe("private resources without DATABASE_URL", () => {
  it.each(routes.map((route) => [route.name, route] as const))(
    "%s explains that server persistence is not configured",
    async (_name, route) => {
      const response = await route.call();
      expect(response.status).toBe(503);
      const body = (await response.json()) as { error: { kind: string; message: string } };
      expect(body.error.kind).toBe("unavailable");
      expect(body.error.message).toMatch(/DATABASE_URL is not set/);
      expect(body.error.message).toMatch(/in the browser only/);
      expect(route.probe).not.toHaveBeenCalled();
    },
  );
});

describe("private resources with DATABASE_URL but no session", () => {
  beforeEach(() => {
    process.env.DATABASE_URL = "postgresql://user@localhost:5432/repolens";
  });

  it.each(routes.map((route) => [route.name, route] as const))(
    "%s requires a session before touching data",
    async (_name, route) => {
      const response = await route.call();
      expect(response.status).toBe(401);
      const body = (await response.json()) as { error: { kind: string; message: string } };
      expect(body.error.kind).toBe("unauthorized");
      expect(body.error.message).toMatch(/POST \/api\/session/);
      expect(route.probe).not.toHaveBeenCalled();
    },
  );
});

describe("private resources with a session", () => {
  beforeEach(() => {
    process.env.DATABASE_URL = "postgresql://user@localhost:5432/repolens";
    currentUserId.mockResolvedValue("user-1");
  });

  it("returns only that visitor's saved repositories", async () => {
    const response = await getSaved();
    expect(response.status).toBe(200);
    const body = (await response.json()) as { items: unknown[]; configured: boolean };
    expect(body.items).toHaveLength(1);
    expect(body.configured).toBe(true);
    expect(listSaved).toHaveBeenCalledWith("user-1");
  });

  it("returns only that visitor's collections", async () => {
    const response = await getCollections();
    expect(response.status).toBe(200);
    expect(listCollections).toHaveBeenCalledWith("user-1");
  });

  it("returns only that visitor's history", async () => {
    const response = await getHistory(request());
    expect(response.status).toBe(200);
    expect(listHistory).toHaveBeenCalledWith("user-1", 30);
  });

  it("returns only that visitor's preferences", async () => {
    const response = await getPreferencesRoute();
    expect(response.status).toBe(200);
    expect(getPreferences).toHaveBeenCalledWith("user-1");
  });
});
