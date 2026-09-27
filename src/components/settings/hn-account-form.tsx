"use client";

import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
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

export function HnAccountForm({ initial }: { initial: AccountSummary | null }) {
  const id = useId();
  const [account, setAccount] = useState(initial);
  const [handle, setHandle] = useState(initial?.handle ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function check() {
    setError(null);
    startTransition(async () => {
      const result = await linkHnAccountAction(handle);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setAccount(result.data);
      setHandle(result.data.handle);
    });
  }

  function unlink() {
    startTransition(async () => {
      const result = await unlinkHnAccountAction();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setAccount(null);
      setHandle("");
      toast.success("HN account removed from Greer.");
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Field data-invalid={!!error}>
        <FieldLabel htmlFor={`${id}-handle`}>HN username</FieldLabel>
        <div className="flex gap-2">
          <Input
            id={`${id}-handle`}
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            // Enter checks the account instead of submitting a parent form.
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                check();
              }
            }}
            autoComplete="username"
            spellCheck={false}
            className="max-w-60"
            aria-invalid={!!error}
            aria-describedby={`${id}-handle-help`}
          />
          <Button
            type="button"
            variant="outline"
            disabled={pending || !handle.trim()}
            onClick={check}
          >
            {pending ? "Checking…" : account ? "Refresh" : "Check"}
          </Button>
        </div>
        <FieldDescription id={`${id}-handle-help`}>
          Read from HN&apos;s public profile. Greer never logs in as you. No
          account yet? Skip this: Greer will advise as for a new account.
        </FieldDescription>
        <FieldError>{error}</FieldError>
      </Field>

      <div aria-live="polite">
        {account && (
          <div className="flex flex-col gap-2 rounded-lg border bg-muted/40 p-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{account.tierLabel}</Badge>
              <span className="text-muted-foreground">
                {account.handle}
                {account.age && ` · account ${account.age}`}
                {account.karma !== null && ` · ${account.karma} karma`}
              </span>
            </div>
            <p>
              Greer will pace you at about {account.repliesPerDay} replies a
              day. {account.productMentions}
            </p>
            <div>
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto px-0"
                disabled={pending}
                onClick={unlink}
              >
                Remove this account
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
