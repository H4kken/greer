import { SignOutButton } from "@/components/auth/sign-out-button";
import { ThemeMenu } from "@/components/theme-toggle";
import { requireSession } from "@/lib/session";

export default async function OnboardingLayout({ children }: LayoutProps<"/">) {
  await requireSession();
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4">
          <span className="font-heading text-2xl font-semibold tracking-tight">
            Greer
          </span>
          <div className="flex items-center gap-2">
            <ThemeMenu />
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
