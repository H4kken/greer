import { redirect } from "next/navigation";

// The inbox became Today. Old links and bookmarks still land somewhere
// sensible, including a thread picked with ?item=.
export default async function InboxPage({ searchParams }: PageProps<"/inbox">) {
  const { item } = await searchParams;
  redirect(typeof item === "string" ? `/today?p=item:${item}` : "/today");
}
