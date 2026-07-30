import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  saves: new Map<string, unknown>(),
  recordEconomyEventSoon: vi.fn(),
  recordRewardFailureSoon: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn(async (callback: (tx: object) => unknown) => callback({})),
  },
}));
vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "u-attendance"),
}));
vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: vi.fn(
    async (_tx: object, _userId: string, key: string, fallback: unknown) =>
      mocks.saves.get(key) ?? fallback,
  ),
  readSave: vi.fn(
    async (_db: object, _userId: string, key: string, fallback: unknown) =>
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

const JULY_20 = new Date("2026-07-20T03:00:00Z");
const DAY_MS = 86_400_000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(JULY_20);
  vi.clearAllMocks();
  mocks.saves.clear();
  mocks.saves.set("character.v2", {
    class: "warrior",
    gold: 1_000,
    stamina: { current: 500, lastUpdatedAt: JULY_20.getTime() },
  });
});

describe("월간 출석 보상 수령", () => {
  it("1일차에는 지원권 30일을 계정에 직접 적용한다", async () => {
    const response = await POST();
    const json = (await response.json()) as {
      ok: boolean;
      claimedCount: number;
      reward: { kind: string; days: number };
      adventureSupportActiveUntil: number;
    };

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.claimedCount).toBe(1);
    expect(json.reward).toEqual({ kind: "adventure_support", days: 30 });
    expect(json.adventureSupportActiveUntil).toBe(
      JULY_20.getTime() + 30 * DAY_MS,
    );
    expect(mocks.saves.get("monthly-attendance.v1")).toEqual({
      monthKey: "2026-07",
      claimedDayKeys: ["2026-07-20"],
    });

    const character = mocks.saves.get("character.v2") as {
      adventureSupport: { activeUntil: number };
      stamina: { current: number };
    };
    expect(character.adventureSupport.activeUntil).toBe(
      json.adventureSupportActiveUntil,
    );
    expect(character.stamina.current).toBe(1_500);
  });

  it("같은 KST 날짜의 중복 수령은 재화를 더 지급하지 않는다", async () => {
    expect((await POST()).status).toBe(200);
    const characterAfterFirst = mocks.saves.get("character.v2");

    const duplicate = await POST();

    expect(duplicate.status).toBe(409);
    expect((await duplicate.json()).error).toBe("already_claimed");
    expect(mocks.saves.get("character.v2")).toEqual(characterAfterFirst);
  });

  it("다음 날에는 다음 칸의 골드를 지급한다", async () => {
    expect((await POST()).status).toBe(200);
    vi.setSystemTime(new Date(JULY_20.getTime() + DAY_MS));

    const response = await POST();
    const json = (await response.json()) as {
      reward: { kind: string; amount: number };
      claimedCount: number;
      gold: number;
    };

    expect(response.status).toBe(200);
    expect(json.reward).toEqual({ kind: "gold", amount: 50_000 });
    expect(json.claimedCount).toBe(2);
    expect(json.gold).toBe(51_000);
    expect(
      (mocks.saves.get("character.v2") as { gold: number }).gold,
    ).toBe(51_000);
  });
});
