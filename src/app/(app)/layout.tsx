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
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4">
          <div className="flex items-center gap-6">
            <Link href="/inbox" className="font-semibold">
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
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        {children}
      </main>
    </div>
  );
}
