import { CarrotIcon, Flower2Icon } from "lucide-react";
import type { Seed } from "@/scoring/explain";

const SEEDS = {
  carrot: {
    Icon: CarrotIcon,
    label: "Could become a user",
    short: "Potential user",
    note: "One of your audience, facing this themselves. A conversation worth having one to one, and following up.",
  },
  dandelion: {
    Icon: Flower2Icon,
    label: "Help in public",
    short: "Help in public",
    note: "The thread's readers are your audience too: a complete answer helps everyone who finds it.",
  },
} as const;

const LAUNCH_NOTES = {
  carrot:
    "A maker in your audience. Useful feedback now can start a conversation, and they may try what you make too.",
  dandelion:
    "Feedback in public: other makers reading the thread learn from it too.",
} as const;

// What kind of conversation a card is: a carrot (someone who could become a
// user) or a dandelion (help that spreads to everyone reading). With
// `explained`, one line on why and what fits; without, a short prefix for
// the card's "why it fits" line.
export function SeedTag({
  seed,
  explained = false,
  launch = false,
}: {
  seed: Seed;
  explained?: boolean;
  // A maker showing their product rather than someone stuck.
  launch?: boolean;
}) {
  const { Icon, label, short } = SEEDS[seed];
  const note = launch ? LAUNCH_NOTES[seed] : SEEDS[seed].note;
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
  // On a card: before the "why", in its colour. The full label on hover.
  return (
    <span title={label} className="font-medium">
      <Icon aria-hidden className="mr-1 inline size-4 align-[-3px]" />
      {short}
      {!launch && " · "}
    </span>
  );
}
