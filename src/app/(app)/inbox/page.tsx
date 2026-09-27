import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Inbox · Greer" };

export default function InboxPage() {
  return (
    <section className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold tracking-tight">Inbox</h1>
      <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
        <p className="font-medium text-foreground">
          The ranked inbox is coming next.
        </p>
        <p className="mt-1 text-sm">
          Greer is already collecting and scoring threads. Until the inbox
          lands, the best ones are on the{" "}
          <Link href="/onboarding/scan">first scan page</Link>.
        </p>
      </div>
    </section>
  );
}
