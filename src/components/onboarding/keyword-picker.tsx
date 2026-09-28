"use client";

import { SparklesIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  startFirstScanAction,
  suggestKeywordsAction,
} from "@/workspace/actions";
import {
  type KeywordInput,
  keywordSchema,
  SECTION_LABELS,
} from "@/workspace/schemas";

type Keyword = KeywordInput & { why?: string };
type Section = KeywordInput["section"];

type Props = {
  // Keywords saved earlier (coming back to this step), or null to suggest.
  initialKeywords: Keyword[] | null;
  initialShowHn: boolean;
};

export function KeywordPicker({ initialKeywords, initialShowHn }: Props) {
  const id = useId();
  const [keywords, setKeywords] = useState<Keyword[]>(initialKeywords ?? []);
  const [loading, setLoading] = useState(initialKeywords === null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showHn, setShowHn] = useState(initialShowHn);
  const [draft, setDraft] = useState("");
  const [draftSection, setDraftSection] = useState<Section>("ask_hn");
  const [draftError, setDraftError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const requested = useRef(false);

  useEffect(() => {
    if (initialKeywords !== null || requested.current) return;
    requested.current = true;
    suggestKeywordsAction()
      .then((result) => {
        if (result.ok) setKeywords(result.data.keywords);
        else setNotice(result.error);
      })
      .catch(() =>
        setNotice("Couldn't load suggestions. Add your own keywords below."),
      )
      .finally(() => setLoading(false));
  }, [initialKeywords]);

  function add() {
    const parsed = keywordSchema.safeParse({
      query: draft,
      section: draftSection,
    });
    if (!parsed.success) {
      setDraftError(parsed.error.issues[0]?.message ?? "Check the keyword.");
      return;
    }
    const k = parsed.data;
    if (keywords.some((x) => x.query === k.query && x.section === k.section)) {
      setDraftError("That keyword is already in this section.");
      return;
    }
    setKeywords([...keywords, k]);
    setDraft("");
    setDraftError(null);
  }

  function remove(k: Keyword) {
    setKeywords(keywords.filter((x) => x !== k));
  }

  function start() {
    setSubmitError(null);
    startTransition(async () => {
      const result = await startFirstScanAction({
        keywords: keywords.map(({ query, section }) => ({ query, section })),
        showHn,
      });
      // On success the action redirects to the scan page.
      if (result && !result.ok) setSubmitError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <FieldSet>
        <FieldLegend>Show HN launches</FieldLegend>
        <Field orientation="horizontal" className="items-start">
          <Switch
            id={`${id}-show-hn`}
            className="mt-0.5"
            checked={showHn}
            onCheckedChange={setShowHn}
            aria-describedby={`${id}-show-hn-help`}
          />
          <div className="flex flex-col gap-1">
            <FieldLabel htmlFor={`${id}-show-hn`}>
              Also watch Show HN
            </FieldLabel>
            <FieldDescription id={`${id}-show-hn-help`}>
              Founders posting what they built and asking for feedback: a good
              way to help and meet builders in your audience. The best ones join
              Today as people asking for feedback. Adds about 50 posts a day to
              score.
            </FieldDescription>
          </div>
        </Field>
      </FieldSet>

      <FieldSet>
        <FieldLegend>Keywords</FieldLegend>
        <FieldDescription>
          {initialKeywords === null ? (
            <>
              <SparklesIcon className="inline size-3.5" aria-hidden /> Suggested
              from your product. A post matches when it contains every word of a
              keyword.
            </>
          ) : (
            "A post matches when it contains every word of a keyword."
          )}
        </FieldDescription>

        {loading ? (
          <div
            aria-busy="true"
            aria-label="Suggesting keywords"
            className="flex flex-col gap-2"
          >
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : (
          <>
            {notice && (
              <p role="status" className="text-sm text-muted-foreground">
                {notice}
              </p>
            )}
            {(Object.keys(SECTION_LABELS) as Section[]).map((section) => {
              const list = keywords.filter((k) => k.section === section);
              if (!list.length) return null;
              return (
                <div key={section} className="flex flex-col gap-2">
                  <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    {SECTION_LABELS[section]}
                  </h3>
                  <ul className="flex flex-col divide-y rounded-xl border bg-card">
                    {list.map((k) => (
                      <li
                        key={`${k.section}:${k.query}`}
                        className="flex items-center justify-between gap-2 py-1.5 pr-1.5 pl-3"
                      >
                        <div className="min-w-0">
                          <span className="font-medium">{k.query}</span>
                          {k.why && (
                            <span className="ml-2 text-sm text-muted-foreground">
                              {k.why}
                            </span>
                          )}
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Remove keyword ${k.query}`}
                          onClick={() => remove(k)}
                        >
                          <XIcon />
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </>
        )}

        <Field data-invalid={!!draftError}>
          <FieldLabel htmlFor={`${id}-draft`}>Add a keyword</FieldLabel>
          <div className="flex flex-wrap gap-2">
            <Input
              id={`${id}-draft`}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  add();
                }
              }}
              placeholder="e.g. first customers"
              className="max-w-60"
              aria-invalid={!!draftError}
            />
            <NativeSelect
              aria-label="Where to search"
              value={draftSection}
              onChange={(e) => setDraftSection(e.target.value as Section)}
            >
              {Object.entries(SECTION_LABELS).map(([value, label]) => (
                <NativeSelectOption key={value} value={value}>
                  {label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <Button type="button" variant="outline" onClick={add}>
              Add
            </Button>
          </div>
          <FieldError>{draftError}</FieldError>
        </Field>
      </FieldSet>

      {submitError && <FieldError>{submitError}</FieldError>}
      <div className="flex items-center justify-between gap-2">
        <Link
          href="/onboarding/product"
          className={buttonVariants({ variant: "ghost" })}
        >
          Back
        </Link>
        <Button type="button" onClick={start} disabled={pending || loading}>
          {pending ? "Starting…" : "Start the first scan"}
        </Button>
      </div>
    </div>
  );
}
