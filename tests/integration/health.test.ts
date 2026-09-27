import { beforeEach, describe, expect, it } from "vitest";
import { GET } from "@/app/api/health/route";
import { db } from "@/db";
import { recordHeartbeat } from "@/worker/jobs/heartbeat";
import { truncateAll } from "../helpers/truncate";

describe("GET /api/health", () => {
  beforeEach(truncateAll);

  it("is degraded but 200 when the database is up and the worker is silent", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      status: "degraded",
      database: true,
      worker: { healthy: false },
    });
  });

  it("is ok once the worker has reported in", async () => {
    await recordHeartbeat(db);
    const body = await (await GET()).json();
    expect(body).toMatchObject({ status: "ok", worker: { healthy: true } });
  });
});
