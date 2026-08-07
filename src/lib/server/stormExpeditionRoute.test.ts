import { beforeEach, describe, expect, it, vi } from "vitest";

const { store, resolveBattleMock } = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  resolveBattleMock: vi.fn(),
}));

vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "u-test"),
}));

vi.mock("@/lib/server/userRateLimit", () => ({
  enforceUserAndIpRateLimit: vi.fn(() => null),
}));

vi.mock("@/lib/server/v2BattlePrep", () => ({
  prepareV2BattleActor: vi.fn(async () => ({
    player: {
      maxHp: 1_000,
      player: {
        hp: 1_000,
        maxHp: 1_000,
        mp: 500,
        maxMp: 500,
        atk: 100,
        magicAtk: 100,
        def: 50,
        spd: 50,
        evasionPct: 0,
        attackCount: 1,
      },
    },
    skills: { learned: [], equipped: [] },
  })),
}));

vi.mock("@/adventure/v2/combat/engine", () => ({
  resolveBattle: resolveBattleMock,
}));

vi.mock("@/adventure/data/v2/replayPayload", () => ({
  toReplayPayload: vi.fn(() => ({ log: [], playerMaxHp: 1_000, enemy: { hp: 1 } })),
}));

vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn(async (callback: (tx: unknown) => unknown) =>
      callback({}),
    ),
  },
}));

vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: vi.fn(
    async (_tx: unknown, _userId: string, key: string, fallback: unknown) =>
      store.has(key) ? store.get(key) : fallback,
  ),
  readSave: vi.fn(
    async (_tx: unknown, _userId: string, key: string, fallback: unknown) =>
      store.has(key) ? store.get(key) : fallback,
  ),
  upsertSave: vi.fn(
    async (_tx: unknown, _userId: string, key: string, value: unknown) => {
      store.set(key, value);
    },
  ),
}));

import { POST } from "@/app/api/v2/storm-expedition/route";
import {
  STORM_EXPEDITION_SAVE_KEY,
  stormExpeditionDateKey,
  stormExpeditionEnemy,
} from "@/adventure/data/v2/stormExpedition";
import {
  STORM_EXPEDITION_ROUTE_MATERIAL_ID,
  STORM_EXPEDITION_SP_FRUIT_MATERIAL_ID,
  STORM_ORIGIN_FRAGMENT_MATERIAL_ID,
} from "@/adventure/data/v2/stormExpeditionRewards";

function request(body: unknown): Request {
  return new Request("http://test/api/v2/storm-expedition", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/v2/storm-expedition", () => {
  beforeEach(() => {
    store.clear();
    store.set("character.v2", {
      frontierDepth: 72,
      gold: 1_000,
      materials: {
        [STORM_EXPEDITION_ROUTE_MATERIAL_ID.gale]: 2,
        [STORM_ORIGIN_FRAGMENT_MATERIAL_ID]: 3,
      },
    });
    store.set("equipment.v2", {
      owned: [{ iid: "old", id: "v2_iron_sword" }],
      equipped: { weapon: "old" },
    });
    store.set(STORM_EXPEDITION_SAVE_KEY, {
      date: stormExpeditionDateKey(),
      attemptsUsed: 1,
      clears: 0,
      active: {
        routeId: "gale",
        stage: 2,
        hp: 500,
        mp: 80,
        pendingGold: 46_000,
        pendingMaterials: {
          [STORM_EXPEDITION_ROUTE_MATERIAL_ID.gale]: 4,
          [STORM_ORIGIN_FRAGMENT_MATERIAL_ID]: 1,
        },
        pendingEquipment: [
          {
            iid: "storm-drop",
            id: "v2_storm_gale_bow",
            roll: { power: 550, weight: 0, options: { crit: 12 } },
          },
        ],
      },
    });
    resolveBattleMock.mockReset();
    resolveBattleMock.mockReturnValue({
      outcome: "win",
      turns: 1,
      finalState: { playerHp: 700, playerMp: 300 },
    });
  });

  it("귀환 시 골드·재료·장비를 한 번에 확정하고 임시 가방을 비운다", async () => {
    const response = await POST(request({ action: "withdraw" }));
    const json = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(json).toMatchObject({
      ok: true,
      withdrew: true,
      claimedRewards: true,
      gainedGold: 46_000,
      gainedMaterials: {
        [STORM_EXPEDITION_ROUTE_MATERIAL_ID.gale]: 4,
        [STORM_ORIGIN_FRAGMENT_MATERIAL_ID]: 1,
      },
    });
    expect(store.get("character.v2")).toMatchObject({
      gold: 47_000,
      materials: {
        [STORM_EXPEDITION_ROUTE_MATERIAL_ID.gale]: 6,
        [STORM_ORIGIN_FRAGMENT_MATERIAL_ID]: 4,
      },
    });
    expect(store.get("equipment.v2")).toMatchObject({
      owned: [
        { iid: "old", id: "v2_iron_sword" },
        { iid: "storm-drop", id: "v2_storm_gale_bow" },
      ],
      equipped: { weapon: "old" },
    });
    expect(store.get(STORM_EXPEDITION_SAVE_KEY)).toMatchObject({
      active: null,
      attemptsUsed: 1,
    });
  });

  it("보급품 선택은 한 번만 적용하고 다음 전투 노드로 이동한다", async () => {
    store.set(STORM_EXPEDITION_SAVE_KEY, {
      date: stormExpeditionDateKey(),
      attemptsUsed: 1,
      clears: 0,
      active: {
        version: 2,
        routeId: "gale",
        nodeIndex: 1,
        encounterIndex: 0,
        hp: 600,
        mp: 200,
        maxHp: 1_000,
        maxMp: 500,
        defeatedCount: 2,
        pendingGold: 26_000,
        pendingMaterials: {},
        pendingEquipment: [],
        boons: [],
        nextBattleEffects: [],
        altarOffers: ["tempest_might", "storm_guard", "deep_mana"],
        chosenChoices: {},
      },
    });

    const response = await POST(request({
      action: "choose",
      choiceId: "wind_barrier",
      expectedNodeIndex: 1,
      expectedEncounterIndex: 0,
    }));
    expect(response.status).toBe(200);
    expect(store.get(STORM_EXPEDITION_SAVE_KEY)).toMatchObject({
      active: {
        nodeIndex: 2,
        nextBattleEffects: ["next_guard"],
        chosenChoices: { supply: "wind_barrier" },
      },
    });

    const repeated = await POST(request({
      action: "choose",
      choiceId: "wind_barrier",
      expectedNodeIndex: 1,
      expectedEncounterIndex: 0,
    }));
    expect(repeated.status).toBe(409);
    expect((await repeated.json()) as Record<string, unknown>).toMatchObject({
      error: "stale_state",
    });
  });

  it("깊은 마나 축복은 최대 MP와 현재 MP를 함께 늘린다", async () => {
    store.set(STORM_EXPEDITION_SAVE_KEY, {
      date: stormExpeditionDateKey(),
      attemptsUsed: 1,
      clears: 0,
      active: {
        version: 2,
        routeId: "thunder",
        nodeIndex: 5,
        encounterIndex: 0,
        hp: 800,
        mp: 100,
        maxHp: 1_000,
        maxMp: 500,
        defeatedCount: 5,
        pendingGold: 102_000,
        pendingMaterials: {},
        pendingEquipment: [],
        boons: [],
        nextBattleEffects: [],
        altarOffers: ["tempest_might", "storm_guard", "deep_mana"],
        chosenChoices: {},
      },
    });

    const response = await POST(request({ action: "choose", choiceId: "deep_mana" }));
    expect(response.status).toBe(200);
    expect(store.get(STORM_EXPEDITION_SAVE_KEY)).toMatchObject({
      active: {
        nodeIndex: 6,
        maxMp: 600,
        mp: 200,
        boons: ["deep_mana"],
        chosenChoices: { altar: "deep_mana" },
      },
    });

  });

  it("공통 최종 보스 처치 시 7전투 누적 보상과 확정 재료를 정산한다", async () => {
    store.set(STORM_EXPEDITION_SAVE_KEY, {
      date: stormExpeditionDateKey(),
      attemptsUsed: 1,
      clears: 0,
      active: {
        version: 2,
        routeId: "gale",
        nodeIndex: 8,
        encounterIndex: 0,
        hp: 800,
        mp: 400,
        maxHp: 1_000,
        maxMp: 500,
        defeatedCount: 6,
        pendingGold: 167_000,
        pendingMaterials: {
          [STORM_EXPEDITION_ROUTE_MATERIAL_ID.gale]: 1,
        },
        pendingEquipment: [],
        boons: [],
        nextBattleEffects: [],
        altarOffers: ["tempest_might", "storm_guard", "deep_mana"],
        chosenChoices: {},
      },
    });
    vi.spyOn(Math, "random").mockReturnValue(0.99);

    const response = await POST(request({ action: "fight" }));
    const json = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(json).toMatchObject({
      bossClear: true,
      claimedRewards: true,
      gainedGold: 262_000,
      gainedMaterials: {
        [STORM_EXPEDITION_ROUTE_MATERIAL_ID.gale]: 7,
        [STORM_ORIGIN_FRAGMENT_MATERIAL_ID]: 1,
        v2_storm_heart_fragment: 1,
      },
    });
    expect(store.get("character.v2")).toMatchObject({
      gold: 263_000,
      materials: {
        [STORM_EXPEDITION_ROUTE_MATERIAL_ID.gale]: 9,
        [STORM_ORIGIN_FRAGMENT_MATERIAL_ID]: 4,
        v2_storm_heart_fragment: 1,
      },
    });
    expect(store.get(STORM_EXPEDITION_SAVE_KEY)).toMatchObject({
      clears: 1,
      active: null,
      spFruitPity: 1,
      spFruitObtained: 0,
    });
    vi.restoreAllMocks();
  });

  it("모든 항로가 공유하는 25회 천장에서 SP 열매를 지급하고 누적 횟수를 초기화한다", async () => {
    store.set(STORM_EXPEDITION_SAVE_KEY, {
      date: stormExpeditionDateKey(),
      attemptsUsed: 1,
      clears: 24,
      spFruitPity: 24,
      spFruitObtained: 1,
      active: {
        version: 2,
        routeId: "thunder",
        nodeIndex: 8,
        encounterIndex: 0,
        hp: 800,
        mp: 400,
        maxHp: 1_000,
        maxMp: 500,
        defeatedCount: 6,
        pendingGold: 167_000,
        pendingMaterials: {},
        pendingEquipment: [],
        boons: [],
        nextBattleEffects: [],
        altarOffers: ["tempest_might", "storm_guard", "deep_mana"],
        chosenChoices: {},
      },
    });
    vi.spyOn(Math, "random").mockReturnValue(0.99);

    const response = await POST(request({ action: "fight" }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({
      bossClear: true,
      spFruitDropped: true,
      gainedMaterials: { [STORM_EXPEDITION_SP_FRUIT_MATERIAL_ID]: 1 },
      state: {
        clears: 25,
        spFruitPity: 0,
        spFruitObtained: 2,
      },
    });
    expect(store.get("character.v2")).toMatchObject({
      materials: { [STORM_EXPEDITION_SP_FRUIT_MATERIAL_ID]: 1 },
    });
    expect(store.get(STORM_EXPEDITION_SAVE_KEY)).toMatchObject({
      active: null,
      spFruitPity: 0,
      spFruitObtained: 2,
    });
    vi.restoreAllMocks();
  });

  it("균열 상자를 수락하면 재료 2개와 다음 전투 공격력 위험을 함께 저장한다", async () => {
    store.set(STORM_EXPEDITION_SAVE_KEY, {
      date: stormExpeditionDateKey(),
      attemptsUsed: 1,
      clears: 0,
      active: {
        version: 2,
        routeId: "gale",
        nodeIndex: 1,
        encounterIndex: 0,
        hp: 800,
        mp: 300,
        maxHp: 1_000,
        maxMp: 500,
        defeatedCount: 2,
        pendingGold: 26_000,
        pendingMaterials: {},
        pendingEquipment: [],
        boons: [],
        nextBattleEffects: [],
        altarOffers: ["tempest_might", "storm_guard", "deep_mana"],
        chosenChoices: {},
        riskEvent: {
          id: "rift_cache",
          nodeIndex: 1,
          status: "offered",
          boonId: null,
          curseId: null,
        },
      },
    });

    const blocked = await POST(request({ action: "choose", choiceId: "field_rations" }));
    expect(blocked.status).toBe(409);
    expect(await blocked.json()).toMatchObject({ error: "risk_event_required" });

    const response = await POST(request({
      action: "risk_event",
      decision: "accept",
      expectedNodeIndex: 1,
      expectedEncounterIndex: 0,
    }));
    expect(response.status).toBe(200);
    expect(store.get(STORM_EXPEDITION_SAVE_KEY)).toMatchObject({
      active: {
        nodeIndex: 1,
        pendingMaterials: { [STORM_EXPEDITION_ROUTE_MATERIAL_ID.gale]: 2 },
        nextBattleEffects: ["risk_enemy_fury"],
        riskEvent: { id: "rift_cache", status: "accepted" },
      },
    });

    const earlyWithdraw = await POST(request({ action: "withdraw" }));
    expect(earlyWithdraw.status).toBe(409);
    expect(await earlyWithdraw.json()).toMatchObject({ error: "risk_debt_pending" });

    await POST(request({ action: "choose", choiceId: "field_rations" }));
    await POST(request({ action: "fight" }));
    const foughtEnemy = resolveBattleMock.mock.calls.at(-1)?.[1] as { atk: number };
    expect(foughtEnemy.atk).toBe(
      Math.floor(stormExpeditionEnemy("gale", "late_trash", 0).atk * 1.2),
    );
    expect(store.get(STORM_EXPEDITION_SAVE_KEY)).toMatchObject({
      active: { nextBattleEffects: [] },
    });
  });

  it("황금 나침반을 수락하면 야영 회복 없이 정예 노드로 이동한다", async () => {
    store.set(STORM_EXPEDITION_SAVE_KEY, {
      date: stormExpeditionDateKey(),
      attemptsUsed: 1,
      clears: 0,
      active: {
        version: 2,
        routeId: "wreckage",
        nodeIndex: 3,
        encounterIndex: 0,
        hp: 400,
        mp: 100,
        maxHp: 1_000,
        maxMp: 500,
        defeatedCount: 4,
        pendingGold: 64_000,
        pendingMaterials: {},
        pendingEquipment: [],
        boons: [],
        nextBattleEffects: [],
        altarOffers: ["tempest_might", "storm_guard", "deep_mana"],
        chosenChoices: {},
        riskEvent: {
          id: "golden_compass",
          nodeIndex: 3,
          status: "offered",
          boonId: null,
          curseId: null,
        },
      },
    });

    const response = await POST(request({ action: "risk_event", decision: "accept" }));
    expect(response.status).toBe(200);
    expect(store.get(STORM_EXPEDITION_SAVE_KEY)).toMatchObject({
      active: {
        nodeIndex: 4,
        hp: 400,
        mp: 100,
        chosenChoices: { camp: "golden_compass" },
        riskEvent: { id: "golden_compass", status: "accepted" },
      },
    });

    const fight = await POST(request({
      action: "fight",
      expectedNodeIndex: 4,
      expectedEncounterIndex: 0,
    }));
    expect(fight.status).toBe(200);
    expect(store.get(STORM_EXPEDITION_SAVE_KEY)).toMatchObject({
      active: {
        nodeIndex: 5,
        pendingGold: 115_300,
      },
    });
  });
});
