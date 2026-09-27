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
        "inline-flex shrink-0 items-baseline gap-1 rounded-full bg-primary-soft px-2.5 py-0.5 font-mono text-sm font-medium text-primary-soft-foreground",
        className,
      )}
    >
      <span className="font-semibold">{score}</span>
      <span className="text-xs font-normal opacity-80">
        · {criteriaMet}/{criteriaTotal}
        <span className="sr-only"> criteria met, score out of 100</span>
      </span>
    </span>
  );
}
