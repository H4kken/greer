"use client";

import { useState } from "react";
import {
  ProductForm,
  type ProductFormValues,
} from "@/components/settings/product-form";

// Step 1: the form, and next to it how Greer will read the problems.
export function ProductStep({ initial }: { initial: ProductFormValues }) {
  const [problems, setProblems] = useState(initial.problems);
  const filled = problems.map((p) => p.trim()).filter(Boolean);

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
      <ProductForm
        initial={initial}
        mode="onboarding"
        onProblemsChange={setProblems}
      />
      <aside
        aria-labelledby="how-greer-reads"
        className="h-fit rounded-lg border bg-muted/40 p-4 text-sm"
      >
        <h2 id="how-greer-reads" className="font-medium">
          How Greer will read this
        </h2>
        {filled.length > 0 ? (
          <>
            <p className="mt-2 text-muted-foreground">
              It looks for people dealing with these right now:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {filled.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          </>
        ) : (
          <p className="mt-2 text-muted-foreground">
            Add the problems your product solves. Greer looks for people facing
            them right now.
          </p>
        )}
        <p className="mt-3 text-muted-foreground">
          Most good threads are ones where you simply help. Greer never suggests
          mentioning your product unless someone is looking for a tool like it.
        </p>
      </aside>
    </div>
  );
}
