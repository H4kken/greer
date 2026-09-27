import { Skeleton } from "@/components/ui/skeleton";

// Shaped like the inbox: views, the ranked list and the thread panel.
export default function InboxLoading() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading the inbox"
      className="mx-auto grid w-full max-w-screen-2xl grid-cols-1 gap-6 px-4 py-6 lg:grid-cols-[13rem_minmax(0,1fr)]"
    >
      <div className="hidden flex-col gap-2 lg:flex">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
      <div className="flex flex-col gap-4">
        <Skeleton className="h-7 w-48" />
        <div className="grid gap-4 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,30rem)_minmax(0,1fr)]">
          <div className="flex flex-col divide-y rounded-lg border">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex gap-3 p-3">
                <Skeleton className="h-6 w-14" />
                <div className="flex flex-1 flex-col gap-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              </div>
            ))}
          </div>
          <Skeleton className="hidden h-96 lg:block" />
        </div>
      </div>
    </div>
  );
}
