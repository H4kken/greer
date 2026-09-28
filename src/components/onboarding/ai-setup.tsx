import { JevSettingsForm } from "@/components/settings/jev-settings-form";
import {
  LlmSettingsForm,
  type StoredLlmSettings,
} from "@/components/settings/llm-settings-form";

// Shown in onboarding while nothing can score threads: TypeSafe first (the
// cheap, fast scorer), any AI provider as the alternative.
export function AiSetup({
  intro,
  jevKey,
  stored,
}: {
  intro: string;
  jevKey: string | null;
  stored: StoredLlmSettings;
}) {
  return (
    <section
      aria-labelledby="ai-heading"
      className="flex flex-col gap-4 rounded-2xl border bg-card p-6"
    >
      <div>
        <h2 id="ai-heading" className="text-xl font-medium">
          Connect an AI model
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{intro}</p>
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="font-medium">TypeSafe Jev (recommended)</h3>
        <p className="text-sm text-muted-foreground">
          Reads every thread in a fraction of a second, for about 5 cents per
          1,000 threads.
        </p>
      </div>
      <JevSettingsForm savedKey={jevKey} />
      <details className="group rounded-xl border px-4 py-3">
        <summary className="cursor-pointer text-sm font-medium">
          Or use Anthropic, OpenAI or Ollama
        </summary>
        <div className="mt-4 flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Also suggests keywords and reads the answers to your replies. You
            can add one later in Settings, next to a TypeSafe key.
          </p>
          <LlmSettingsForm stored={stored} />
        </div>
      </details>
    </section>
  );
}
