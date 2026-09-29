import { cn } from "@/lib/utils";
import type { EntryView } from "./types";

// The one difference between cards in Today's feed. Someone becomes
// "someone you know" once they answer you; before that, you replied to them.
export function PersonTag({
  entry,
}: {
  entry: Pick<EntryView, "known" | "waiting">;
}) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        entry.known && !entry.waiting
          ? "bg-primary-soft text-primary-soft-foreground"
          : "bg-muted text-muted-foreground",
      )}
    >
      {!entry.known
        ? "Someone new"
        : entry.waiting
          ? "You replied to them"
          : "Someone you know"}
    </span>
  );
}
