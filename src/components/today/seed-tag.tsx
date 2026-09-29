import { CarrotIcon, Flower2Icon } from "lucide-react";
import type { Seed } from "@/scoring/explain";

const SEEDS = {
  carrot: {
    Icon: CarrotIcon,
    label: "Could become a user",
    note: "One of your audience, facing this themselves. A conversation worth having one to one, and following up.",
  },
  dandelion: {
    Icon: Flower2Icon,
    label: "Help in public",
    note: "The thread's readers are your audience too: a complete answer helps everyone who finds it.",
  },
} as const;

// What kind of conversation a card is: a carrot (someone who could become a
// user) or a dandelion (help that spreads to everyone reading). With
// `explained`, one line on why and what fits.
export function SeedTag({
  seed,
  explained = false,
}: {
  seed: Seed;
  explained?: boolean;
}) {
  const { Icon, label, note } = SEEDS[seed];
  if (explained) {
    return (
      <p className="flex items-start gap-2 text-sm">
        <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
        <span>
          <span className="font-medium">{label}.</span>{" "}
          <span className="text-muted-foreground">{note}</span>
        </span>
      </p>
    );
  }
  return (
    <span className="flex items-center gap-1 text-xs whitespace-nowrap text-muted-foreground">
      <Icon aria-hidden className="size-3.5 text-primary" />
      {label}
    </span>
  );
}
