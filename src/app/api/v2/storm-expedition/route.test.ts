import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  saves: new Map<string, unknown>(),
  mintedIds: [] as string[],
  uniqueResult: {
    routeUniqueId: "v2_storm_sig_thunder_return_ring",
    crossUniqueId: "v2_storm_sig_triphase_gloves",
    heartUniqueId: "v2_storm_sig_heart_necklace",
    uniqueIds: [
      "v2_storm_sig_thunder_return_ring",
      "v2_storm_sig_triphase_gloves",
      "v2_storm_sig_heart_necklace",
    ],
  },
  rollUnique: vi.fn(),
  recordUnique: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: { transaction: vi.fn(async (fn: (tx: object) => unknown) => fn({})) },
}));
vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "u-storm-unique"),
}));
vi.mock("@/lib/server/userRateLimit", () => ({
  enforceUserAndIpRateLimit: vi.fn(() => null),
}));
vi.mock("@/lib/server/savesKv", () => ({
  readSave: vi.fn(
    async (_db: object, _userId: string, key: string, fallback: unknown) =>
      mocks.saves.get(key) ?? fallback,
  ),
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
vi.mock("@/lib/server/v2BattlePrep", () => ({
  prepareV2BattleActor: vi.fn(async () => ({
    player: {
      player: {
        hp: 100,
        maxHp: 100,
        mp: 50,
        maxMp: 50,
        atk: 100,
        magicAtk: 100,
        spd: 100,
      },
    },
    skills: { equipped: [] },
  })),
}));
vi.mock("@/adventure/v2/combat/engine", () => ({
  resolveBattle: vi.fn(() => ({
    outcome: "win",
    turns: 1,
    finalState: {
      playerHp: 80,
      playerMp: 40,
      v2SkillCooldowns: {},
    },
  })),
}));
vi.mock("@/adventure/v2/combat/pickAutoAction", () => ({
  pickAutoAction: vi.fn(),
}));
vi.mock("@/adventure/data/v2/replayPayload", () => ({
  toReplayPayload: vi.fn(() => ({ log: [] })),
}));
vi.mock("@/adventure/data/v2/v2EquipMint", () => ({
  mintRolledEquipInstance: vi.fn((id: string) => {
    mocks.mintedIds.push(id);
    return { uid: `mint-${mocks.mintedIds.length}`, id, enhance: 0 };
  }),
}));
vi.mock("@/lib/server/uniqueEquipmentAchievement", () => ({
  recordUniqueEquipmentAcquisitions: mocks.recordUnique,
}));
vi.mock(
  "@/adventure/data/v2/stormExpeditionRewards",
  async (importOriginal) => {
    const actual = await importOriginal<
      typeof import("@/adventure/data/v2/stormExpeditionRewards")
    >();
    return {
      ...actual,
      rollStormExpeditionLoot: vi.fn(() => ({
        materials: {},
        equipmentId: "v2_storm_thunder_ring",
      })),
      rollStormExpeditionUniqueLoot: mocks.rollUnique,
      rollStormExpeditionSpFruit: vi.fn(() => ({
        dropped: false,
        next: { pity: 1, obtained: 0 },
      })),
    };
  },
);

import { STORM_EXPEDITION_SAVE_KEY } from "@/adventure/data/v2/stormExpedition";
import { POST } from "./route";

function active(mode: "normal" | "practice") {
  return {
    version: 2,
    mode,
    routeId: "thunder",
    nodeIndex: 8,
    encounterIndex: 0,
    hp: 100,
    mp: 50,
    maxHp: 100,
    maxMp: 50,
    defeatedCount: 7,
    pendingGold: 0,
    pendingMaterials: {},
    pendingEquipment: [],
    boons: [],
    nextBattleEffects: [],
    usedRecoverySkillIds: [],
    altarOffers: [],
    chosenChoices: {},
    riskEvent: null,
  };
}

beforeEach(() => {
  mocks.saves.clear();
  mocks.mintedIds.length = 0;
  mocks.rollUnique.mockReset().mockReturnValue(mocks.uniqueResult);
  mocks.recordUnique.mockReset().mockResolvedValue(undefined);
  mocks.saves.set("character.v2", { frontierDepth: 78, gold: 0, materials: {} });
  mocks.saves.set("equipment.v2", { owned: [], equipped: {} });
});

describe("POST /api/v2/storm-expedition — 6T 유니크", () => {
  it("최종 보스의 일반 장비와 독립 유니크 3종을 모두 제작·수령·획득 기록한다", async () => {
    mocks.saves.set(STORM_EXPEDITION_SAVE_KEY, {
      date: "2099-01-01",
      attemptsUsed: 1,
      active: active("normal"),
      clears: 0,
      spFruitPity: 0,
      spFruitObtained: 0,
    });

    const response = await POST(
      new Request("http://localhost/api/v2/storm-expedition", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "fight", expectedNodeIndex: 8 }),
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.rollUnique).toHaveBeenCalledWith(
      "thunder",
      "final_boss",
      Math.random,
      { uniqueChanceMultiplier: 1 },
    );
    expect(mocks.mintedIds).toEqual([
      "v2_storm_thunder_ring",
      ...mocks.uniqueResult.uniqueIds,
    ]);
    expect(json.gainedEquipment.map((item: { id: string }) => item.id)).toEqual(
      mocks.mintedIds,
    );
    const equipment = mocks.saves.get("equipment.v2") as {
      owned: Array<{ id: string }>;
    };
    expect(equipment.owned.map((item) => item.id)).toEqual(mocks.mintedIds);
    expect(mocks.recordUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        evidence: expect.objectContaining({
          acquiredIds: mocks.uniqueResult.uniqueIds,
        }),
      }),
    );
  });

  it("연습 모드는 유니크를 굴리거나 제작하지 않는다", async () => {
    mocks.saves.set(STORM_EXPEDITION_SAVE_KEY, {
      date: "2099-01-01",
      attemptsUsed: 0,
      active: active("practice"),
      clears: 0,
      spFruitPity: 0,
      spFruitObtained: 0,
    });

    const response = await POST(
      new Request("http://localhost/api/v2/storm-expedition", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "fight", expectedNodeIndex: 8 }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.rollUnique).not.toHaveBeenCalled();
    expect(mocks.mintedIds).toEqual([]);
    expect(mocks.recordUnique).not.toHaveBeenCalled();
  });
});
