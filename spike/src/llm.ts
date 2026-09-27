// Shared Anthropic client, usage accounting and a small concurrency pool.
import Anthropic from "@anthropic-ai/sdk";
import { PRICES } from "./config.ts";

// Resolves credentials from ANTHROPIC_API_KEY (or an `ant auth login` profile).
export const client = new Anthropic();

const usage = new Map<
  string,
  { input: number; output: number; calls: number }
>();

export function recordUsage(
  model: string,
  u: { input_tokens: number; output_tokens: number },
): void {
  const cur = usage.get(model) ?? { input: 0, output: 0, calls: 0 };
  cur.input += u.input_tokens;
  cur.output += u.output_tokens;
  cur.calls += 1;
  usage.set(model, cur);
}

export function costReport(): { lines: string[]; total: number } {
  let total = 0;
  const lines: string[] = [];
  for (const [model, u] of usage) {
    const p = PRICES[model];
    const cost = p
      ? (u.input * p.input + u.output * p.output) / 1_000_000
      : NaN;
    total += Number.isNaN(cost) ? 0 : cost;
    lines.push(
      `${model}: ${u.calls} calls, ${u.input} in / ${u.output} out tokens, ~$${cost.toFixed(3)}`,
    );
  }
  return { lines, total };
}

export async function pool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, i: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]!, i);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker),
  );
  return results;
}

// Platform content is untrusted: always pass it through this, inside delimiters.
export function untrusted(tag: string, text: string, maxChars = 4000): string {
  const clipped =
    text.length > maxChars ? `${text.slice(0, maxChars)}\n[…truncated]` : text;
  return `<${tag}>\n${clipped.replaceAll(`</${tag}>`, "")}\n</${tag}>`;
}
