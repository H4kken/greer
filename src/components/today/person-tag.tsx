import { cn } from "@/lib/utils";

// The one difference between cards in Today's feed.
export function PersonTag({ known }: { known: boolean }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        known
          ? "bg-primary-soft text-primary-soft-foreground"
          : "bg-muted text-muted-foreground",
      )}
    >
      {known ? "Someone you know" : "Someone new"}
    </span>
  );
}
