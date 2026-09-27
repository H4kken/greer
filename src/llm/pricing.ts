// USD per million tokens, for cost estimates shown in the UI. Unknown models
// (other providers, local models) return null: no cost shown rather than a guess.
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
  const price = PRICES[model];
  if (!price) return null;
  return (
    ((inputTokens ?? 0) * price.input + (outputTokens ?? 0) * price.output) /
    1_000_000
  );
}
