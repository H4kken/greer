// USD per million tokens, for cost estimates shown in the UI. Unknown models
// (other providers, local models) return null: no cost shown rather than a guess.
import { JEV_PRICE_PER_MTOK } from "./jev";

const PRICES: Record<string, { input: number; output: number }> = {
  "claude-haiku-4-5": { input: 1, output: 5 },
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-opus-5": { input: 5, output: 25 },
};

export function estimateCostUsd(
  model: string,
  inputTokens: number | null,
  outputTokens: number | null,
): number | null {
  // Every Jev version (jev-1.13.0, …): input tokens only, output is free.
  const price = model.startsWith("jev-")
    ? { input: JEV_PRICE_PER_MTOK, output: 0 }
    : PRICES[model];
  if (!price) return null;
  return (
    ((inputTokens ?? 0) * price.input + (outputTokens ?? 0) * price.output) /
    1_000_000
  );
}
