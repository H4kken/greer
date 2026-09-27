import { describe, expect, it } from "vitest";
import { createHttpClient, SourceHttpError, USER_AGENT } from "./http";

function scripted(statuses: number[], headers: Record<string, string> = {}) {
  const seen: RequestInit[] = [];
  let i = 0;
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    seen.push(init);
    const status = statuses[Math.min(i++, statuses.length - 1)]!;
    return new Response(status === 200 ? '{"ok":true}' : "", {
      status,
      headers,
    });
  }) as unknown as typeof fetch;
  return { fetchImpl, seen };
}

describe("source HTTP client", () => {
  it("sends the Greer User-Agent", async () => {
    const { fetchImpl, seen } = scripted([200]);
    await createHttpClient({ fetchImpl, sleep: async () => {} }).getJson(
      "https://x.test/a",
    );
    expect((seen[0]!.headers as Record<string, string>)["User-Agent"]).toBe(
      USER_AGENT,
    );
  });

  it("retries rate limits, honoring Retry-After", async () => {
    const sleeps: number[] = [];
    const { fetchImpl } = scripted([429, 200], { "retry-after": "7" });
    const http = createHttpClient({
      fetchImpl,
      minIntervalMs: 0,
      sleep: async (ms) => void sleeps.push(ms),
    });
    expect(await http.getJson("https://x.test/a")).toEqual({ ok: true });
    expect(sleeps).toContain(7000);
  });

  it("gives up after the retry limit and doesn't retry client errors", async () => {
    const opts = { minIntervalMs: 0, retries: 2, sleep: async () => {} };
    const failing = scripted([503]);
    await expect(
      createHttpClient({ ...opts, fetchImpl: failing.fetchImpl }).getJson(
        "https://x.test/a",
      ),
    ).rejects.toBeInstanceOf(SourceHttpError);
    expect(failing.seen).toHaveLength(3);

    const notFound = scripted([404]);
    await expect(
      createHttpClient({ ...opts, fetchImpl: notFound.fetchImpl }).getJson(
        "https://x.test/a",
      ),
    ).rejects.toThrow("HTTP 404");
    expect(notFound.seen).toHaveLength(1);
  });

  it("spaces requests to the same host", async () => {
    const sleeps: number[] = [];
    const { fetchImpl } = scripted([200]);
    const http = createHttpClient({
      fetchImpl,
      minIntervalMs: 500,
      sleep: async (ms) => void sleeps.push(ms),
    });
    await Promise.all([
      http.getJson("https://x.test/a"),
      http.getJson("https://x.test/b"),
    ]);
    expect(sleeps).toHaveLength(1);
    expect(sleeps[0]).toBeGreaterThan(400);
  });
});
