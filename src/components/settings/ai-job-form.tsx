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
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { type AiJob, type AiProviderName, DEFAULT_MODELS } from "@/llm/config";
import { clearAiJobAction, saveAiJobAction } from "@/workspace/actions";
import {
  KEY_LINKS,
  PROVIDER_HINTS,
  PROVIDER_NAMES,
  PROVIDER_OPTIONS,
} from "./ai-labels";

export type SavedAiKeys = Partial<
  Record<AiProviderName, { apiKey: string | null; baseUrl: string | null }>
>;

// Picks the provider and model for one AI job. Keys are shared between jobs,
// so a key saved for Claude here also serves the other job.
export function AiJobForm({
  job,
  saved,
  initialProvider,
  keys,
  serverKeys,
}: {
  job: AiJob;
  saved: { provider: AiProviderName; model: string | null } | null;
  initialProvider: AiProviderName;
  keys: SavedAiKeys; // masked
  serverKeys: Record<AiProviderName, boolean>;
}) {
  const id = useId();
  const [provider, setProvider] = useState<AiProviderName>(initialProvider);
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(keys[initialProvider]?.baseUrl ?? "");
  const [model, setModel] = useState(
    saved?.provider === initialProvider ? (saved.model ?? "") : "",
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const options = (Object.keys(PROVIDER_OPTIONS) as AiProviderName[]).filter(
    (p) => job === "sorting" || p !== "typesafe",
  );
  const savedKey = keys[provider]?.apiKey ?? null;
  const onServer = serverKeys[provider];
  const defaultModel = DEFAULT_MODELS[job][provider];
  const link = KEY_LINKS[provider];

  function pick(next: AiProviderName) {
    setProvider(next);
    setApiKey("");
    setBaseUrl(keys[next]?.baseUrl ?? "");
    setModel(saved?.provider === next ? (saved.model ?? "") : "");
    setErrors({});
    setFormError(null);
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    startTransition(async () => {
      const result = await saveAiJobAction({
        job,
        provider,
        apiKey,
        baseUrl,
        model,
      });
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        setFormError(result.fieldErrors ? null : result.error);
        return;
      }
      setErrors({});
      setApiKey("");
      toast.success(
        `${PROVIDER_NAMES[provider]} now does ${job === "sorting" ? "the sorting" : "writing help"}. The test call worked.`,
      );
    });
  }

  function onClear() {
    startTransition(async () => {
      const result = await clearAiJobAction(job);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast("Cleared. The server's settings apply again, if it has any.");
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup>
        <Field data-invalid={!!errors.provider}>
          <FieldLabel htmlFor={`${id}-provider`}>Provider</FieldLabel>
          <NativeSelect
            id={`${id}-provider`}
            value={provider}
            onChange={(e) => pick(e.target.value as AiProviderName)}
            aria-describedby={`${id}-provider-help`}
          >
            {options.map((p) => (
              <NativeSelectOption key={p} value={p}>
                {PROVIDER_OPTIONS[p]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <FieldDescription id={`${id}-provider-help`}>
            {PROVIDER_HINTS[job][provider]}
          </FieldDescription>
          <FieldError>{errors.provider}</FieldError>
        </Field>

        {provider !== "ollama" && (
          <Field data-invalid={!!errors.apiKey}>
            <FieldLabel htmlFor={`${id}-key`}>API key</FieldLabel>
            <Input
              id={`${id}-key`}
              type="password"
              autoComplete="off"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={
                savedKey
                  ? `Saved: ${savedKey}`
                  : onServer
                    ? "Set on the server"
                    : undefined
              }
              aria-invalid={!!errors.apiKey}
              aria-describedby={`${id}-key-help`}
            />
            <FieldDescription id={`${id}-key-help`}>
              {savedKey
                ? provider === "typesafe"
                  ? "Leave empty to keep the saved key. "
                  : "Leave empty to keep the saved key; both jobs share it. "
                : onServer
                  ? "Leave empty to use the key set on the server. "
                  : "Stored encrypted in your database. "}
              {link && (
                <a href={link.href} target="_blank" rel="noreferrer">
                  {link.text}
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              )}
            </FieldDescription>
            <FieldError>{errors.apiKey}</FieldError>
          </Field>
        )}

        {(provider === "openai" || provider === "ollama") && (
          <Field data-invalid={!!errors.baseUrl}>
            <FieldLabel htmlFor={`${id}-url`}>
              {provider === "ollama" ? "Server URL" : "Base URL (optional)"}
            </FieldLabel>
            <Input
              id={`${id}-url`}
              type="url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={
                provider === "ollama"
                  ? "http://ollama:11434/v1"
                  : "https://api.openai.com/v1"
              }
              aria-invalid={!!errors.baseUrl}
            />
            <FieldError>{errors.baseUrl}</FieldError>
          </Field>
        )}

        {provider !== "typesafe" && (
          <Field data-invalid={!!errors.model}>
            <FieldLabel htmlFor={`${id}-model`}>
              Model{defaultModel && " (optional)"}
            </FieldLabel>
            <Input
              id={`${id}-model`}
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={defaultModel}
              aria-invalid={!!errors.model}
            />
            <FieldError>{errors.model}</FieldError>
          </Field>
        )}

        {formError && <FieldError>{formError}</FieldError>}
        <Field orientation="horizontal">
          <Button type="submit" disabled={pending}>
            {pending ? "Testing…" : "Test and save"}
          </Button>
          {saved && (
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={onClear}
            >
              Clear choice
            </Button>
          )}
        </Field>
      </FieldGroup>
    </form>
  );
}
