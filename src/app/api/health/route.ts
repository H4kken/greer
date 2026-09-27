import { checkDatabase, getWorkerHealth } from "@/lib/health";

// Used by Docker/Coolify health checks. 200 as long as the web app can serve
// requests (database reachable); the worker's state is reported, not required,
// so a stuck worker doesn't make the orchestrator restart the web container.
export async function GET() {
  const database = await checkDatabase();
  const worker = database
    ? await getWorkerHealth()
    : { healthy: false, lastSeenAt: null };

  return Response.json(
    {
      status: !database ? "down" : worker.healthy ? "ok" : "degraded",
      database,
      worker,
    },
    { status: database ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
