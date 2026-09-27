// Runs once when the web server starts, before it handles any request.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { dropEmptyEnv } = await import("@/lib/env");
    dropEmptyEnv();
  }
}
