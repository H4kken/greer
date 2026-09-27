import Link from "next/link";
import { redirect } from "next/navigation";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { AppNav } from "@/components/app-nav";
import { requireWorkspace } from "@/lib/session";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { session, workspace } = await requireWorkspace();
  if (!workspace.onboardedAt) redirect("/onboarding");

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-screen-2xl items-center justify-between gap-4 px-4">
          <div className="flex items-center gap-6">
            <Link
              href="/inbox"
              className="font-heading text-2xl font-semibold tracking-tight"
            >
              Greer
            </Link>
            <AppNav />
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="hidden text-muted-foreground sm:inline">
              {workspace.name} · {session.user.email}
            </span>
            <SignOutButton />
          </div>
        </div>
      </header>
      {/* Pages set their own width: the inbox uses the full screen. */}
      <main className="flex w-full flex-1 flex-col">{children}</main>
    </div>
  );
}
