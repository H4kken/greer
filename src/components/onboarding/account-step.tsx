"use client";

import Link from "next/link";
import { useState } from "react";
import { PlatformList } from "@/components/accounts/platform-list";
import { buttonVariants } from "@/components/ui/button";
import type { AccountSummary } from "@/workspace/accounts";

export function AccountStep({ initial }: { initial: AccountSummary | null }) {
  const [connected, setConnected] = useState(!!initial);

  return (
    <div className="flex flex-col gap-6">
      <PlatformList
        hn={initial}
        onChange={(_, account) => setConnected(!!account)}
      />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          {connected
            ? "You can change this later in Accounts."
            : "No account yet, or rather not? Connect it later in Accounts."}
        </p>
        <Link
          href="/onboarding/keywords"
          className={buttonVariants({
            variant: connected ? "default" : "outline",
            size: "lg",
          })}
        >
          {connected ? "Continue" : "Skip for now"}
        </Link>
      </div>
    </div>
  );
}
