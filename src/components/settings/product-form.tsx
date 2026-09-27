"use client";

import { PlusIcon, XIcon } from "lucide-react";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { saveProductProfileAction } from "@/workspace/actions";
import { PROFILE_LIMITS } from "@/workspace/schemas";

export type ProductFormValues = {
  productName: string;
  productDescription: string;
  audience: string;
  problems: string[];
};

type Props = {
  initial: ProductFormValues;
  mode: "onboarding" | "settings";
  // Shown next to the form during onboarding: how Greer reads the profile.
  onProblemsChange?: (problems: string[]) => void;
};

export function ProductForm({ initial, mode, onProblemsChange }: Props) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [problemKeys, setProblemKeys] = useState(() =>
    initial.problems.map((_, i) => i),
  );
  const [nextKey, setNextKey] = useState(initial.problems.length);
  const id = useId();

  // Editing a field clears its error: the message is about the old value.
  function clearErrors(prefix: string) {
    setErrors((e) =>
      Object.fromEntries(
        Object.entries(e).filter(([key]) => !key.startsWith(prefix)),
      ),
    );
  }

  function setProblems(problems: string[], keys: number[]) {
    clearErrors("problems");
    setValues((v) => ({ ...v, problems }));
    setProblemKeys(keys);
    onProblemsChange?.(problems);
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    startTransition(async () => {
      const result = await saveProductProfileAction(values, mode);
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        setFormError(result.fieldErrors ? null : result.error);
        return;
      }
      setErrors({});
      toast.success("Product saved.");
    });
  }

  const problemsError = Object.entries(errors).find(([k]) =>
    k.startsWith("problems"),
  )?.[1];

  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup>
        <Field data-invalid={!!errors.productName}>
          <FieldLabel htmlFor={`${id}-name`}>Product name</FieldLabel>
          <Input
            id={`${id}-name`}
            value={values.productName}
            onChange={(e) => {
              clearErrors("productName");
              setValues((v) => ({ ...v, productName: e.target.value }));
            }}
            maxLength={PROFILE_LIMITS.name}
            aria-invalid={!!errors.productName}
            required
          />
          <FieldError>{errors.productName}</FieldError>
        </Field>

        <Field data-invalid={!!errors.productDescription}>
          <FieldLabel htmlFor={`${id}-description`}>What it does</FieldLabel>
          <Textarea
            id={`${id}-description`}
            value={values.productDescription}
            onChange={(e) => {
              clearErrors("productDescription");
              setValues((v) => ({ ...v, productDescription: e.target.value }));
            }}
            maxLength={PROFILE_LIMITS.description}
            rows={3}
            aria-invalid={!!errors.productDescription}
            required
          />
          <FieldError>{errors.productDescription}</FieldError>
        </Field>

        <Field>
          <FieldLabel htmlFor={`${id}-audience`}>Who it&apos;s for</FieldLabel>
          <Input
            id={`${id}-audience`}
            value={values.audience}
            onChange={(e) =>
              setValues((v) => ({ ...v, audience: e.target.value }))
            }
            maxLength={PROFILE_LIMITS.audience}
            placeholder="e.g. Indie hackers with an early-stage SaaS"
          />
        </Field>

        <FieldSet data-invalid={!!problemsError}>
          <FieldLegend variant="label">Problems it solves</FieldLegend>
          <FieldDescription>
            One per line, as your users would say it. Greer looks for people
            facing these right now.
          </FieldDescription>
          <ul className="flex flex-col gap-2">
            {values.problems.map((problem, i) => (
              <li key={problemKeys[i]} className="flex gap-2">
                <Input
                  aria-label={`Problem ${i + 1}`}
                  value={problem}
                  onChange={(e) => {
                    const problems = [...values.problems];
                    problems[i] = e.target.value;
                    setProblems(problems, problemKeys);
                  }}
                  maxLength={PROFILE_LIMITS.problem}
                  placeholder="e.g. Getting the first paying customers"
                  aria-invalid={!!errors[`problems.${i}`]}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove problem ${i + 1}`}
                  disabled={values.problems.length === 1}
                  onClick={() =>
                    setProblems(
                      values.problems.filter((_, j) => j !== i),
                      problemKeys.filter((_, j) => j !== i),
                    )
                  }
                >
                  <XIcon />
                </Button>
              </li>
            ))}
          </ul>
          {values.problems.length < PROFILE_LIMITS.problems && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-fit"
              onClick={() => {
                setProblems(
                  [...values.problems, ""],
                  [...problemKeys, nextKey],
                );
                setNextKey((k) => k + 1);
              }}
            >
              <PlusIcon aria-hidden /> Add a problem
            </Button>
          )}
          <FieldError>{problemsError}</FieldError>
        </FieldSet>

        {formError && <FieldError>{formError}</FieldError>}
        <Field orientation="horizontal">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : mode === "onboarding" ? "Continue" : "Save"}
          </Button>
        </Field>
      </FieldGroup>
    </form>
  );
}
