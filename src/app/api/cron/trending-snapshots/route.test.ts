import { afterEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "./route";
import { GET as trending } from "../../trending/route";

afterEach(() => vi.unstubAllEnvs());
const secret = "test-only-cron-secret-32-characters";
const job = (value?: string) => new Request("https://repolens.test/api/cron/trending-snapshots", { headers: value ? { Authorization: `Bearer ${value}` } : {} });
describe("snapshot HTTP boundary", () => {
  it("rejects unset, missing, and incorrect secrets for both methods", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await GET(job(secret))).status).toBe(401);
    vi.stubEnv("CRON_SECRET", secret);
    expect((await POST(job())).status).toBe(401);
    expect((await POST(job("wrong"))).status).toBe(401);
    expect((await GET(job())).status).toBe(401);
  });
  it("checks credentials before reporting missing infrastructure", async () => {
    vi.stubEnv("CRON_SECRET", secret);
    expect((await POST(job(secret))).status).toBe(503);
  });
  it("validates trending inputs even without a database", async () => {
    expect((await trending(new Request("https://repolens.test/api/trending?limit=500"))).status).toBe(400);
    expect((await trending(new Request("https://repolens.test/api/trending"))).status).toBe(503);
  });
});
