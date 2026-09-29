"use client";

import { Trash2Icon } from "lucide-react";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { HnGuide } from "@/components/hn-guide";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import {
  addKeywordAction,
  deleteKeywordAction,
  restoreKeywordAction,
  setKeywordEnabledAction,
} from "@/workspace/actions";
import {
  type KeywordInput,
  SECTION_HINTS,
  SECTION_LABELS,
} from "@/workspace/schemas";

export type KeywordRow = {
  id: string;
  query: string;
  section: string;
  label: string;
  enabled: boolean;
  lastPolledAt: string | null;
  lastError: string | null;
};

type Section = KeywordInput["section"];

const SECTION_NAMES: Record<string, string> = {
  ...SECTION_LABELS,
  show_hn: "Launches",
};

function status(row: KeywordRow): string {
  if (row.lastError) return `Last search failed: ${row.lastError}`;
  if (!row.enabled) return "Paused";
  if (!row.lastPolledAt) return "Waiting for the first search";
  return `Last searched ${new Date(row.lastPolledAt).toLocaleString()}`;
}

export function KeywordSettings({ initial }: { initial: KeywordRow[] }) {
  const id = useId();
  const [rows, setRows] = useState(initial);
  const [draft, setDraft] = useState("");
  const [draftSection, setDraftSection] = useState<Section>("ask_hn");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle(row: KeywordRow, enabled: boolean) {
    setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, enabled } : r)));
    startTransition(async () => {
      const result = await setKeywordEnabledAction(row.id, enabled);
      if (!result.ok) {
        setRows((rs) =>
          rs.map((r) => (r.id === row.id ? { ...r, enabled: !enabled } : r)),
        );
        toast.error(result.error);
      }
    });
  }

  function remove(row: KeywordRow) {
    const index = rows.indexOf(row);
    setRows((rs) => rs.filter((r) => r.id !== row.id));
    startTransition(async () => {
      const result = await deleteKeywordAction(row.id);
      if (!result.ok) {
        setRows((rs) => rs.toSpliced(index, 0, row));
        toast.error(result.error);
        return;
      }
      toast(`Removed "${row.label}".`, {
        action: {
          label: "Undo",
          onClick: () =>
            startTransition(async () => {
              const restored = await restoreKeywordAction({
                id: row.id,
                section: row.section,
                query: row.query,
                enabled: row.enabled,
              });
              if (!restored.ok) {
                toast.error(restored.error);
                return;
              }
              setRows((rs) => rs.toSpliced(index, 0, row));
            }),
        },
      });
    });
  }

  function add(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await addKeywordAction({
        query: draft,
        section: draftSection,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const q = result.data.query;
      setRows((rs) => [
        ...rs,
        {
          id: q.id,
          query: q.query,
          section: q.section,
          label: q.label,
          enabled: q.enabled,
          lastPolledAt: null,
          lastError: null,
        },
      ]);
      setDraft("");
      toast.success(`Added "${q.label}". Searching the last 7 days now.`);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
          No keywords yet. Add one below so Greer knows what to look for.
        </p>
      ) : (
        <ul className="flex flex-col divide-y rounded-xl border bg-card">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex items-center justify-between gap-3 py-2 pr-2 pl-3"
            >
              <div className="min-w-0">
                <p>
                  <span className="font-medium">{row.label}</span>{" "}
                  <span className="text-sm text-muted-foreground">
                    · {SECTION_NAMES[row.section] ?? row.section}
                  </span>
                </p>
                <p
                  className={
                    row.lastError
                      ? "text-xs text-destructive"
                      : "text-xs text-muted-foreground"
                  }
                >
                  {status(row)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Switch
                  checked={row.enabled}
                  onCheckedChange={(on) => toggle(row, on)}
                  aria-label={`Search "${row.label}"`}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove "${row.label}"`}
                  onClick={() => remove(row)}
                >
                  <Trash2Icon />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <HnGuide />

      <form onSubmit={add} noValidate>
        <Field data-invalid={!!error}>
          <FieldLabel htmlFor={`${id}-draft`}>Add a keyword</FieldLabel>
          <div className="flex flex-wrap gap-2">
            <Input
              id={`${id}-draft`}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={SECTION_HINTS[draftSection].example}
              className="max-w-60"
              aria-invalid={!!error}
            />
            <NativeSelect
              aria-label="Where to search"
              aria-describedby={`${id}-where-help`}
              value={draftSection}
              onChange={(e) => setDraftSection(e.target.value as Section)}
            >
              {Object.entries(SECTION_LABELS).map(([value, label]) => (
                <NativeSelectOption key={value} value={value}>
                  {label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <Button type="submit" variant="outline" disabled={pending}>
              Add
            </Button>
          </div>
          <FieldDescription id={`${id}-where-help`}>
            {SECTION_HINTS[draftSection].hint}
          </FieldDescription>
          <FieldError>{error}</FieldError>
        </Field>
      </form>
    </div>
  );
}
