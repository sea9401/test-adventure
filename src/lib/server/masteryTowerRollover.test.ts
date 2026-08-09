import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  saves: new Map<string, unknown>(),
  upsertSave: vi.fn(),
}));

vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: vi.fn(
    async (_tx: object, _userId: string, key: string, fallback: unknown) =>
      mocks.saves.get(key) ?? fallback,
  ),
  upsertSave: mocks.upsertSave,
}));

import { settleMasteryTowerRollover } from "./masteryTowerRollover";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.saves.clear();
  mocks.upsertSave.mockImplementation(
    async (_tx: object, _userId: string, key: string, value: unknown) => {
      mocks.saves.set(key, value);
    },
  );
});

describe("숙련의 탑 날짜 변경 정산", () => {
  it("전날 미수령 증서를 기존 인벤토리에 더하고 오늘 진행도를 초기화한다", async () => {
    mocks.saves.set("mastery-tower.v1", {
      date: "2026-07-02",
      todayBestFloor: 18,
      runFloor: 18,
      claimed: false,
      lifetimeBestFloor: 18,
      firstClearRewardsClaimed: [],
      weekStartedAt: "2026-06-29",
      weekBestFloor: 18,
    });
    mocks.saves.set("inventory.v2", {
      masteryCertificates: 60,
      untouched: true,
    });

    const result = await settleMasteryTowerRollover(
      {} as never,
      "u-tower",
      "2026-07-03",
    );

    expect(result.autoClaimedReward?.total).toBe(540);
    expect(result.certificates).toBe(600);
    expect(mocks.saves.get("inventory.v2")).toEqual({
      masteryCertificates: 600,
      untouched: true,
    });
    expect(mocks.saves.get("mastery-tower.v1")).toMatchObject({
      date: "2026-07-03",
      todayBestFloor: 0,
      runFloor: 0,
      firstClearRewardsClaimed: [10],
      weekStartedAt: "2026-06-29",
      weekBestFloor: 18,
    });
  });

  it("새 주에는 주간 최고층만 초기화하고 영구 기록을 보존한다", async () => {
    mocks.saves.set("mastery-tower.v1", {
      date: "2026-08-09",
      todayBestFloor: 37,
      runFloor: 37,
      claimed: true,
      lifetimeBestFloor: 44,
      firstClearRewardsClaimed: [10, 20, 30, 40],
      weekStartedAt: "2026-08-03",
      weekBestFloor: 37,
    });

    const result = await settleMasteryTowerRollover(
      {} as never,
      "u-tower",
      "2026-08-10",
      "2026-08-10",
    );

    expect(result.autoClaimedReward).toBeNull();
    expect(mocks.saves.get("mastery-tower.v1")).toMatchObject({
      date: "2026-08-10",
      todayBestFloor: 0,
      runFloor: 0,
      claimed: false,
      lifetimeBestFloor: 44,
      firstClearRewardsClaimed: [10, 20, 30, 40],
      weekStartedAt: "2026-08-10",
      weekBestFloor: 0,
    });
  });

  it("정산을 반복 호출해도 증서를 중복 지급하지 않는다", async () => {
    mocks.saves.set("mastery-tower.v1", {
      date: "2026-07-02",
      todayBestFloor: 10,
      claimed: false,
      lifetimeBestFloor: 10,
      firstClearRewardsClaimed: [],
    });
    mocks.saves.set("inventory.v2", { masteryCertificates: 5 });

    const first = await settleMasteryTowerRollover(
      {} as never,
      "u-tower",
      "2026-07-03",
    );
    const duplicate = await settleMasteryTowerRollover(
      {} as never,
      "u-tower",
      "2026-07-03",
    );

    expect(first.autoClaimedReward?.total).toBe(300);
    expect(duplicate.autoClaimedReward).toBeNull();
    expect(mocks.saves.get("inventory.v2")).toEqual({
      masteryCertificates: 305,
    });
  });
});
