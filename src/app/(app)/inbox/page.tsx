import type { Metadata } from "next";

export const metadata: Metadata = { title: "Inbox · Greer" };

export default function InboxPage() {
  return (
    <section className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold tracking-tight">Inbox</h1>
      <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
        <p className="font-medium text-foreground">No threads yet.</p>
        <p className="mt-1 text-sm">
          Sources and scoring arrive in Milestone 2. Once they&apos;re in,
          conversations worth your time will show up here.
        </p>
      </div>
    </section>
  );
}
