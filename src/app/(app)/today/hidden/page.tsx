import { ArrowLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { HiddenList } from "@/components/today/hidden-list";
import { db } from "@/db";
import { requireWorkspace } from "@/lib/session";
import { formatRelative } from "@/lib/time";
import { hiddenThreads } from "@/today/queries";

export const metadata: Metadata = { title: "Hidden threads · Greer" };

export default async function HiddenPage() {
  const { workspace } = await requireWorkspace();
  const now = new Date();
  const rows = await hiddenThreads(db, workspace.id);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <Link
        href="/today"
        className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground"
      >
        <ArrowLeftIcon aria-hidden className="size-4" /> Today
      </Link>
      <div className="flex flex-col gap-2">
        <h1 className="text-4xl font-medium tracking-tight">Hidden threads</h1>
        <p className="text-muted-foreground">
          Threads you marked &quot;Not for me&quot;. Bring one back if it was a
          mistake.
        </p>
      </div>
      <HiddenList
        rows={rows.map((r) => ({
          id: r.id,
          title: r.title || "(untitled)",
          url: r.url,
          author: r.author,
          hidden: r.triagedAt ? formatRelative(r.triagedAt, now) : null,
        }))}
      />
    </div>
  );
}
