import { Skeleton } from "@/components/ui/skeleton";

// Shaped like the People page: the map and the person panel.
export default function PeopleLoading() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading your people"
      className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8"
    >
      <div className="flex flex-col gap-2">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Skeleton className="aspect-square w-full max-w-[44rem] rounded-3xl" />
        <div className="flex flex-col gap-4">
          <Skeleton className="h-72 rounded-2xl" />
          <Skeleton className="h-44 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
