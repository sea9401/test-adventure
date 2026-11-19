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
  rateLimitCount: 0,
}));

vi.mock("@/db", () => ({
  db: { transaction: vi.fn(async (fn: (tx: object) => unknown) => fn({})) },
}));
vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "u-storm-unique"),
}));
vi.mock("@/lib/server/userRateLimit", () => ({
  enforceUserAndIpRateLimit: vi.fn(
    (_request: Request, options: { userLimit: number }) => {
      mocks.rateLimitCount += 1;
      return mocks.rateLimitCount > options.userLimit
        ? Response.json(
            { ok: false, error: "rate_limited", retryAfterSec: 60 },
            { status: 429 },
          )
        : null;
    },
  ),
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

import { STORM_EXPEDITION_SAVE_KEY, stormExpeditionEnemy } from "@/adventure/data/v2/stormExpedition";
import { resolveBattle } from "@/adventure/v2/combat/engine";
import { DEEP_SHOP_SAVE_KEY, parseDeepShopState } from "@/adventure/v2/deepShop";
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
  mocks.rateLimitCount = 0;
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

describe("POST /api/v2/storm-expedition — 일괄 진행 요청 제한", () => {
  it("하루 3회 일괄 진행의 최대 63단계 요청을 1분 제한이 막지 않는다", async () => {
    const responses = [];
    for (let index = 0; index < 63; index += 1) {
      responses.push(await POST(
        new Request("http://localhost/api/v2/storm-expedition", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "invalid" }),
        }),
      ));
    }

    expect(responses.every((response) => response.status !== 429)).toBe(true);
  });
});

describe("POST /api/v2/storm-expedition — 심층 단계", () => {
  const post = (body: unknown) =>
    POST(
      new Request("http://localhost/api/v2/storm-expedition", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
  const saved = () =>
    mocks.saves.get(STORM_EXPEDITION_SAVE_KEY) as {
      attemptsUsed: number;
      clears: number;
      deepBest: number;
      active: { deepStage?: number; mode: string } | null;
    };
  const seed = (extra: Record<string, unknown>) =>
    mocks.saves.set(STORM_EXPEDITION_SAVE_KEY, {
      date: "2099-01-01",
      attemptsUsed: 0,
      active: null,
      clears: 0,
      spFruitPity: 0,
      spFruitObtained: 0,
      ...extra,
    });
  const tokens = () => parseDeepShopState(mocks.saves.get(DEEP_SHOP_SAVE_KEY)).tokens;

  it("완주한 적이 없으면 심층으로 출발할 수 없다", async () => {
    seed({});

    const response = await post({ action: "start", routeId: "thunder", deepStage: 1 });

    expect(response.status).toBe(409);
    const json = await response.json();
    expect(json.error).toBe("deep_stage_locked");
    expect(json.deep).toEqual({ best: 0, maxSelectable: 0 });
    expect(mocks.saves.has(STORM_EXPEDITION_SAVE_KEY) ? saved().active : null).toBeNull();
  });

  it("잘못된 단계 값은 거절한다", async () => {
    seed({ clears: 5 });

    for (const deepStage of [-1, 1.5, "2"]) {
      const response = await post({ action: "start", routeId: "thunder", deepStage });
      expect(response.status).toBe(400);
      expect((await response.json()).error).toBe("invalid_deep_stage");
    }
  });

  it("최고 완주 단계 다음 단계까지 실전과 연습으로 출발할 수 있다", async () => {
    seed({ clears: 5, deepBest: 2 });

    expect((await post({ action: "start", routeId: "thunder", deepStage: 4 })).status).toBe(409);
    const started = await post({ action: "start", routeId: "thunder", deepStage: 3 });
    expect(started.status).toBe(200);
    expect((await started.json()).deep).toEqual({ best: 2, maxSelectable: 3 });
    expect(saved().active?.deepStage).toBe(3);
    expect(saved().attemptsUsed).toBe(1);

    seed({ clears: 5, deepBest: 2 });
    expect((await post({ action: "start", routeId: "thunder", mode: "practice", deepStage: 3 })).status).toBe(200);
    expect(saved().active).toMatchObject({ mode: "practice", deepStage: 3 });
    expect(saved().attemptsUsed).toBe(0);
  });

  it("심층 단계의 적은 단계마다 깊이 8만큼 강하고, 완주하면 증표와 기록을 받는다", async () => {
    seed({ attemptsUsed: 1, clears: 4, deepBest: 2, active: { ...active("normal"), deepStage: 3 } });

    const response = await post({ action: "fight", expectedNodeIndex: 8 });
    const json = await response.json();

    expect(response.status).toBe(200);
    const enemy = vi.mocked(resolveBattle).mock.calls.at(-1)![1] as { hp: number };
    expect(enemy.hp).toBe(stormExpeditionEnemy("thunder", "final_boss", 0, 24).hp);
    expect(json.finalClear).toBe(true);
    expect(json.deepTokensGained).toBe(16);
    expect(json.deep).toEqual({ best: 3, maxSelectable: 4 });
    expect(saved()).toMatchObject({ clears: 5, deepBest: 3, active: null });
    expect(tokens()).toBe(16);
  });

  it("연습 모드로 심층을 완주해도 증표와 기록은 없다", async () => {
    seed({ clears: 4, deepBest: 2, active: { ...active("practice"), deepStage: 3 } });

    const json = await (await post({ action: "fight", expectedNodeIndex: 8 })).json();

    expect(json.practiceCompleted).toBe(true);
    expect(json.deepTokensGained).toBe(0);
    expect(saved()).toMatchObject({ clears: 4, deepBest: 2 });
    expect(tokens()).toBe(0);
  });

  it("심층이 아닌 완주는 증표를 주지 않는다", async () => {
    seed({ attemptsUsed: 1, clears: 4, active: active("normal") });

    const json = await (await post({ action: "fight", expectedNodeIndex: 8 })).json();

    expect(json.finalClear).toBe(true);
    expect(json.deepTokensGained).toBe(0);
    expect(mocks.saves.has(DEEP_SHOP_SAVE_KEY)).toBe(false);
  });
});
