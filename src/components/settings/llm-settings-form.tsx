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
import { saveLlmSettingsAction } from "@/workspace/actions";

type Provider = "anthropic" | "openai" | "ollama";

export type StoredLlmSettings = {
  provider: Provider;
  apiKey: string | null; // masked
  baseUrl: string | null;
  fastModel: string | null;
  qualityModel: string | null;
} | null;

const PROVIDERS: Record<
  Provider,
  { label: string; keyHelp?: { href: string; text: string } }
> = {
  anthropic: {
    label: "Anthropic (Claude)",
    keyHelp: {
      href: "https://console.anthropic.com/settings/keys",
      text: "Get a key in the Anthropic console",
    },
  },
  openai: {
    label: "OpenAI or compatible",
    keyHelp: {
      href: "https://platform.openai.com/api-keys",
      text: "Get a key from OpenAI",
    },
  },
  ollama: { label: "Ollama (local models)" },
};

export function LlmSettingsForm({
  stored,
  submitLabel = "Test and save",
}: {
  stored: StoredLlmSettings;
  submitLabel?: string;
}) {
  const id = useId();
  const [provider, setProvider] = useState<Provider>(
    stored?.provider ?? "anthropic",
  );
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(stored?.baseUrl ?? "");
  const [fastModel, setFastModel] = useState(stored?.fastModel ?? "");
  const [qualityModel, setQualityModel] = useState(stored?.qualityModel ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const savedKey =
    stored?.provider === provider && stored.apiKey ? stored.apiKey : null;
  const needsKey = provider !== "ollama";
  const help = PROVIDERS[provider].keyHelp;

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    startTransition(async () => {
      const result = await saveLlmSettingsAction({
        provider,
        apiKey,
        baseUrl,
        fastModel,
        qualityModel,
      });
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        setFormError(result.fieldErrors ? null : result.error);
        return;
      }
      setErrors({});
      setApiKey("");
      toast.success("AI model saved. The test call worked.");
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor={`${id}-provider`}>Provider</FieldLabel>
          <NativeSelect
            id={`${id}-provider`}
            value={provider}
            onChange={(e) => setProvider(e.target.value as Provider)}
          >
            {Object.entries(PROVIDERS).map(([value, p]) => (
              <NativeSelectOption key={value} value={value}>
                {p.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>

        {needsKey && (
          <Field data-invalid={!!errors.apiKey}>
            <FieldLabel htmlFor={`${id}-key`}>API key</FieldLabel>
            <Input
              id={`${id}-key`}
              type="password"
              autoComplete="off"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={savedKey ? `Saved: ${savedKey}` : undefined}
              aria-invalid={!!errors.apiKey}
              aria-describedby={`${id}-key-help`}
            />
            <FieldDescription id={`${id}-key-help`}>
              {savedKey
                ? "Leave empty to keep the saved key. "
                : "Stored encrypted in your database. "}
              {help && (
                <a href={help.href} target="_blank" rel="noreferrer">
                  {help.text}
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              )}
            </FieldDescription>
            <FieldError>{errors.apiKey}</FieldError>
          </Field>
        )}

        {provider !== "anthropic" && (
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

        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={!!errors.fastModel}>
            <FieldLabel htmlFor={`${id}-fast`}>
              Scoring model{provider === "anthropic" && " (optional)"}
            </FieldLabel>
            <Input
              id={`${id}-fast`}
              value={fastModel}
              onChange={(e) => setFastModel(e.target.value)}
              placeholder={provider === "anthropic" ? "claude-haiku-4-5" : ""}
              aria-invalid={!!errors.fastModel}
              aria-describedby={`${id}-fast-help`}
            />
            <FieldDescription id={`${id}-fast-help`}>
              Cheap and fast: reads every thread.
            </FieldDescription>
            <FieldError>{errors.fastModel}</FieldError>
          </Field>
          <Field>
            <FieldLabel htmlFor={`${id}-quality`}>
              Brief model{provider === "anthropic" && " (optional)"}
            </FieldLabel>
            <Input
              id={`${id}-quality`}
              value={qualityModel}
              onChange={(e) => setQualityModel(e.target.value)}
              placeholder={provider === "anthropic" ? "claude-opus-5" : ""}
              aria-describedby={`${id}-quality-help`}
            />
            <FieldDescription id={`${id}-quality-help`}>
              Only for the threads you open.
            </FieldDescription>
          </Field>
        </div>

        {formError && <FieldError>{formError}</FieldError>}
        <Field orientation="horizontal">
          <Button type="submit" disabled={pending}>
            {pending ? "Testing…" : submitLabel}
          </Button>
        </Field>
      </FieldGroup>
    </form>
  );
}
