import Link from "next/link";
import { redirect } from "next/navigation";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { ThemeMenu } from "@/components/theme-toggle";
import { AppNav } from "@/components/app-nav";
import { Logo } from "@/components/logo";
import { requireWorkspace } from "@/lib/session";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { session, workspace } = await requireWorkspace();
  if (!workspace.onboardedAt) redirect("/onboarding");

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-screen-2xl items-center justify-between gap-4 px-4">
          <div className="flex min-w-0 items-center gap-4 sm:gap-6">
            <Link href="/today" className="text-foreground no-underline">
              <Logo />
            </Link>
            <AppNav />
          </div>
          <div className="flex shrink-0 items-center gap-2 text-sm">
            <span className="hidden text-muted-foreground lg:inline">
              {workspace.name} · {session.user.email}
            </span>
            <ThemeMenu />
            <SignOutButton />
          </div>
        </div>
      </header>
      {/* Pages set their own width; Today starts with a full-width strip. */}
      <main className="flex w-full flex-1 flex-col">{children}</main>
    </div>
  );
}
