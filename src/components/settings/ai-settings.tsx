import { CheckIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { AiJob, AiProviderName } from "@/llm/config";
import type { AiStatus, JobStatus } from "@/llm/settings";
import { AiJobForm, type SavedAiKeys } from "./ai-job-form";
import { JOBS, PROVIDER_NAMES } from "./ai-labels";

export type AiSettingsView = {
  status: AiStatus;
  saved: Record<
    AiJob,
    { provider: AiProviderName; model: string | null } | null
  >;
  keys: SavedAiKeys;
  serverKeys: Record<AiProviderName, boolean>;
};

function Now({
  job,
  s,
  view,
}: {
  job: AiJob;
  s: JobStatus;
  view: AiSettingsView;
}) {
  if (!s.configured) {
    return <p className="text-muted-foreground">{JOBS[job].whenMissing}</p>;
  }
  const fallback = job === "sorting" ? view.status.fallback : null;
  return (
    <p>
      Now: {PROVIDER_NAMES[s.provider]}
      {s.provider !== "typesafe" && (
        <>
          {" "}
          <code>{s.model}</code>
        </>
      )}
      {s.source === "env" && ", set on the server"}.
      {fallback && (
        <span className="text-muted-foreground">
          {" "}
          If Jev is unavailable, {PROVIDER_NAMES[fallback.provider]}{" "}
          <code>{fallback.model}</code> sorts instead.
        </span>
      )}
    </p>
  );
}

// One AI job: what it's for, what runs it now, and the form to change it.
// A job that's already set folds its form away behind "Change".
function AiJobCard({ job, view }: { job: AiJob; view: AiSettingsView }) {
  const s = view.status[job];
  const saved = view.saved[job];
  const initialProvider: AiProviderName =
    saved?.provider ??
    (s.configured && s.provider !== "mock"
      ? s.provider
      : job === "sorting"
        ? "typesafe"
        : "anthropic");
  const form = (
    <AiJobForm
      job={job}
      saved={saved}
      initialProvider={initialProvider}
      keys={view.keys}
      serverKeys={view.serverKeys}
    />
  );
  const headingId = `ai-${job}-heading`;

  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:p-5"
    >
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 id={headingId} className="text-lg font-medium">
            {JOBS[job].title}
          </h3>
          {s.configured ? (
            <Badge variant="secondary">
              <CheckIcon aria-hidden />
              Set
            </Badge>
          ) : (
            <Badge variant="outline">
              {job === "sorting" ? "Needed" : "Recommended"}
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">{JOBS[job].why}</p>
      </div>
      <div className="text-sm">
        <Now job={job} s={s} view={view} />
      </div>
      {s.configured ? (
        <details className="rounded-lg border px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium">
            Change
          </summary>
          <div className="mt-4">{form}</div>
        </details>
      ) : (
        form
      )}
    </section>
  );
}

export function AiSettings({ view }: { view: AiSettingsView }) {
  return (
    <div className="flex flex-col gap-4">
      <AiJobCard job="sorting" view={view} />
      <AiJobCard job="writing" view={view} />
    </div>
  );
}
