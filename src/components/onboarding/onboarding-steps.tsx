import { CheckIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = ["Your product", "Where to listen", "First scan"];

export function OnboardingSteps({ current }: { current: 1 | 2 | 3 }) {
  return (
    <nav aria-label="Setup progress">
      <ol className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        {STEPS.map((label, i) => {
          const step = i + 1;
          const done = step < current;
          const active = step === current;
          return (
            <li
              key={label}
              aria-current={active ? "step" : undefined}
              className={cn(
                "flex items-center gap-2",
                active
                  ? "font-medium text-foreground"
                  : "text-muted-foreground",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "flex size-6 items-center justify-center rounded-full border text-xs",
                  active && "border-primary bg-primary text-primary-foreground",
                  done && "border-primary text-primary",
                )}
              >
                {done ? <CheckIcon className="size-3.5" /> : step}
              </span>
              <span>
                {label}
                {done && <span className="sr-only"> (done)</span>}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
