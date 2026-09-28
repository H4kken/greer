import { Skeleton } from "@/components/ui/skeleton";

// Shaped like Today: the greeting, the feed and the space beside it.
export default function TodayLoading() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading today"
      className="mx-auto flex w-full max-w-screen-xl flex-col gap-6 px-4 py-8"
    >
      <div className="flex flex-col gap-3">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-5 w-96 max-w-full" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,28rem)_minmax(0,1fr)]">
        <div className="flex flex-col gap-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex gap-3 rounded-2xl border bg-card p-4">
              <Skeleton className="size-9 rounded-full" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            </div>
          ))}
        </div>
        <Skeleton className="hidden h-[32rem] rounded-3xl lg:block" />
      </div>
    </div>
  );
}
