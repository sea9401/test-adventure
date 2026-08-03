import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  saves: new Map<string, unknown>(),
  recordEconomyEventSoon: vi.fn(),
  recordRewardFailureSoon: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn(async (callback: (tx: object) => unknown) =>
      callback({}),
    ),
  },
}));
vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "u-tower"),
}));
vi.mock("@/lib/server/userRateLimit", () => ({
  enforceUserAndIpRateLimit: vi.fn(() => null),
}));
vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: vi.fn(
    async (_tx: object, _userId: string, key: string, fallback: unknown) =>
      mocks.saves.get(key) ?? fallback,
  ),
  upsertSave: vi.fn(
    async (_tx: object, _userId: string, key: string, value: unknown) => {
      mocks.saves.set(key, value);
    },
  ),
}));
vi.mock("@/lib/server/economyLog", () => ({
  recordEconomyEventSoon: mocks.recordEconomyEventSoon,
  recordRewardFailureSoon: mocks.recordRewardFailureSoon,
}));

import { POST } from "./route";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-03T03:00:00Z"));
  vi.clearAllMocks();
  mocks.saves.clear();
});

describe("숙련의 탑 보상 수령", () => {
  it("자정 후 첫 수령 요청은 전날 미수령 보상을 자동 지급 성공으로 응답한다", async () => {
    mocks.saves.set("mastery-tower.v1", {
      date: "2026-07-02",
      todayBestFloor: 18,
      runFloor: 18,
      claimed: false,
      lifetimeBestFloor: 18,
      firstClearRewardsClaimed: [],
    });
    mocks.saves.set("inventory.v2", { masteryCertificates: 60 });

    const response = await POST(
      new Request("http://localhost/api/v2/mastery-tower/claim", {
        method: "POST",
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({
      ok: true,
      automatic: true,
      gained: 540,
      certificates: 600,
      autoClaimedReward: {
        previousDate: "2026-07-02",
        previousBestFloor: 18,
        total: 540,
      },
      tower: { date: "2026-07-03", todayBestFloor: 0 },
    });
    expect(mocks.recordEconomyEventSoon).toHaveBeenCalledWith(
      expect.objectContaining({
        quantity: 540,
        detail: expect.objectContaining({ automatic: true }),
      }),
    );
  });

  it("같은 날의 기존 수령은 종전처럼 보상을 지급하고 수령 완료로 저장한다", async () => {
    mocks.saves.set("mastery-tower.v1", {
      date: "2026-07-03",
      todayBestFloor: 10,
      runFloor: 10,
      claimed: false,
      lifetimeBestFloor: 10,
      firstClearRewardsClaimed: [],
    });
    mocks.saves.set("inventory.v2", { masteryCertificates: 5 });

    const response = await POST(
      new Request("http://localhost/api/v2/mastery-tower/claim", {
        method: "POST",
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({
      ok: true,
      automatic: false,
      gained: 300,
      certificates: 305,
    });
    expect(mocks.saves.get("mastery-tower.v1")).toMatchObject({
      claimed: true,
      firstClearRewardsClaimed: [10],
    });
  });
});
