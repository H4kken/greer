import { Skeleton } from "@/components/ui/skeleton";

// Shaped like Explore: the heading, the filters and the list.
export default function ExploreLoading() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading Explore"
      className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8"
    >
      <div className="flex flex-col gap-3">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-5 w-96 max-w-full" />
      </div>
      <Skeleton className="h-9 w-full" />
      <div className="flex flex-col divide-y rounded-2xl border bg-card">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex flex-col gap-2 p-4">
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ))}
      </div>
    </div>
  );
}
