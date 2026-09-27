import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-6 px-4 py-16">
      <p className="text-sm font-medium text-muted-foreground">
        Early development
      </p>
      <h1 className="text-4xl font-semibold tracking-tight text-balance">
        Find the conversations where you can genuinely help.
      </h1>
      <p className="text-lg text-pretty text-muted-foreground">
        Greer watches the communities where your future users talk about their
        problems, tells you why each thread matters, and gives you ideas, not
        AI-written replies. You write the reply yourself.
      </p>
      <div>
        <Button
          nativeButton={false}
          render={
            <a href="https://github.com/H4kken/greer" rel="noreferrer">
              Follow on GitHub
            </a>
          }
        />
      </div>
    </main>
  );
}
