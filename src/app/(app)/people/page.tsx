import type { Metadata } from "next";
import Link from "next/link";
import {
  PeopleView,
  type PersonView,
  type TopicView,
} from "@/components/people/people-view";
import { buttonVariants } from "@/components/ui/button";
import { db } from "@/db";
import { requireWorkspace } from "@/lib/session";
import { formatRelative } from "@/lib/time";
import { pathOf } from "@/people/build";
import { listPeople } from "@/people/queries";
import { getProductProfile } from "@/workspace/profile";

export const metadata: Metadata = { title: "People · Greer" };

const TONE_LABEL = {
  question: "asked you something",
  thanks: "thanked you",
  disagreement: "disagreed",
  neutral: "answered you",
} as const;

function Empty({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-2xl border border-dashed p-10 text-center">
      <h2 className="text-xl font-medium">{title}</h2>
      <div className="text-sm text-muted-foreground">{children}</div>
    </div>
  );
}

export default async function PeoplePage() {
  const { workspace } = await requireWorkspace();
  const now = new Date();
  const [{ me, people, topics }, profile] = await Promise.all([
    listPeople(db, workspace.id, "hn"),
    getProductProfile(db, workspace.id),
  ]);
  const topicName = new Map(topics.map((t) => [t.id, t.name]));

  const topicViews: TopicView[] = topics.map((t) => ({
    id: t.id,
    name: t.name,
    stage: t.stage,
    evidence: [
      `You talked with ${t.people} ${t.people === 1 ? "person" : "people"} about it`,
      t.thanks > 0 && `${t.thanks} thanked you`,
      t.cameBack > 0 && `${t.cameBack} came back`,
    ]
      .filter(Boolean)
      .join(" · "),
  }));

  const views: PersonView[] = people.map((p) => ({
    handle: p.handle,
    kind: p.kind,
    conversations: p.conversations,
    summary: `${p.conversations} conversation${p.conversations === 1 ? "" : "s"} · ${
      p.conversations > 1
        ? `since ${formatRelative(p.firstAt, now)}`
        : formatRelative(p.lastAt, now)
    }`,
    latest: p.latest && {
      text: p.latest.text,
      label: TONE_LABEL[p.latest.tone ?? "neutral"],
      url: p.latest.url,
    },
    openQuestion: p.openQuestion,
    threads: p.threads,
    topicIds: p.topicIds,
    topics: p.topicIds
      .map((id) => topicName.get(id)?.toLowerCase())
      .filter((n): n is string => !!n),
    tried: !!p.triedAt,
  }));

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-4xl font-medium tracking-tight">Your people</h1>
        <p className="text-muted-foreground">
          Everyone you&apos;ve talked with on Hacker News. The more you&apos;ve
          talked, the closer and bigger they get.
        </p>
      </div>

      {!me ? (
        <Empty title="Connect your account first">
          <p>
            Greer finds the people you talk with from your public replies on
            Hacker News.
          </p>
          <Link
            href="/accounts"
            className={buttonVariants({ className: "mt-4" })}
          >
            Connect Hacker News
          </Link>
        </Empty>
      ) : views.length === 0 ? (
        <Empty title="No one here yet">
          Once you reply to someone on Hacker News as {me}, they show up here.
          Greer checks every 15 minutes.
        </Empty>
      ) : (
        <PeopleView
          people={views}
          topics={topicViews}
          path={pathOf(people)}
          productName={profile?.productName || "your product"}
        />
      )}
    </div>
  );
}
