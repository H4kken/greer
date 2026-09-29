import {
  AiSettings,
  type AiSettingsView,
} from "@/components/settings/ai-settings";

// Shown in onboarding until both AI jobs are set: sorting is needed for the
// first scan, writing help for keyword suggestions in step 3.
export function AiSetup({ view }: { view: AiSettingsView }) {
  return (
    <section aria-labelledby="ai-heading" className="flex flex-col gap-4">
      <div>
        <h2 id="ai-heading" className="text-xl font-medium">
          Connect AI
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Greer uses AI for two jobs. Sorting is needed now: it&apos;s how your
          first scan finds people. Writing help is optional but recommended: it
          suggests keywords in step 3. One Claude or OpenAI key can do both, or
          pair TypeSafe Jev, the cheapest way to sort, with a writing model.
        </p>
      </div>
      <AiSettings view={view} />
    </section>
  );
}
