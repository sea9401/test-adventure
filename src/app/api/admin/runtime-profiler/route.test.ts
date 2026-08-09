import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const snapshotValue = {
    enabled: true,
    intervalMs: 60_000,
    current: {
      startedAt: "2026-08-09T12:00:00.000Z",
      endedAt: "2026-08-09T12:00:30.000Z",
      features: {},
      slowRequests: [],
    },
    history: [],
  };
  return {
    gate: vi.fn(async () => null as Response | null),
    snapshot: vi.fn(() => snapshotValue),
    snapshotValue,
  };
});

vi.mock("@/lib/server/isAdmin", () => ({ requireAdmin: mocks.gate }));
vi.mock("@/lib/server/runtimeProfiler/runtime", () => ({
  getRuntimeProfilerSnapshot: mocks.snapshot,
}));

import { GET } from "./route";

describe("GET /api/admin/runtime-profiler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.gate.mockResolvedValue(null);
  });

  it("관리자에게 현재 프로세스의 프로파일러 스냅샷을 반환한다", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(mocks.snapshotValue);
    expect(mocks.snapshot).toHaveBeenCalledOnce();
  });

  it("관리자 권한이 없으면 프로파일러 스냅샷도 읽지 않는다", async () => {
    mocks.gate.mockResolvedValue(new Response("forbidden", { status: 403 }));

    const response = await GET();

    expect(response.status).toBe(403);
    expect(mocks.snapshot).not.toHaveBeenCalled();
  });
});
