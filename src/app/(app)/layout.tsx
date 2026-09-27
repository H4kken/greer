import Link from "next/link";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { getWorkspaceForUser, requireSession } from "@/lib/session";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { user } = await requireSession();
  const workspace = await getWorkspaceForUser(user.id);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4">
          <Link href="/inbox" className="font-semibold">
            Greer
          </Link>
          <div className="flex items-center gap-2 text-sm">
            <span className="hidden text-muted-foreground sm:inline">
              {workspace?.name} · {user.email}
            </span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        {children}
      </main>
    </div>
  );
}
