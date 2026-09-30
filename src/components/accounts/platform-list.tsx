"use client";

import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { HnGuide } from "@/components/hn-guide";
import { HnLogo } from "@/components/logos/hn-logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { AccountSummary } from "@/workspace/accounts";
import {
  linkHnAccountAction,
  unlinkHnAccountAction,
} from "@/workspace/actions";
import { PLATFORMS } from "@/workspace/platforms";

// Every platform as a card to connect. Used by onboarding and the Accounts page.
// What Greer found from the account so far, as text ready to show.
export type ReplyStatus = string | null;

export function PlatformList({
  hn,
  hnReplies = null,
  onChange,
}: {
  hn: AccountSummary | null;
  hnReplies?: ReplyStatus;
  onChange?: (platform: "hn", account: AccountSummary | null) => void;
}) {
  return (
    <ul className="flex flex-col gap-3">
      {PLATFORMS.map((p) => (
        <li key={p.id}>
          <HnCard
            name={p.name}
            about={p.about}
            initial={hn}
            replies={hnReplies}
            onChange={(account) => onChange?.("hn", account)}
          />
        </li>
      ))}
    </ul>
  );
}

function CardHeader({
  id,
  logo,
  name,
  about,
  badge,
}: {
  id: string;
  logo: React.ReactNode;
  name: string;
  about: string;
  badge?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-4">
      {logo}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id={id} className="font-sans text-lg font-medium">
            {name}
          </h2>
          {badge}
        </div>
        <p className="text-sm text-muted-foreground">{about}</p>
      </div>
    </div>
  );
}

function HnCard({
  name,
  about,
  initial,
  replies,
  onChange,
}: {
  name: string;
  about: string;
  initial: AccountSummary | null;
  replies: ReplyStatus;
  onChange: (account: AccountSummary | null) => void;
}) {
  const id = useId();
  const [account, setAccount] = useState(initial);
  // Connected during this visit: the first look for replies is still running.
  const [fresh, setFresh] = useState(false);
  const [handle, setHandle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function update(next: AccountSummary | null) {
    setAccount(next);
    onChange(next);
  }

  function connect(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await linkHnAccountAction(handle);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      update(result.data);
      setFresh(true);
      setHandle("");
    });
  }

  function disconnect() {
    const previous = account;
    startTransition(async () => {
      const result = await unlinkHnAccountAction();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setHandle(previous?.handle ?? "");
      update(null);
      toast.success("Hacker News account disconnected.");
    });
  }

  return (
    <section
      aria-labelledby={`${id}-name`}
      className="flex flex-col gap-5 rounded-2xl border bg-card p-6"
    >
      <CardHeader
        id={`${id}-name`}
        logo={<HnLogo className="size-10" />}
        name={name}
        about={about}
        badge={account && <Badge variant="secondary">Connected</Badge>}
      />

      <div aria-live="polite">
        {account ? (
          <div className="flex flex-col gap-3 rounded-xl bg-primary-soft p-4 text-sm text-primary-soft-foreground">
            <p className="font-medium">
              {account.handle}
              <span className="font-normal">
                {account.age && ` · account ${account.age}`}
                {account.karma !== null && ` · ${account.karma} karma`}
              </span>
            </p>
            <p>
              {account.tierLabel}. Greer will suggest about{" "}
              {account.repliesPerDay} replies a day.
            </p>
            <p>
              {fresh || !replies
                ? "Looking for your replies from the last 30 days…"
                : replies}
            </p>
            <div>
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto px-0 text-primary-soft-foreground"
                disabled={pending}
                onClick={disconnect}
              >
                Disconnect or use another username
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={connect} noValidate>
            <Field data-invalid={!!error}>
              <FieldLabel htmlFor={`${id}-handle`}>
                Your Hacker News username
              </FieldLabel>
              <div className="flex flex-wrap gap-2">
                <Input
                  id={`${id}-handle`}
                  value={handle}
                  onChange={(e) => setHandle(e.target.value)}
                  autoComplete="username"
                  spellCheck={false}
                  className="max-w-64"
                  aria-invalid={!!error}
                  aria-describedby={`${id}-handle-help`}
                />
                <Button type="submit" disabled={pending || !handle.trim()}>
                  {pending ? "Connecting…" : "Connect"}
                </Button>
              </div>
              <FieldDescription id={`${id}-handle-help`}>
                No account yet?{" "}
                <a
                  href="https://news.ycombinator.com/login"
                  target="_blank"
                  rel="noreferrer"
                >
                  Create one on Hacker News
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
                , then connect it here. New accounts get a gentler pace while
                they build karma.
              </FieldDescription>
              <FieldError>{error}</FieldError>
            </Field>
          </form>
        )}
      </div>

      <HnGuide />
    </section>
  );
}
