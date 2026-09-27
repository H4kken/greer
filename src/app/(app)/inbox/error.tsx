"use client";

import { Button } from "@/components/ui/button";

export default function InboxError({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-4 py-24 text-center">
      <h1 className="text-lg font-semibold">Couldn&apos;t load your inbox</h1>
      <p className="text-sm text-muted-foreground">
        The database may be unreachable. Check that Postgres is running, then
        try again. Nothing you triaged is lost.
      </p>
      <Button onClick={() => retry()}>Try again</Button>
    </div>
  );
}
