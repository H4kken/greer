"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";

export const SHORTCUTS: [keys: string[], action: string][] = [
  [["j", "↓"], "Next thread"],
  [["k", "↑"], "Previous thread"],
  [["o"], "Open the thread on HN"],
  [["s"], "Snooze for a day"],
  [["d"], "Dismiss"],
  [["z"], "Undo the last action"],
  [["u"], "Move back to the inbox (snoozed and dismissed views)"],
  [["?"], "Show these shortcuts"],
];

export function ShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            They work anywhere in the inbox, except while typing.
          </DialogDescription>
        </DialogHeader>
        <dl className="flex flex-col gap-2 text-sm">
          {SHORTCUTS.map(([keys, action]) => (
            <div
              key={action}
              className="flex items-center justify-between gap-4"
            >
              <dt>{action}</dt>
              <dd className="flex gap-1">
                {keys.map((k) => (
                  <Kbd key={k}>{k}</Kbd>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
}
