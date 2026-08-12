import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cleanup = vi.hoisted(() => vi.fn());

vi.mock("@/lib/server/battleReplayRetention", () => ({
  deleteExpiredBattleReplayBatch: cleanup,
}));

import { POST } from "./route";

describe("POST /api/v2/cron/battle-replay-retention", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-cron-secret";
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it("크론 인증이 없으면 DB 정리를 실행하지 않는다", async () => {
    const response = await POST(
      new Request("http://localhost/api/v2/cron/battle-replay-retention", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      ok: false,
      error: "unauthorized",
    });
    expect(cleanup).not.toHaveBeenCalled();
  });

  it("인증된 요청은 한 번의 제한 배치 결과를 반환한다", async () => {
    cleanup.mockResolvedValue({ deleted: 5_000, more: true, batchSize: 5_000 });
    const response = await POST(
      new Request("http://localhost/api/v2/cron/battle-replay-retention", {
        method: "POST",
        headers: { Authorization: "Bearer test-cron-secret" },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      deleted: 5_000,
      more: true,
      batchSize: 5_000,
    });
  });
});
