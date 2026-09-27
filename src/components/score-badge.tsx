import { cn } from "@/lib/utils";

// The score and the criteria behind it, e.g. "92 · 4/5 criteria".
export function ScoreBadge({
  score,
  criteriaMet,
  criteriaTotal,
  className,
}: {
  score: number;
  criteriaMet: number;
  criteriaTotal: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-baseline gap-1 rounded-md border px-2 py-0.5 text-sm tabular-nums",
        className,
      )}
    >
      <span className="font-semibold">{score}</span>
      <span className="text-xs text-muted-foreground">
        · {criteriaMet}/{criteriaTotal}
        <span className="sr-only"> criteria met, score out of 100</span>
      </span>
    </span>
  );
}
