import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const execute = vi.hoisted(() => vi.fn());

vi.mock("@/db", () => ({
  db: { execute },
}));

import { POST } from "./route";

describe("POST /api/v2/cron/battle-replay-retention", () => {
  beforeEach(() => {
    execute.mockReset();
    vi.stubEnv("CRON_SECRET", "test-cron-secret");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
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
    expect(execute).not.toHaveBeenCalled();
  });

  it("인증된 요청은 만료 적체를 여러 배치로 처리한 합계를 반환한다", async () => {
    execute
      .mockResolvedValueOnce({ rows: [{ acquired: true, deleted: 1_000 }] })
      .mockResolvedValueOnce({ rows: [{ acquired: true, deleted: 1_000 }] })
      .mockResolvedValueOnce({ rows: [{ acquired: true, deleted: 317 }] });
    const response = await POST(
      new Request("http://localhost/api/v2/cron/battle-replay-retention", {
        method: "POST",
        headers: { Authorization: "Bearer test-cron-secret" },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      deleted: 2_317,
      more: false,
      batchSize: 1_000,
      skipped: false,
    });
  });
});
