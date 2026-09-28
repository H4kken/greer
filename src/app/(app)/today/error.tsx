"use client";

import { Button } from "@/components/ui/button";

export default function TodayError({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-4 py-24 text-center">
      <h1 className="text-xl font-medium">Couldn&apos;t load today</h1>
      <p className="text-sm text-muted-foreground">
        The database may be unreachable. Check that Postgres is running, then
        try again. Nothing is lost.
      </p>
      <Button onClick={() => retry()}>Try again</Button>
    </div>
  );
}
