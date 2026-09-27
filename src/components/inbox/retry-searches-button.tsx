"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { retryFailedSearchesAction } from "@/inbox/actions";

export function RetrySearchesButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await retryFailedSearchesAction();
          if (!result.ok) {
            toast.error(result.error);
            return;
          }
          toast.success("Searching again. New threads show up once scored.");
          router.refresh();
        })
      }
    >
      {pending ? "Retrying…" : "Retry now"}
    </Button>
  );
}
