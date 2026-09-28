"use client";

import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { removeJevKeyAction, saveJevKeyAction } from "@/workspace/actions";

// The TypeSafe key: Jev scores every thread when it's set, the AI provider
// is the fallback.
export function JevSettingsForm({
  savedKey,
  submitLabel = "Test and save",
}: {
  savedKey: string | null; // masked
  submitLabel?: string;
}) {
  const id = useId();
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const result = await saveJevKeyAction({ apiKey });
      if (!result.ok) {
        setError(result.fieldErrors?.apiKey ?? result.error);
        return;
      }
      setError(null);
      setApiKey("");
      toast.success("TypeSafe key saved. Jev scores threads from now on.");
    });
  }

  function onRemove() {
    startTransition(async () => {
      const result = await removeJevKeyAction();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast("TypeSafe key removed.");
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup>
        <Field data-invalid={!!error}>
          <FieldLabel htmlFor={`${id}-key`}>TypeSafe API key</FieldLabel>
          <Input
            id={`${id}-key`}
            type="password"
            autoComplete="off"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={savedKey ? `Saved: ${savedKey}` : undefined}
            aria-invalid={!!error}
            aria-describedby={`${id}-key-help`}
          />
          <FieldDescription id={`${id}-key-help`}>
            {savedKey
              ? "Paste a new key to replace it. "
              : "Stored encrypted in your database. "}
            <a
              href="https://console.typesafe.ai/"
              target="_blank"
              rel="noreferrer"
            >
              Get a key in the TypeSafe console
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </FieldDescription>
          <FieldError>{error}</FieldError>
        </Field>
        <Field orientation="horizontal">
          <Button type="submit" disabled={pending}>
            {pending ? "Testing…" : submitLabel}
          </Button>
          {savedKey && (
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={onRemove}
            >
              Remove key
            </Button>
          )}
        </Field>
      </FieldGroup>
    </form>
  );
}
