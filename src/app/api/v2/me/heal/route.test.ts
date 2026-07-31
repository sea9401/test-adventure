import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  character: {} as Record<string, unknown>,
  upsertSave: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn(async (callback: (tx: object) => unknown) => callback({})),
  },
}));
vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "u-healing"),
}));
vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: vi.fn(async () => mocks.character),
  upsertSave: mocks.upsertSave,
}));
vi.mock("@/lib/server/derivePlayerCombatV2", () => ({
  derivePlayerCombatV2: vi.fn(async () => ({
    maxHp: 120,
    player: { maxMp: 40 },
  })),
}));
vi.mock("@/adventure/data/v2/coreLoopConfig", () => ({
  V2_CORE_LOOP_V2: false,
  spendGold: (gold: number, bankedGold: number) => ({ gold, bankedGold }),
}));
vi.mock("@/adventure/data/v2/settlementWarfareConfig", () => ({
  V2_SETTLEMENT_WARFARE: false,
  WAR_VIGOR_FULL_RECOVERY_MS: 600_000,
  HOTSPRING_VIGOR_RECOVERY_DIVISOR: 2,
}));

import { POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-01T00:00:00Z"));
  mocks.character = {
    hp: 120,
    mp: 40,
    hpRegenSince: Date.now() - 10_000,
    gold: 50,
    bankedGold: 100,
  };
});

describe("POST /api/v2/me/heal", () => {
  it("HP와 MP가 이미 가득 차 있어도 치료소 방문을 완료한다", async () => {
    const response = await POST();
    const json = (await response.json()) as {
      ok: boolean;
      hp: number;
      mp: number;
      cost: number;
    };

    expect(response.status).toBe(200);
    expect(json).toMatchObject({ ok: true, hp: 120, mp: 40, cost: 0 });
    expect(mocks.upsertSave).toHaveBeenCalledWith(
      {},
      "u-healing",
      "character.v2",
      expect.objectContaining({
        hp: 120,
        mp: 40,
        gold: 50,
        bankedGold: 100,
        hasHealed: true,
        hpRegenSince: Date.now(),
      }),
    );
  });
});
