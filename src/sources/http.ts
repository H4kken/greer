// Shared HTTP client for source adapters: honest User-Agent, a minimum delay
// between requests to the same host, and retries with backoff on 429 / 5xx.

export const USER_AGENT =
  "greer/0.1 (+https://github.com/H4kken/greer; open-source, read-only)";

export class SourceHttpError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
  ) {
    super(`HTTP ${status} from ${new URL(url).host}`);
    this.name = "SourceHttpError";
  }
}

type Fetch = typeof fetch;

export type HttpClientOptions = {
  minIntervalMs?: number;
  retries?: number;
  fetchImpl?: Fetch;
  sleep?: (ms: number) => Promise<void>;
};

const defaultSleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function createHttpClient(options: HttpClientOptions = {}) {
  const {
    minIntervalMs = 250,
    retries = 3,
    fetchImpl = fetch,
    sleep = defaultSleep,
  } = options;
  const nextSlot = new Map<string, number>();

  // Requests to one host are spaced at least minIntervalMs apart.
  async function waitTurn(host: string) {
    const now = Date.now();
    const slot = Math.max(now, nextSlot.get(host) ?? 0);
    nextSlot.set(host, slot + minIntervalMs);
    if (slot > now) await sleep(slot - now);
  }

  async function getJson<T>(url: string): Promise<T> {
    const host = new URL(url).host;
    for (let attempt = 0; ; attempt++) {
      await waitTurn(host);
      const res = await fetchImpl(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      });
      if (res.ok) return (await res.json()) as T;

      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable || attempt >= retries) {
        throw new SourceHttpError(res.status, url);
      }
      const retryAfter = Number(res.headers.get("retry-after"));
      await sleep(
        Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : 1000 * 2 ** attempt,
      );
    }
  }

  return { getJson };
}

export type HttpClient = ReturnType<typeof createHttpClient>;
