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
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  startFirstScanAction,
  suggestKeywordsAction,
} from "@/workspace/actions";
import {
  type KeywordInput,
  keywordSchema,
  SECTION_HINTS,
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
  // Why suggestions switched Show HN on or off, for this product.
  const [showHnWhy, setShowHnWhy] = useState<string | null>(null);
  // One add field per group, so a keyword lands where it belongs.
  const [drafts, setDrafts] = useState<Record<Section, string>>({
    ask_hn: "",
    story_comment: "",
  });
  const [draftErrors, setDraftErrors] = useState<
    Partial<Record<Section, string>>
  >({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const requested = useRef(false);

  useEffect(() => {
    if (initialKeywords !== null || requested.current) return;
    requested.current = true;
    suggestKeywordsAction()
      .then((result) => {
        if (result.ok) {
          setKeywords(result.data.keywords);
          setShowHn(result.data.showHn.watch);
          setShowHnWhy(result.data.showHn.why);
        } else setNotice(result.error);
      })
      .catch(() =>
        setNotice("Couldn't load suggestions. Add your own keywords below."),
      )
      .finally(() => setLoading(false));
  }, [initialKeywords]);

  function add(section: Section) {
    const fail = (message: string) =>
      setDraftErrors((e) => ({ ...e, [section]: message }));
    const parsed = keywordSchema.safeParse({ query: drafts[section], section });
    if (!parsed.success) {
      fail(parsed.error.issues[0]?.message ?? "Check the keyword.");
      return;
    }
    const k = parsed.data;
    if (keywords.some((x) => x.query === k.query && x.section === k.section)) {
      fail("That keyword is already here.");
      return;
    }
    setKeywords([...keywords, k]);
    setDrafts((d) => ({ ...d, [section]: "" }));
    setDraftErrors((e) => ({ ...e, [section]: undefined }));
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
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-medium">Keywords</h2>
        <p className="text-sm text-muted-foreground">
          {initialKeywords === null && (
            <>
              <SparklesIcon className="inline size-3.5" aria-hidden /> Suggested
              from your product.{" "}
            </>
          )}
          A post or comment matches when it contains every word of a keyword.
        </p>
        {notice && (
          <p role="status" className="text-sm text-muted-foreground">
            {notice}
          </p>
        )}
      </div>

      {(Object.keys(SECTION_LABELS) as Section[]).map((section) => {
        const list = keywords.filter((k) => k.section === section);
        const headingId = `${id}-${section}`;
        const error = draftErrors[section];
        return (
          <section
            key={section}
            aria-labelledby={headingId}
            className="flex flex-col gap-3 rounded-2xl border bg-card p-4 sm:p-5"
          >
            <div>
              <h3 id={headingId} className="font-sans font-medium">
                {SECTION_LABELS[section]}
              </h3>
              <p className="text-sm text-muted-foreground">
                {SECTION_HINTS[section].tip}
              </p>
            </div>

            {loading ? (
              <div
                aria-busy="true"
                aria-label="Suggesting keywords"
                className="flex flex-col gap-2"
              >
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-2/3" />
              </div>
            ) : (
              list.length > 0 && (
                <ul className="flex flex-col divide-y">
                  {list.map((k) => (
                    <li
                      key={`${k.section}:${k.query}`}
                      className="flex items-center justify-between gap-2 py-1.5"
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
              )
            )}

            <Field data-invalid={!!error}>
              <FieldLabel htmlFor={`${headingId}-add`} className="sr-only">
                Add to {SECTION_LABELS[section]}
              </FieldLabel>
              <div className="flex gap-2">
                <Input
                  id={`${headingId}-add`}
                  value={drafts[section]}
                  onChange={(e) =>
                    setDrafts((d) => ({ ...d, [section]: e.target.value }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      add(section);
                    }
                  }}
                  placeholder={SECTION_HINTS[section].example}
                  aria-invalid={!!error}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => add(section)}
                >
                  Add
                </Button>
              </div>
              <FieldError>{error}</FieldError>
            </Field>
          </section>
        );
      })}

      <section
        aria-labelledby={`${id}-launches`}
        className="flex flex-col gap-3 rounded-2xl border bg-card p-4 sm:p-5"
      >
        <Field orientation="horizontal" className="items-start">
          <div className="flex flex-1 flex-col gap-1">
            <h3 id={`${id}-launches`} className="font-sans font-medium">
              <FieldLabel htmlFor={`${id}-show-hn`} className="text-base">
                Launches (Show HN)
              </FieldLabel>
            </h3>
            <FieldDescription id={`${id}-show-hn-help`}>
              Founders posting what they built and asking for feedback, about 50
              a day.{" "}
              <strong className="font-medium text-foreground">
                Worth it when makers are your audience
              </strong>
              ; otherwise they&apos;d bury the few people who matter.
            </FieldDescription>
            {showHnWhy && (
              <p className="text-sm text-muted-foreground">
                <SparklesIcon className="inline size-3.5" aria-hidden />{" "}
                Suggested {showHn ? "on" : "off"}: {showHnWhy}.
              </p>
            )}
          </div>
          <Switch
            id={`${id}-show-hn`}
            className="mt-1"
            checked={showHn}
            onCheckedChange={setShowHn}
            aria-describedby={`${id}-show-hn-help`}
          />
        </Field>
      </section>

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
