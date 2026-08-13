import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { store, auth, bossSpawn } = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  auth: { userId: "u-danger" as string | null },
  bossSpawn: vi.fn(async () => null),
}));

vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => auth.userId),
}));
vi.mock("@/lib/server/userRateLimit", () => ({
  enforceUserAndIpRateLimit: vi.fn(() => null),
}));
vi.mock("@/lib/server/dangerousFishingBoss", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/server/dangerousFishingBoss")>();
  return {
    ...original,
    drizzleDangerousFishingBossStore: vi.fn(() => ({})),
    maybeSpawnDangerousFishingBoss: bossSpawn,
  };
});
vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn(async (callback: (tx: unknown) => unknown) => {
      const query: Record<string, unknown> = {};
      query.from = () => query;
      query.where = () => query;
      query.for = () => query;
      query.limit = async () => [];
      query.then = (resolve: (rows: unknown[]) => unknown) =>
        Promise.resolve([]).then(resolve);
      return callback({ select: vi.fn(() => query) });
    }),
  },
}));
vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: vi.fn(async (_tx, _uid, key: string, fallback: unknown) =>
    store.has(key) ? store.get(key) : fallback,
  ),
  readSave: vi.fn(async (_tx, _uid, key: string, fallback: unknown) =>
    store.has(key) ? store.get(key) : fallback,
  ),
  upsertSave: vi.fn(async (_tx, _uid, key: string, value: unknown) => {
    store.set(key, value);
  }),
}));

import { GET as STATUS } from "@/app/api/v2/dangerous-fishing/status/route";
import { POST as VOYAGE } from "@/app/api/v2/dangerous-fishing/voyage/route";
import { POST as ENCOUNTER } from "@/app/api/v2/dangerous-fishing/encounter/route";
import { POST as SHOP } from "@/app/api/v2/dangerous-fishing/shop/route";
import {
  DANGEROUS_FISHING_SAVE_KEY,
  emptyDangerousFishingState,
  parseDangerousFishingState,
} from "@/adventure/v2/dangerousFishingState";
import {
  FISHING_PROGRESS_KEY,
  emptyFishingProgression,
} from "@/adventure/v2/fishingProgression";
import { FISHING_WALLET_KEY } from "@/lib/server/fishing/coins";
import { ACTIVITY_GUARD_KEY } from "@/lib/server/activityGuard";
import { MINING_AUTO_KEY } from "@/adventure/v2/autoGathering";

const NOW = 1_800_100_000_000;

function request(path: string, body: Record<string, unknown>): Request {
  return new Request(`http://test/api/v2/dangerous-fishing/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function seedUnlocked() {
  store.clear();
  auth.userId = "u-danger";
  store.set("character.v2", {
    class: "survivor",
    specChoice: "fisher",
    materials: { v2_iron_ore: 3 },
  });
  store.set("proficiency.v2", {
    points: 20,
    groups: { survivor: { cultivations: 0, tier: 1, cumLevel: 10 } },
    caps: {},
    grown: {},
    jobCumLevel: { fisher: 5 },
    jobHistory: ["fisher"],
  });
  store.set("skills.v2", {
    learned: ["v2c_camper_tidereading"],
    equipped: ["v2c_camper_tidereading"],
  });
  store.set(FISHING_PROGRESS_KEY, {
    ...emptyFishingProgression(),
    xp: 14 ** 2 * 35,
  });
  store.set(FISHING_WALLET_KEY, { coins: 150_000 });
}

async function startVoyage(
  zoneId = "shattered_reef",
  depthId = "surface",
) {
  return VOYAGE(request("voyage", { action: "start", zoneId, depthId }));
}

function savedDangerousState() {
  return parseDangerousFishingState(store.get(DANGEROUS_FISHING_SAVE_KEY));
}

describe("위험 해역 개인 Route Handler", () => {
  beforeEach(() => {
    seedUnlocked();
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    bossSpawn.mockClear();
    bossSpawn.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("인증되지 않은 상태 조회를 401로 거부한다", async () => {
    auth.userId = null;
    const response = await STATUS();
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "unauthorized",
    });
  });

  it("낚시 레벨 14는 잠금 안내를 보여주고 출항은 403으로 거부한다", async () => {
    store.set(FISHING_PROGRESS_KEY, {
      ...emptyFishingProgression(),
      xp: 13 ** 2 * 35,
    });
    const status = await STATUS();
    expect(status.status).toBe(200);
    await expect(status.json()).resolves.toMatchObject({
      ok: true,
      heritage: { unlocked: false, fishingLevel: 14 },
    });

    const response = await startVoyage();
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "fishing_level_locked",
      requiredLevel: 15,
    });
  });

  it("존재하지 않는 해역과 아직 해금하지 않은 해역을 거부한다", async () => {
    const invalid = await startVoyage("unknown");
    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toMatchObject({ error: "invalid_zone" });

    const locked = await startVoyage("abyssal_rift", "deep");
    expect(locked.status).toBe(403);
    await expect(locked.json()).resolves.toMatchObject({
      error: "zone_level_locked",
      requiredLevel: 35,
    });
  });

  it("자동 채집 중에는 위험 해역 출항을 409로 거부한다", async () => {
    store.set(MINING_AUTO_KEY, {
      session: {
        sessionId: "mining-auto",
        sourceId: "iron",
        sourceName: "철 광맥",
        materialId: "v2_iron_ore",
        startedAt: NOW,
        readyAt: NOW + 100_000,
        cycleDurationMs: 7_000,
        attempts: 20,
        successRate: 0.9,
        bonusMaterialRate: 0,
        baseXp: 10,
      },
    });
    const response = await startVoyage();
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: "auto_active",
      activeAutoActivity: "mining",
    });
  });

  it("특수 미끼는 유효한 조우가 만들어질 때만 하나 소비한다", async () => {
    await startVoyage();
    const state = savedDangerousState();
    store.set(DANGEROUS_FISHING_SAVE_KEY, {
      ...state,
      baitCounts: { blood_bait: 2 },
    });

    const invalid = await ENCOUNTER(
      request("encounter", { action: "start", baitId: "unknown" }),
    );
    expect(invalid.status).toBe(400);
    expect(savedDangerousState().baitCounts.blood_bait).toBe(2);

    const valid = await ENCOUNTER(
      request("encounter", { action: "start", baitId: "blood_bait" }),
    );
    expect(valid.status).toBe(200);
    expect(savedDangerousState().baitCounts.blood_bait).toBe(1);
    const json = await valid.json();
    expect(json).not.toHaveProperty("state.voyage.encounter.patternSeed");
    expect(json).not.toHaveProperty("encounter.patternSeed");
  });

  it("오래된 revision은 409, 너무 빠른 다음 입력은 429로 거부한다", async () => {
    await startVoyage();
    await ENCOUNTER(
      request("encounter", { action: "start", baitId: "basic_bait" }),
    );
    const active = savedDangerousState().voyage?.encounter;
    if (!active) throw new Error("encounter fixture missing");

    const stale = await ENCOUNTER(
      request("encounter", {
        action: "reel",
        encounterId: active.id,
        revision: active.revision - 1,
      }),
    );
    expect(stale.status).toBe(409);
    await expect(stale.json()).resolves.toMatchObject({ error: "stale" });

    const first = await ENCOUNTER(
      request("encounter", {
        action: "brace",
        encounterId: active.id,
        revision: active.revision,
      }),
    );
    expect(first.status).toBe(200);
    const progressed = savedDangerousState().voyage?.encounter;
    if (!progressed) throw new Error("progressed encounter missing");
    const tooFast = await ENCOUNTER(
      request("encounter", {
        action: "brace",
        encounterId: progressed.id,
        revision: progressed.revision,
      }),
    );
    expect(tooFast.status).toBe(429);
    await expect(tooFast.json()).resolves.toMatchObject({ error: "too_fast" });
  });

  it("성공한 어획을 화물·도감에 기록하고 낚시 XP·최고 계보 숙련·코인을 올린다", async () => {
    await startVoyage();
    await ENCOUNTER(
      request("encounter", { action: "start", baitId: "basic_bait" }),
    );
    const state = savedDangerousState();
    if (!state.voyage?.encounter) throw new Error("encounter fixture missing");
    const encounter = {
      ...state.voyage.encounter,
      behaviorPattern: ["turn"],
      stamina: 5,
      distance: 5,
      nextActionAt: NOW,
    };
    store.set(DANGEROUS_FISHING_SAVE_KEY, {
      ...state,
      voyage: { ...state.voyage, encounter },
    });

    const response = await ENCOUNTER(
      request("encounter", {
        action: "reel",
        encounterId: encounter.id,
        revision: encounter.revision,
      }),
    );
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toMatchObject({
      ok: true,
      event: "caught",
      fishingXpGained: 18,
      masteryGained: 1,
      fishingCoinsGained: 4,
    });
    const saved = savedDangerousState();
    expect(saved.voyage?.cargo).toEqual([
      expect.objectContaining({
        fishId: "razor_sardine",
        materialId: "danger_catch_razor_sardine",
        quantity: 1,
      }),
    ]);
    expect(saved.codex.razor_sardine?.caughtCount).toBe(1);
    expect(
      (store.get(FISHING_PROGRESS_KEY) as { xp: number }).xp,
    ).toBe(14 ** 2 * 35 + 18);
    expect(
      (store.get("proficiency.v2") as { jobCumLevel: Record<string, number> })
        .jobCumLevel.fisher,
    ).toBe(6);
    expect(
      (store.get(FISHING_WALLET_KEY) as { coins: number }).coins,
    ).toBe(150_004);
    expect(store.get(ACTIVITY_GUARD_KEY)).toBeDefined();
    expect(bossSpawn).not.toHaveBeenCalled();

    const duplicate = await ENCOUNTER(
      request("encounter", {
        action: "reel",
        encounterId: encounter.id,
        revision: encounter.revision,
      }),
    );
    expect(duplicate.status).toBe(409);
    expect(savedDangerousState().voyage?.cargo).toHaveLength(1);
  });

  it("위험도 4 이상의 영웅 어획은 같은 처리 안에서 거대어 발견을 판정한다", async () => {
    await startVoyage();
    await ENCOUNTER(
      request("encounter", { action: "start", baitId: "basic_bait" }),
    );
    const state = savedDangerousState();
    if (!state.voyage?.encounter) throw new Error("encounter fixture missing");
    const encounter = {
      ...state.voyage.encounter,
      targetId: "reef_maw_grouper",
      behaviorPattern: ["turn" as const],
      stamina: 5,
      distance: 5,
      nextActionAt: NOW,
    };
    store.set(DANGEROUS_FISHING_SAVE_KEY, {
      ...state,
      voyage: { ...state.voyage, risk: 4, encounter },
    });

    const response = await ENCOUNTER(
      request("encounter", {
        action: "reel",
        encounterId: encounter.id,
        revision: encounter.revision,
      }),
    );

    expect(response.status).toBe(200);
    expect(bossSpawn).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: "u-danger",
        risk: 4,
        rarity: "epic",
        discoveryBonusPct: 5,
        now: new Date(NOW),
      }),
    );
  });

  it("줄이 끊겨도 이미 실은 화물은 보존한다", async () => {
    await startVoyage();
    let state = savedDangerousState();
    if (!state.voyage) throw new Error("voyage fixture missing");
    store.set(DANGEROUS_FISHING_SAVE_KEY, {
      ...state,
      voyage: {
        ...state.voyage,
        cargo: [
          {
            fishId: "ironjaw_tuna",
            materialId: "danger_catch_ironjaw_tuna",
            quantity: 2,
            totalValue: 420,
          },
        ],
      },
    });
    await ENCOUNTER(
      request("encounter", { action: "start", baitId: "basic_bait" }),
    );
    state = savedDangerousState();
    if (!state.voyage?.encounter) throw new Error("encounter fixture missing");
    const encounter = {
      ...state.voyage.encounter,
      tension: state.voyage.encounter.maxTension - 5,
      behaviorPattern: ["charge"],
      nextActionAt: NOW,
    };
    store.set(DANGEROUS_FISHING_SAVE_KEY, {
      ...state,
      voyage: { ...state.voyage, encounter },
    });
    const response = await ENCOUNTER(
      request("encounter", {
        action: "reel",
        encounterId: encounter.id,
        revision: encounter.revision,
      }),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ event: "line_broken" });
    expect(savedDangerousState().voyage?.cargo).toEqual([
      expect.objectContaining({ fishId: "ironjaw_tuna", quantity: 2 }),
    ]);
  });

  it("정상 귀환은 화물을 character.v2 재료로 전부 확정한다", async () => {
    await startVoyage();
    const state = savedDangerousState();
    if (!state.voyage) throw new Error("voyage fixture missing");
    store.set(DANGEROUS_FISHING_SAVE_KEY, {
      ...state,
      voyage: {
        ...state.voyage,
        cargo: [
          {
            fishId: "ironjaw_tuna",
            materialId: "danger_catch_ironjaw_tuna",
            quantity: 3,
            totalValue: 630,
          },
        ],
      },
    });
    const response = await VOYAGE(request("voyage", { action: "return" }));
    expect(response.status).toBe(200);
    expect(savedDangerousState().voyage).toBeNull();
    expect(
      (store.get("character.v2") as { materials: Record<string, number> }).materials,
    ).toEqual({ v2_iron_ore: 3, danger_catch_ironjaw_tuna: 3 });
  });

  it("위험도 5 사고는 50% 상한 내 손실 후 강제 귀환한다", async () => {
    await startVoyage();
    const proficiency = store.get("proficiency.v2") as {
      jobCumLevel: Record<string, number>;
      jobHistory: string[];
    };
    store.set("proficiency.v2", {
      ...proficiency,
      jobCumLevel: { ...proficiency.jobCumLevel, fullcatchking: 1 },
      jobHistory: [...proficiency.jobHistory, "fullcatchking"],
    });
    const state = savedDangerousState();
    if (!state.voyage) throw new Error("voyage fixture missing");
    store.set(DANGEROUS_FISHING_SAVE_KEY, {
      ...state,
      voyage: {
        ...state.voyage,
        risk: 5,
        cargo: [
          {
            fishId: "razor_sardine",
            materialId: "danger_catch_razor_sardine",
            quantity: 10,
            totalValue: 400,
          },
          {
            fishId: "ironjaw_tuna",
            materialId: "danger_catch_ironjaw_tuna",
            quantity: 20,
            totalValue: 600,
          },
        ],
      },
    });
    vi.mocked(Math.random).mockReturnValue(0);
    const response = await ENCOUNTER(
      request("encounter", { action: "start", baitId: "basic_bait" }),
    );
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toMatchObject({ ok: true, incident: true, returned: true });
    expect(json.lostValue).toBeLessThanOrEqual(450);
    expect(savedDangerousState().voyage).toBeNull();
    const materials = (store.get("character.v2") as {
      materials: Record<string, number>;
    }).materials;
    expect(materials.danger_catch_razor_sardine).toBeLessThanOrEqual(10);
    expect(materials.danger_catch_ironjaw_tuna).toBeLessThanOrEqual(20);
  });

  it("상점 구매·장착은 낚시 코인 지갑과 전용 상태를 함께 갱신한다", async () => {
    const buy = await SHOP(
      request("shop", {
        kind: "reel",
        id: "current_reel",
        action: "buy",
      }),
    );
    expect(buy.status).toBe(200);
    expect(savedDangerousState().ownedGear.reels).toContain("current_reel");
    expect(
      (store.get(FISHING_WALLET_KEY) as { coins: number }).coins,
    ).toBe(135_000);

    const equip = await SHOP(
      request("shop", {
        kind: "reel",
        id: "current_reel",
        action: "equip",
      }),
    );
    expect(equip.status).toBe(200);
    expect(savedDangerousState().loadout.reelId).toBe("current_reel");
  });

  it("없는 항해 상태도 스타터 세트로 조회한다", async () => {
    store.delete(DANGEROUS_FISHING_SAVE_KEY);
    const response = await STATUS();
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toMatchObject({
      ok: true,
      state: emptyDangerousFishingState(),
      fishingCoins: 150_000,
    });
  });
});
