import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  recycleDatabasePool: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: { execute: mocks.execute },
  recycleDatabasePool: mocks.recycleDatabasePool,
}));

import { GET } from "./route";

describe("GET /api/health database recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("DB 핑이 3초 동안 끝나지 않으면 현재 연결 풀을 회전시킨다", async () => {
    mocks.execute.mockReturnValue(new Promise(() => undefined));

    const responsePromise = GET();
    await vi.advanceTimersByTimeAsync(3_001);
    const response = await responsePromise;

    expect(response.status).toBe(503);
    expect(mocks.recycleDatabasePool).toHaveBeenCalledWith("health-check-failed");
  });

  it("DB 핑이 성공하면 연결 풀을 유지한다", async () => {
    mocks.execute.mockResolvedValue({ rows: [{ value: 1 }] });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(mocks.recycleDatabasePool).not.toHaveBeenCalled();
  });
});
