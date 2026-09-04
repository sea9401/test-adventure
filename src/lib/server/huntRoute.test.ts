// 사냥 라우트(POST /api/v2/dungeon/hunt) 통합 테스트 — 핸들러를 in-memory savesKv 스토어
// 위에서 end-to-end 로 돌린다. DB I/O 경계(savesKv 헬퍼·db.transaction·ensureUser·getGuildId·
// serverFeed)만 모킹하고 라우트 본문(전투 resolve·EXP·드랍·숙련도·세이브 변형)은 REAL 코드를
// 그대로 실행한다. tx 모킹은 raw 쿼리를 "항상 빈 결과/no-op" 로 받는 최소 체인 — outpostId
// 경로에서 occupations FOR SHARE 가 빈 결과 = 미점령 거점으로 동작한다.
//
// PR-perf(사냥 배치 read 폴드)의 안전망: skills/proficiency 를 upfront lock-read 해 derive 에
// 4개 모두 preload 한다. preload 가 빠지면(회귀) REAL derive 래퍼가 더미 tx({}) 에 .select() 를
// 호출해 throw → 이 테스트가 실패한다. 즉 "사냥이 성공한다"는 사실 자체가 폴드 배선을 검증한다.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyStochasticPercentBonus } from "@/lib/percentBonus";
import { CODEX_MASTERY_CATALOG } from "@/adventure/data/v2/codexMasteryProductionCatalog";
import type { CodexMasteryGameplayEvent } from "@/lib/server/codexMasteryGameplay";

// vi.mock 팩토리는 호이스팅되므로 공유 스토어는 vi.hoisted 로.
const {
  deferLongBattleReplays,
  insertTargets,
  rewardReferralTutorialTasks,
  recordCodexMasteryGameplayBatch,
  huntDropOverride,
  store,
} = vi.hoisted(() => ({
  deferLongBattleReplays: vi.fn(
    async (_executor: unknown, _userId: string, payloads: unknown[]) =>
      payloads,
  ),
  insertTargets: [] as unknown[],
  rewardReferralTutorialTasks: vi.fn(async () => ({
    staminaPotions: 0,
    newlyCompletedTaskIds: [] as string[],
    completedTaskIds: [] as string[],
  })),
  recordCodexMasteryGameplayBatch: vi.fn(
    async (
      _executor: unknown,
      _userId: string,
      _events: readonly CodexMasteryGameplayEvent[],
      _now: Date,
    ) => [],
  ),
  huntDropOverride: {
    equipmentId: null as string | null,
    uniqueId: null as string | null,
    beforeRoll: null as (() => void) | null,
  },
  store: new Map<string, unknown>(),
}));

vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "u-test"),
}));
vi.mock("@/adventure/data/v2/coreLoopConfig", async (importActual) => {
  const actual =
    await importActual<typeof import("@/adventure/data/v2/coreLoopConfig")>();
  return {
    ...actual,
    V2_EQUIPMENT_LIBERATION: true,
    V2_UNEXPLORED: true,
  };
});
vi.mock("@/lib/server/v2EnsureSoloGuild", () => ({
  getGuildId: vi.fn(async () => null),
}));
vi.mock("@/lib/server/serverFeed", () => ({
  insertFeedEntry: vi.fn(async () => {}),
  resolveUserDisplayName: vi.fn(async () => "이름 없는 모험가"),
}));
vi.mock("@/lib/server/referrals", () => ({ rewardReferralTutorialTasks }));
vi.mock("@/lib/server/codexMasteryGameplay", () => ({
  recordCodexMasteryGameplayBatch,
}));
vi.mock("@/app/api/v2/dungeon/hunt/huntDrops", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/app/api/v2/dungeon/hunt/huntDrops")
  >();
  return {
    ...actual,
    rollHuntDrops: (
      params: Parameters<typeof actual.rollHuntDrops>[0],
    ): ReturnType<typeof actual.rollHuntDrops> => {
      const result = actual.rollHuntDrops(params);
      if (!huntDropOverride.equipmentId && !huntDropOverride.uniqueId) return result;
      const forced = [
        huntDropOverride.equipmentId
          ? { iid: "forced-regular", id: huntDropOverride.equipmentId }
          : null,
        huntDropOverride.uniqueId
          ? { iid: "forced-unique", id: huntDropOverride.uniqueId }
          : null,
      ].filter((entry): entry is { iid: string; id: string } => entry !== null);
      return {
        ...result,
        droppedEquipment: huntDropOverride.equipmentId,
        droppedUnique: huntDropOverride.uniqueId,
        nextOwned: [...params.ownedEquip, ...forced],
      } as ReturnType<typeof actual.rollHuntDrops>;
    },
    rollHuntDropsRepeated: (
      params: Parameters<typeof actual.rollHuntDropsRepeated>[0],
    ): ReturnType<typeof actual.rollHuntDropsRepeated> => {
      huntDropOverride.beforeRoll?.();
      const result = actual.rollHuntDropsRepeated(params);
      if (!huntDropOverride.equipmentId && !huntDropOverride.uniqueId) {
        return result;
      }
      const repeats = Math.max(0, Math.floor(params.rewardRolls));
      const droppedEquipments = huntDropOverride.equipmentId
        ? Array.from({ length: repeats }, () => huntDropOverride.equipmentId!)
        : [];
      const droppedUniques = huntDropOverride.uniqueId
        ? Array.from({ length: repeats }, () => huntDropOverride.uniqueId!)
        : [];
      const forced = [...droppedEquipments, ...droppedUniques].map(
        (id, index) => ({ iid: `forced-${index}`, id }),
      );
      return {
        ...result,
        droppedEquipments,
        droppedUniques,
        nextOwned: [...params.ownedEquip, ...forced],
      } as ReturnType<typeof actual.rollHuntDropsRepeated>;
    },
  };
});
vi.mock("@/lib/server/battleReplayStore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/battleReplayStore")>()),
  deferLongBattleReplays,
}));
// tx/db raw 쿼리 — 모든 select 체인은 빈 결과, insert 는 no-op. 솔로 경로는 안 타고,
// outpostId 경로에선 occupations FOR SHARE [] = 미점령 거점으로 동작.
vi.mock("@/db", () => {
  const chain: Record<string, unknown> = {};
  chain.from = () => chain;
  chain.where = () => chain;
  chain.orderBy = () => chain;
  chain.for = async () => [];
  chain.limit = async () => [];
  const tx = {
    select: () => chain,
    insert: (target: unknown) => {
      insertTargets.push(target);
      return {
        values: () => ({ onConflictDoUpdate: async () => undefined }),
      };
    },
  };
  return {
    db: {
      transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(tx)),
      select: () => chain,
    },
  };
});
// savesKv 헬퍼 — 단일 유저 in-memory 스토어. lock/read 는 같은 read(테스트는 동시성 미검증),
// upsert 는 덮어쓰기. read-your-writes(배치 판간 이월)가 store 갱신으로 자연히 재현된다.
vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: vi.fn(async (_tx, _uid, key: string, fallback: unknown) =>
    store.has(key) ? store.get(key) : fallback,
  ),
  lockSavesForUpdate: vi.fn(
    async (_tx, _uid, fallbacks: Record<string, unknown>) =>
      Object.fromEntries(
        Object.entries(fallbacks).map(([key, fallback]) => [
          key,
          store.has(key) ? store.get(key) : fallback,
        ]),
      ),
  ),
  readSave: vi.fn(async (_tx, _uid, key: string, fallback: unknown) =>
    store.has(key) ? store.get(key) : fallback,
  ),
  readSaves: vi.fn(async (_tx, _uid, fallbacks: Record<string, unknown>) =>
    Object.fromEntries(
      Object.entries(fallbacks).map(([key, fallback]) => [
        key,
        store.has(key) ? store.get(key) : fallback,
      ]),
    ),
  ),
  upsertSave: vi.fn(async (_tx, _uid, key: string, value: unknown) => {
    store.set(key, value);
  }),
  upsertSaves: vi.fn(async (_tx, _uid, entries: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(entries)) store.set(key, value);
  }),
}));

import { POST } from "@/app/api/v2/dungeon/hunt/route";
import {
  lockSaveForUpdate,
  lockSavesForUpdate,
  readSaves,
  upsertSave,
  upsertSaves,
} from "@/lib/server/savesKv";
import { GUILD_DINING_USER_SAVE_KEY } from "@/adventure/data/v2/guildDining";
import { battleReplays } from "@/db/schema";
import { kstWeekMondayKey } from "@/lib/kst";
import { proficiencyPerKillAtDepth } from "@/adventure/data/v2/proficiency";
import { requiredExpToNext } from "@/lib/leveling";
import {
  OUTPOSTS,
  START_OUTPOST_ID,
} from "@/adventure/data/v2/outposts";
import {
  GROWTH_LEAP_SAVE_KEY,
  activateGrowthLeap,
} from "@/adventure/data/v2/growthLeap";

function seedStrongWarrior() {
  store.clear();
  // 강한 전사 — 입구 대표 depth 2(들판) 몹을 확정 처치하도록 grown.str 크게 + cap 넉넉히.
  store.set("character.v2", {
    class: "warrior",
    // 30 = tier1 레벨캡(50) 한참 아래 → EXP 가 캡에 안 막히고 누적된다.
    level: 30,
    exp: 0,
    gold: 1000,
    hp: 999999,
    stamina: { current: 5000, lastUpdatedAt: 1 },
    frontierDepth: 2,
  });
  store.set("equipment.v2", {
    // power 160 유니크 대검 — 장비 위력은 cap 무관이라 atk ~175, depth1 몹 확정 1타.
    owned: [{ iid: "w1", id: "v2_cave_greatsword" }],
    equipped: { weapon: "w1" },
  });
  store.set("proficiency.v2", {
    groups: { warrior: { tier: 1, points: 0, cumLevel: 30 } },
    grown: { str: 50, vit: 50 },
  });
  store.set("skills.v2", { learned: [], equipped: [] });
  store.set("inventory.v2", { hpCharges: 0, mpCharges: 0 });
  store.set("adventure-log.v2", { monsters: {}, battleLosses: 0 });
  const growthLeap = activateGrowthLeap({}, Date.now() - 1_000);
  if (!growthLeap.ok) throw new Error("expected growth leap activation");
  store.set(GROWTH_LEAP_SAVE_KEY, growthLeap.state);
}

function overpowerSeededWarrior() {
  store.set("equipment.v2", {
    owned: [{ iid: "w1", id: "v2_storm_gale_bow" }],
    equipped: { weapon: "w1" },
  });
  store.set("proficiency.v2", {
    groups: { warrior: { tier: 1, points: 0, cumLevel: 30 } },
    grown: { str: 50_000, vit: 50_000, dex: 50_000, luk: 50_000 },
  });
}

function huntReq(body: Record<string, unknown>): Request {
  return new Request("http://t/api/v2/dungeon/hunt", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/v2/dungeon/hunt — 통합(폴드 안전망)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insertTargets.length = 0;
    seedStrongWarrior();
    huntDropOverride.equipmentId = null;
    huntDropOverride.uniqueId = null;
    huntDropOverride.beforeRoll = null;
    // 결정적 RNG — 0.5 는 명중 임계(missPct ~6) 위라 평타 적중, 크리/추가타 임계 아래라 단타.
    // 강한 무기(atk ~175) + 우호 명중 → depth1 몹 확정 1타 처치.
    vi.spyOn(Math, "random").mockReturnValue(0.5);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("단판(count=1) 승리 — 200 + EXP/골드/숙련도/킬로그 갱신, 스태미나 1 차감", async () => {
    const res = await POST(huntReq({ floor: 2 }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      ok: boolean;
      result: {
        floor: number;
        won: boolean;
        expGained: number;
        expAfter: number;
        proficiencyGained: number;
        proficiencyPointsAfter: number;
        masteryGained: number;
        masteryAfter: number | null;
        goldGained: number;
        goldAfter: number;
        enemyName: string;
        exploration?: unknown;
      };
    };
    expect(json.ok).toBe(true);
    expect(json.result.floor).toBe(2);
    // 강한 전사 + 우호 RNG → 확정 승리.
    expect(json.result.won).toBe(true);
    expect(json.result.expGained).toBeGreaterThan(0);
    expect(json.result.expAfter).toBe(json.result.expGained);
    expect(json.result.proficiencyGained).toBe(proficiencyPerKillAtDepth(2));
    expect(json.result.proficiencyPointsAfter).toBe(
      json.result.proficiencyGained,
    );
    expect(json.result.masteryGained).toBe(1);
    expect(json.result.masteryAfter).toBe(31);
    expect(json.result.goldAfter).toBe(1000 + json.result.goldGained);
    expect(json.result.exploration).toBeUndefined();

    // 세이브 권위 반영 확인.
    const char = store.get("character.v2") as { exp: number; stamina: { current: number } };
    expect(char.exp).toBeGreaterThan(0);
    expect(char.stamina.current).toBe(4999); // 5000 - HUNT_COST(1)
    expect(store.get(GROWTH_LEAP_SAVE_KEY)).toMatchObject({
      mission: { staminaSpent: 1 },
    });
    const prof = store.get("proficiency.v2") as {
      points: number;
      groups: { warrior?: { cumLevel?: number } };
      jobCumLevel?: Record<string, number>;
    };
    expect(prof.points).toBe(proficiencyPerKillAtDepth(2)); // 전역 잔액
    expect(prof.groups.warrior?.cumLevel).toBe(31); // 기존 30 + 승리 숙련도 1
    expect(prof.jobCumLevel?.warrior).toBe(1);
    const log = store.get("adventure-log.v2") as {
      monsters: Record<string, { kills?: number }>;
    };
    expect(log.monsters[json.result.enemyName]?.kills).toBe(1);
    expect(recordCodexMasteryGameplayBatch).toHaveBeenCalledOnce();
    expect(recordCodexMasteryGameplayBatch).toHaveBeenCalledWith(
      expect.anything(),
      "u-test",
      [
        {
          category: "monster",
          entryId: "박쥐",
          amount: 1,
          source: "hunt.victory",
        },
        {
          category: "job",
          entryId: "warrior",
          amount: 1,
          source: "job.victory",
        },
      ],
      expect.any(Date),
    );
  });

  it("100레벨 일반 사냥 승리 한 번을 탐사 경험치 1로 전환한다", async () => {
    const current = store.get("character.v2") as Record<string, unknown>;
    store.set("character.v2", { ...current, level: 100, exp: 0 });
    overpowerSeededWarrior();
    store.set("proficiency.v2", {
      groups: { warrior: { tier: 4, points: 0, cumLevel: 1_000 } },
      grown: { str: 50_000, vit: 50_000, dex: 50_000, luk: 50_000 },
    });

    const res = await POST(huntReq({ floor: 2 }));
    const json = (await res.json()) as {
      ok: boolean;
      result: {
        won: boolean;
        expGained: number;
        exploration?: {
          xpGained: number;
          xpAfter: number;
          xpPoints: number;
          pointsGained: number;
        };
      };
    };

    expect(res.status).toBe(200);
    expect(json.result.won).toBe(true);
    expect(json.result.exploration).toEqual({
      xpGained: 1,
      xpAfter: 1,
      xpPoints: 1,
      pointsGained: 1,
    });
    expect(store.get("character.v2")).toMatchObject({
      level: 100,
      exp: 0,
      unexplored: {
        explorationXp: 1,
        explorationProgressVersion: 2,
        xpPoints: 1,
      },
    });
  });

  it("100레벨 일괄 사냥은 실제 승리 수만큼 탐사 경험치를 누적한다", async () => {
    const current = store.get("character.v2") as Record<string, unknown>;
    store.set("character.v2", {
      ...current,
      level: 100,
      exp: 0,
      adventureSupport: { expiresAt: Date.now() + 60_000 },
    });
    overpowerSeededWarrior();
    store.set("proficiency.v2", {
      groups: { warrior: { tier: 4, points: 0, cumLevel: 1_000 } },
      grown: { str: 50_000, vit: 50_000, dex: 50_000, luk: 50_000 },
    });

    const res = await POST(huntReq({ floor: 2, count: 2 }));
    const json = (await res.json()) as {
      batch: {
        completed: number;
        wins: number;
        totalExp: number;
        exploration?: {
          xpGained: number;
          xpAfter: number;
          xpPoints: number;
          pointsGained: number;
        };
      };
    };

    expect(res.status).toBe(200);
    expect(json.batch).toMatchObject({ completed: 2, wins: 2 });
    expect(json.batch.exploration).toEqual({
      xpGained: 2,
      xpAfter: 2,
      xpPoints: 1,
      pointsGained: 1,
    });
  });

  it("미개척지 승리는 v1 도감에 없는 몬스터 이벤트로 사냥을 중단하지 않는다", async () => {
    const current = store.get("character.v2") as Record<string, unknown>;
    store.set("character.v2", {
      ...current,
      level: 100,
      exp: 0,
      unexplored: { selectedNodeIds: ["start"] },
    });
    overpowerSeededWarrior();
    store.set("proficiency.v2", {
      groups: { warrior: { tier: 4, points: 0, cumLevel: 1_000 } },
      caps: {
        str: 1_000_000,
        vit: 1_000_000,
        dex: 1_000_000,
        int: 1_000_000,
        spi: 1_000_000,
        luk: 1_000_000,
      },
      grown: {
        str: 1_000_000,
        vit: 1_000_000,
        dex: 1_000_000,
        int: 1_000_000,
        spi: 1_000_000,
        luk: 1_000_000,
      },
    });
    recordCodexMasteryGameplayBatch.mockImplementationOnce(
      async (_executor, _userId, events) => {
        const unknown = events.find(
          (event) => !CODEX_MASTERY_CATALOG.get(event.category, event.entryId),
        );
        if (unknown) throw new Error(`unknown_entry:${unknown.entryId}`);
        return [];
      },
    );

    const response = await POST(huntReq({ mode: "unexplored" }));
    const json = (await response.json()) as {
      result: { won: boolean; enemyName: string };
    };

    expect(response.status).toBe(200);
    expect(json.result.won).toBe(true);
    const events = recordCodexMasteryGameplayBatch.mock.calls[0]?.[2] ?? [];
    expect(events.filter((event) => event.category === "monster")).toEqual([]);
  });

  it("미개척지 기본 장비는 2,000승당 1개 경계보다 높은 굴림에서 드랍하지 않는다", async () => {
    // Break caught: unexplored mode forwards the unmodified depth-84 regular
    // equipment chance (0.15%) into the shared hunt drop pipeline.
    const current = store.get("character.v2") as Record<string, unknown>;
    store.set("character.v2", {
      ...current,
      level: 100,
      exp: 0,
      unexplored: { selectedNodeIds: ["start"] },
    });
    overpowerSeededWarrior();
    store.set("proficiency.v2", {
      groups: { warrior: { tier: 4, points: 0, cumLevel: 1_000 } },
      caps: {
        str: 1_000_000,
        vit: 1_000_000,
        dex: 1_000_000,
        int: 1_000_000,
        spi: 1_000_000,
        luk: 1_000_000,
      },
      grown: { str: 1_000_000, vit: 1_000_000, dex: 1_000_000, luk: 1_000_000 },
    });
    huntDropOverride.beforeRoll = () => {
      vi.mocked(Math.random).mockReturnValue(0.0005);
    };

    const response = await POST(huntReq({ mode: "unexplored" }));
    const json = (await response.json()) as {
      result: {
        won: boolean;
        droppedEquipment: string | null;
        droppedUnique: string | null;
      };
    };

    expect(response.status).toBe(200);
    expect(json.result.won).toBe(true);
    expect(json.result.droppedEquipment).toBeNull();
    expect(json.result.droppedUnique).toBeNull();
  });

  it.each(["survivor", "mutant"] as const)(
    "0단계 직업 %s은 직업 숙련도를 적립하면서 도감에 없는 직업 이벤트를 만들지 않는다",
    async (classId) => {
      // Break caught: a tier-zero job is sent to the mastery catalog and aborts
      // the otherwise successful hunt transaction with unknown_entry.
      const char = store.get("character.v2") as Record<string, unknown>;
      store.set("character.v2", { ...char, class: classId });
      store.set("proficiency.v2", {
        groups: { [classId]: { tier: 0, points: 0, cumLevel: 0 } },
        grown: {
          str: 50_000,
          vit: 50_000,
          dex: 50_000,
          luk: 50_000,
        },
      });
      recordCodexMasteryGameplayBatch.mockImplementationOnce(
        async (_executor, _userId, events) => {
          const unknown = events.find(
            (event) => !CODEX_MASTERY_CATALOG.get(event.category, event.entryId),
          );
          if (unknown) throw new Error(`unknown_entry:${unknown.entryId}`);
          return [];
        },
      );

      const response = await POST(huntReq({ floor: 2 }));

      expect(response.status).toBe(200);
      const events = recordCodexMasteryGameplayBatch.mock.calls[0]?.[2] ?? [];
      expect(events.filter((event) => event.category === "job")).toEqual([]);
      const proficiency = store.get("proficiency.v2") as {
        groups: Record<string, { cumLevel?: number }>;
        jobCumLevel?: Record<string, number>;
      };
      expect(proficiency.groups[classId]?.cumLevel).toBe(1);
      expect(proficiency.jobCumLevel?.[classId]).toBe(1);
    },
  );

  it("실제 정규·유니크 장비 드롭을 단판과 배치 수집기에 각각 기록한다", async () => {
    // Break caught: equipment is persisted by huntDrops but only monster/job mastery is flushed.
    huntDropOverride.equipmentId = "v2_iron_sword";
    huntDropOverride.uniqueId = "v2_storm_gale_bow";

    const response = await POST(huntReq({ floor: 2, count: 2 }));

    expect(response.status).toBe(200);
    expect(recordCodexMasteryGameplayBatch).toHaveBeenCalledOnce();
    const events = recordCodexMasteryGameplayBatch.mock.calls[0]?.[2] ?? [];
    expect(events.filter((event) => event.category === "equipment")).toEqual([
      {
        category: "equipment",
        entryId: "v2_iron_sword",
        amount: 1,
        source: "equipment.drop",
      },
      {
        category: "equipment",
        entryId: "v2_storm_gale_bow",
        amount: 1,
        source: "equipment.drop",
      },
      {
        category: "equipment",
        entryId: "v2_iron_sword",
        amount: 1,
        source: "equipment.drop",
      },
      {
        category: "equipment",
        entryId: "v2_storm_gale_bow",
        amount: 1,
        source: "equipment.drop",
      },
    ]);
  });

  it("단판 성공의 나머지 save 잠금·읽기·최종 쓰기를 각각 한 쿼리로 묶는다", async () => {
    const res = await POST(huntReq({ floor: 2 }));

    expect(res.status).toBe(200);
    expect(lockSavesForUpdate).toHaveBeenCalledTimes(1);
    expect(readSaves).toHaveBeenCalledTimes(1);
    expect(upsertSaves).toHaveBeenCalledTimes(1);
    expect(upsertSave).toHaveBeenCalledTimes(1);
    expect(vi.mocked(upsertSave).mock.calls[0][2]).toBe(GROWTH_LEAP_SAVE_KEY);
  });

  it("활성 v2 음식의 사냥 경험치와 골드 버프를 적용한다", async () => {
    const baselineRes = await POST(huntReq({ floor: 2 }));
    const baseline = (await baselineRes.json()) as {
      result: { expGained: number; goldGross: number };
    };

    seedStrongWarrior();
    const char = store.get("character.v2") as Record<string, unknown>;
    store.set("character.v2", {
      ...char,
      activeFoodBuff: {
        recipeId: "herb_tea",
        recipeName: "깨달음의 허브차",
        effect: { huntExpPct: 15, huntGoldPct: 15 },
        quality: "normal",
        expiresAt: Date.now() + 60 * 60 * 1000,
      },
    });

    const boostedRes = await POST(huntReq({ floor: 2 }));
    expect(boostedRes.status).toBe(200);
    const boosted = (await boostedRes.json()) as {
      result: {
        expGained: number;
        foodExpBuff: {
          name: string;
          expPct: number;
          expBonus: number;
        };
        foodGoldBuff: {
          name: string;
          goldPct: number;
          goldBonus: number;
        };
        goldGross: number;
      };
    };
    const expected = applyStochasticPercentBonus(
      baseline.result.expGained,
      15,
      () => 0.5,
    );
    expect(boosted.result.expGained).toBe(expected);
    expect(boosted.result.foodExpBuff).toEqual({
      name: "깨달음의 허브차",
      expPct: 15,
      expBonus: expected - baseline.result.expGained,
    });
    const expectedGold = applyStochasticPercentBonus(
      baseline.result.goldGross,
      15,
      () => 0.5,
    );
    expect(boosted.result.goldGross).toBe(expectedGold);
    expect(boosted.result.foodGoldBuff).toEqual({
      name: "깨달음의 허브차",
      goldPct: 15,
      goldBonus: expectedGold - baseline.result.goldGross,
    });
  });

  it("전투 시작 장비의 해방 EXP·골드 효과를 보상까지 고정한다", async () => {
    const baselineRes = await POST(huntReq({ floor: 2 }));
    const baseline = (await baselineRes.json()) as {
      result: { expGained: number; goldGross: number };
    };

    seedStrongWarrior();
    const equipment = store.get("equipment.v2") as {
      owned: Array<Record<string, unknown>>;
      equipped: Record<string, string>;
    };
    equipment.owned.push(
      {
        iid: "hunt-gold-armor",
        id: "v2_storm_wreckage_armor",
        liberation: {
          rank: 1,
          lineCount: 1,
          revision: 1,
          options: [{ id: "hunt_gold_pct", level: 20 }],
        },
      },
      {
        iid: "hunt-exp-boots",
        id: "v2_storm_wreckage_boots",
        liberation: {
          rank: 1,
          lineCount: 1,
          revision: 1,
          options: [{ id: "hunt_exp_pct", level: 20 }],
        },
      },
    );
    equipment.equipped.armor = "hunt-gold-armor";
    equipment.equipped.boots = "hunt-exp-boots";

    const boostedRes = await POST(huntReq({ floor: 2 }));
    const boosted = (await boostedRes.json()) as typeof baseline;
    expect(boosted.result.expGained).toBeCloseTo(
      baseline.result.expGained * 1.2,
      0,
    );
    expect(boosted.result.goldGross).toBeCloseTo(
      baseline.result.goldGross * 1.1,
      0,
    );
  });

  it("레벨업 시 레거시 totalLevels 를 새로 갱신하지 않는다", async () => {
    // beforeEach 가 강한 전사(Lv30) 시드 — 다음 레벨까지 1 EXP 부족하게 설정.
    const char0 = store.get("character.v2") as Record<string, unknown>;
    store.set("character.v2", {
      ...char0,
      // 30 은 만렙 미만이라 requiredExpToNext 는 항상 숫자(null 폴백은 타입 안전용).
      exp: (requiredExpToNext(30) ?? 1) - 1,
    });
    const res = await POST(huntReq({ floor: 2 }));
    expect(res.status).toBe(200);
    const char = store.get("character.v2") as {
      level: number;
      totalLevels?: number;
    };
    // 한 판 승리(EXP>0)로 최소 1 레벨업 → 31 이상.
    expect(char.level).toBeGreaterThanOrEqual(31);
    expect(char.totalLevels).toBeUndefined();
  });

  it("레벨업 시 전투 시작에 장착한 해방 성장 옵션을 현재 주기에 누적한다", async () => {
    const char0 = store.get("character.v2") as Record<string, unknown>;
    store.set("character.v2", {
      ...char0,
      exp: (requiredExpToNext(30) ?? 1) - 1,
    });
    store.set("equipment.v2", {
      owned: [
        { iid: "w1", id: "v2_cave_greatsword" },
        {
          iid: "growth-armor",
          id: "v2_storm_wreckage_armor",
          liberation: {
            rank: 1,
            lineCount: 1,
            revision: 1,
            options: [{ id: "level_up_max_hp_growth", level: 20 }],
          },
        },
      ],
      equipped: { weapon: "w1", armor: "growth-armor" },
    });

    const response = await POST(huntReq({ floor: 2 }));
    const json = (await response.json()) as {
      result: { levelsGained: number; hpGain: number };
    };
    expect(response.status).toBe(200);
    expect(json.result.levelsGained).toBeGreaterThan(0);
    const proficiency = store.get("proficiency.v2") as {
      liberationCycleGrowth: { hp: number; mp: number };
    };
    expect(proficiency.liberationCycleGrowth.hp).toBe(
      json.result.levelsGained * 15,
    );
    expect(proficiency.liberationCycleGrowth.mp).toBe(0);
    expect(json.result.hpGain).toBeGreaterThanOrEqual(
      proficiency.liberationCycleGrowth.hp,
    );
  });

  it("보상 처리 중 장비 저장이 바뀌어도 시작 시 해방 성장 스냅샷을 유지한다", async () => {
    const char0 = store.get("character.v2") as Record<string, unknown>;
    store.set("character.v2", {
      ...char0,
      exp: (requiredExpToNext(30) ?? 1) - 1,
    });
    const equipment = {
      owned: [
        { iid: "w1", id: "v2_cave_greatsword" },
        {
          iid: "growth-armor",
          id: "v2_storm_wreckage_armor",
          liberation: {
            rank: 1,
            lineCount: 1,
            revision: 1,
            options: [{ id: "level_up_max_hp_growth", level: 20 }],
          },
        },
      ],
      equipped: { weapon: "w1", armor: "growth-armor" },
    };
    store.set("equipment.v2", equipment);
    huntDropOverride.beforeRoll = () => {
      equipment.owned.splice(1, 1);
      delete (equipment.equipped as { armor?: string }).armor;
    };

    const response = await POST(huntReq({ floor: 2 }));
    const json = (await response.json()) as {
      result: { levelsGained: number };
    };
    expect(response.status).toBe(200);
    const proficiency = store.get("proficiency.v2") as {
      liberationCycleGrowth: { hp: number; mp: number };
    };
    expect(proficiency.liberationCycleGrowth.hp).toBe(
      json.result.levelsGained * 15,
    );
  });

  it("낚시 계열 직업은 사냥 승리로 직업 숙련도가 오르지 않는다", async () => {
    store.set("character.v2", {
      class: "survivor",
      specChoice: "fisher",
      level: 30,
      exp: 0,
      gold: 1000,
      hp: 999999,
      stamina: { current: 5000, lastUpdatedAt: 1 },
      frontierDepth: 2,
    });
    store.set("proficiency.v2", {
      points: 0,
      groups: { survivor: { tier: 1, cumLevel: 30, cultivations: 0 } },
      grown: { str: 50, vit: 50 },
      jobCumLevel: { fisher: 7 },
    });

    const res = await POST(huntReq({ floor: 2 }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      ok: boolean;
      result: {
        won: boolean;
        proficiencyGained: number;
        masteryGained: number;
        masteryAfter: number | null;
      };
    };
    expect(json.ok).toBe(true);
    expect(json.result.won).toBe(true);
    expect(json.result.proficiencyGained).toBe(proficiencyPerKillAtDepth(2));
    expect(json.result.masteryGained).toBe(0);
    expect(json.result.masteryAfter).toBe(7);

    const prof = store.get("proficiency.v2") as {
      points: number;
      groups: { survivor?: { cumLevel?: number } };
      jobCumLevel?: Record<string, number>;
    };
    expect(prof.points).toBe(proficiencyPerKillAtDepth(2));
    expect(prof.groups.survivor?.cumLevel).toBe(30);
    expect(prof.jobCumLevel?.fisher).toBe(7);
  });

  it("농부 계열 직업은 사냥 승리로 직업 숙련도가 오르지 않는다", async () => {
    store.set("character.v2", {
      class: "survivor",
      specChoice: "farmer",
      level: 30,
      exp: 0,
      gold: 1000,
      hp: 999999,
      stamina: { current: 5000, lastUpdatedAt: 1 },
      frontierDepth: 2,
    });
    store.set("proficiency.v2", {
      points: 0,
      groups: { survivor: { tier: 1, cumLevel: 30, cultivations: 0 } },
      grown: { str: 50, vit: 50 },
      jobCumLevel: { farmer: 11 },
    });

    const res = await POST(huntReq({ floor: 2 }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      ok: boolean;
      result: {
        won: boolean;
        proficiencyGained: number;
        masteryGained: number;
        masteryAfter: number | null;
      };
    };
    expect(json.ok).toBe(true);
    expect(json.result.won).toBe(true);
    expect(json.result.proficiencyGained).toBe(proficiencyPerKillAtDepth(2));
    expect(json.result.masteryGained).toBe(0);
    expect(json.result.masteryAfter).toBe(11);

    const prof = store.get("proficiency.v2") as {
      points: number;
      groups: { survivor?: { cumLevel?: number } };
      jobCumLevel?: Record<string, number>;
    };
    expect(prof.points).toBe(proficiencyPerKillAtDepth(2));
    expect(prof.groups.survivor?.cumLevel).toBe(30);
    expect(prof.jobCumLevel?.farmer).toBe(11);
  });

  it("배치(count=5) — 5회 완료 + 판간 read-your-writes 이월(스태미나·EXP 누적)", async () => {
    const res = await POST(huntReq({ floor: 2, count: 5 }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      ok: boolean;
      batch: {
        attempted: number;
        completed: number;
        wins: number;
        losses: number;
        totalLossTax: number;
        totalExp: number;
        totalProficiency: number;
        proficiencyPointsAfter: number;
        totalMastery: number;
        proficiencyAfter: number | null;
        stoppedReason: string | null;
        replays: Array<{
          index: number;
          enemyName: string;
          replay: { replayId?: string; log: unknown[] };
        }>;
      };
    };
    expect(json.ok).toBe(true);
    expect(json.batch.attempted).toBe(5);
    expect(json.batch.completed).toBe(5);
    expect(json.batch.wins).toBe(5);
    expect(json.batch.losses).toBe(0);
    expect(json.batch.totalLossTax).toBe(0);
    expect(json.batch.stoppedReason).toBeNull();
    expect(json.batch.totalProficiency).toBe(5 * proficiencyPerKillAtDepth(2));
    expect(json.batch.proficiencyPointsAfter).toBe(
      json.batch.totalProficiency,
    );
    expect(json.batch.totalMastery).toBe(5);
    expect(json.batch.proficiencyAfter).toBe(35);
    expect(json.batch.replays).toHaveLength(5);
    expect(json.batch.replays[0]?.index).toBe(1);
    expect(json.batch.replays[0]?.enemyName).toBeTruthy();
    expect(json.batch.replays[0]?.replay.log.length).toBeGreaterThan(0);
    expect(json.batch.replays[0]?.replay.replayId).toBeUndefined();
    expect(deferLongBattleReplays).toHaveBeenCalledWith(
      expect.anything(),
      "u-test",
      expect.arrayContaining([
        expect.objectContaining({ log: expect.any(Array) }),
      ]),
    );
    expect(
      deferLongBattleReplays.mock.calls[0]?.[2] as unknown[],
    ).toHaveLength(5);
    expect(insertTargets).not.toContain(battleReplays);
    expect(recordCodexMasteryGameplayBatch).toHaveBeenCalledOnce();
    const masteryEvents = recordCodexMasteryGameplayBatch.mock.calls[0]?.[2];
    expect(masteryEvents).toHaveLength(10);
    expect(masteryEvents).toEqual(Array.from({ length: 5 }, () => [
      {
        category: "monster",
        entryId: "박쥐",
        amount: 1,
        source: "hunt.victory",
      },
      {
        category: "job",
        entryId: "warrior",
        amount: 1,
        source: "job.victory",
      },
    ]).flat());

    // 판간 이월 — 매 판 stamina 1 차감을 다음 판이 재read. 5판 후 5000-5=4995.
    const char = store.get("character.v2") as {
      exp: number;
      stamina: { current: number };
    };
    expect(char.stamina.current).toBe(4995);
    expect(store.get(GROWTH_LEAP_SAVE_KEY)).toMatchObject({
      mission: { staminaSpent: 5 },
    });
    // EXP 도 누적(매 판 applyExpGain 결과를 세이브→다음 판 재read).
    expect(char.exp).toBe(json.batch.totalExp);
    expect(char.exp).toBeGreaterThan(0);
    // 숙련도도 5판 누적.
    const prof = store.get("proficiency.v2") as {
      points: number;
      groups: { warrior?: { cumLevel?: number } };
      jobCumLevel?: Record<string, number>;
    };
    expect(prof.points).toBe(5 * proficiencyPerKillAtDepth(2)); // 전역 잔액 5판 누적
    expect(prof.groups.warrior?.cumLevel).toBe(35); // 기존 30 + 5승
    expect(prof.jobCumLevel?.warrior).toBe(5);

    const log = store.get("adventure-log.v2") as {
      monsters: Record<string, { kills?: number }>;
    };
    expect(
      Object.values(log.monsters).reduce(
        (sum, monster) => sum + (monster.kills ?? 0),
        0,
      ),
    ).toBe(5);

    // 첫 판이 잡은 사용자 save lock을 같은 tx의 다음 판들이 재사용한다.
    // 캐시가 빠지면 이 값들이 completed(5)만큼 늘어나므로 성능 회귀를 바로 잡는다.
    expect(
      vi
        .mocked(lockSaveForUpdate)
        .mock.calls.filter((call) => call[2] === "character.v2"),
    ).toHaveLength(1);
    expect(lockSavesForUpdate).toHaveBeenCalledTimes(1);
    const lockedFallbacks = vi.mocked(lockSavesForUpdate).mock.calls[0][2];
    expect(Object.keys(lockedFallbacks).sort()).toEqual([
      "adventure-log.v2",
      "equipment.v2",
      GUILD_DINING_USER_SAVE_KEY,
      "inventory.v2",
      "proficiency.v2",
      "skills.v2",
    ]);
    expect(upsertSaves).toHaveBeenCalledTimes(1);
    expect(Object.keys(vi.mocked(upsertSaves).mock.calls[0][2]).sort()).toEqual([
      "adventure-log.v2",
      "character.v2",
      "equipment.v2",
      "inventory.v2",
      "proficiency.v2",
    ]);
    expect(upsertSave).toHaveBeenCalledTimes(1);
    expect(vi.mocked(upsertSave).mock.calls[0][2]).toBe(GROWTH_LEAP_SAVE_KEY);
  });

  it("배치의 활성 길드 식사 효과를 판간 이월하고 마지막에 한 번 저장한다", async () => {
    const now = new Date();
    store.set(GUILD_DINING_USER_SAVE_KEY, {
      version: 1,
      weekKey: kstWeekMondayKey(now),
      guildId: 0,
      contributionPoints: 0,
      mealsUsed: 1,
      activeEffect: {
        menuId: "adventurer_meal",
        kind: "hunt_exp",
        expiresAt: now.getTime() + 60 * 60 * 1000,
        roundingRemainder: 0,
      },
    });

    const res = await POST(huntReq({ floor: 2, count: 5 }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      batch: { completed: number; totalExp: number };
    };
    expect(json.batch.completed).toBe(5);
    expect(json.batch.totalExp).toBeGreaterThan(0);

    expect(lockSavesForUpdate).toHaveBeenCalledTimes(1);
    expect(upsertSaves).toHaveBeenCalledTimes(1);
    expect(vi.mocked(upsertSaves).mock.calls[0][2]).toHaveProperty(
      GUILD_DINING_USER_SAVE_KEY,
    );
    expect(upsertSave).toHaveBeenCalledTimes(1);
    expect(vi.mocked(upsertSave).mock.calls[0][2]).toBe(GROWTH_LEAP_SAVE_KEY);
  });

  it("현재 거점이 있어도 사냥세 없이 골드 전액을 지급한다", async () => {
    store.set("character.v2", {
      ...(store.get("character.v2") as object),
      lastVisitedOutpost: { outpostId: OUTPOSTS[0].id, at: Date.now() },
    });
    const res = await POST(huntReq({ floor: 2 }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      ok: boolean;
      result: {
        won: boolean;
        goldGained: number;
        goldGross: number;
        goldTaxed: number;
        taxOwnerLabel?: string;
      };
    };
    expect(json.ok).toBe(true);
    expect(json.result.won).toBe(true);
    expect(json.result.goldGross).toBeGreaterThan(0);
    expect(json.result.goldTaxed).toBe(0);
    expect(json.result.goldGained).toBe(json.result.goldGross);
    expect(json.result.taxOwnerLabel).toBeUndefined();
  });

  it("배치 사냥도 거점과 관계없이 사냥세 없이 골드 전액을 지급한다", async () => {
    store.set("character.v2", {
      ...(store.get("character.v2") as object),
      lastVisitedOutpost: { outpostId: OUTPOSTS[0].id, at: Date.now() },
    });
    const res = await POST(
      huntReq({ floor: 2, count: 3, outpostId: OUTPOSTS[0].id }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      ok: boolean;
      batch: {
        completed: number;
        totalGold: number;
        totalGoldGross: number;
        totalGoldTaxed: number;
        taxOwnerLabel?: string;
      };
    };
    expect(json.ok).toBe(true);
    expect(json.batch.completed).toBe(3);
    expect(json.batch.totalGoldTaxed).toBe(0);
    expect(json.batch.totalGold).toBe(json.batch.totalGoldGross);
    expect(json.batch.taxOwnerLabel).toBeUndefined();
  });

  it("body의 거점이 서버에 저장된 현재 거점과 다르면 보상 처리 전에 거절한다", async () => {
    const currentOutpostId = OUTPOSTS[0].id;
    const forgedOutpostId = OUTPOSTS[1].id;
    const before = {
      ...(store.get("character.v2") as Record<string, unknown>),
      lastVisitedOutpost: { outpostId: currentOutpostId, at: Date.now() },
    };
    store.set("character.v2", before);

    const res = await POST(
      huntReq({ floor: 2, outpostId: forgedOutpostId }),
    );
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({
      ok: false,
      error: "location_mismatch",
      currentOutpostId,
    });
    expect(store.get("character.v2")).toEqual(before);
  });

  it("저장 거점이 없는 신규 계정은 시작 거점 사냥 요청을 정상 처리한다", async () => {
    const res = await POST(
      huntReq({ floor: 2, outpostId: START_OUTPOST_ID }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      result: { won: true },
    });
  });

  it("스태미나 부족 — 첫 판부터 막히면 409(단판과 동일 에러)", async () => {
    store.set("character.v2", {
      ...(store.get("character.v2") as object),
      // lastUpdatedAt 을 현재로 — 과거값이면 라우트의 Date.now() 까지 재생되어 풀충된다.
      stamina: { current: 0, lastUpdatedAt: Date.now() },
    });
    const res = await POST(huntReq({ floor: 2 }));
    expect(res.status).toBe(409);
    const json = (await res.json()) as { ok: boolean; error: string };
    expect(json.ok).toBe(false);
    expect(json.error).toBe("out_of_stamina");
  });

  it("저체력이어도 HP 충전량이 있으면 전투 전 자동 회복 후 사냥한다", async () => {
    store.set("character.v2", {
      ...(store.get("character.v2") as object),
      hp: 0,
      hpRegenSince: Date.now(),
    });
    store.set("inventory.v2", { hpCharges: 999_999, mpCharges: 0 });

    const res = await POST(huntReq({ floor: 2 }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      ok: boolean;
      result: {
        hpBefore: number;
        hpAfter: number;
        hpCharges: number;
        maxHp: number;
      };
    };
    expect(json.ok).toBe(true);
    expect(json.result.hpBefore).toBeGreaterThan(0);
    expect(json.result.hpBefore).toBe(json.result.maxHp);
    expect(json.result.hpAfter).toBeGreaterThan(0);
    expect(json.result.hpCharges).toBeLessThan(999_999);

    const inv = store.get("inventory.v2") as { hpCharges: number };
    expect(inv.hpCharges).toBe(json.result.hpCharges);
  });

  it("부족한 HP 충전량을 소모하고 저체력으로 중단돼도 한 번의 배치 쓰기로 보존한다", async () => {
    store.set("character.v2", {
      ...(store.get("character.v2") as object),
      hp: 0,
      hpRegenSince: Date.now(),
    });
    store.set("inventory.v2", { hpCharges: 1, mpCharges: 0 });

    const res = await POST(huntReq({ floor: 2 }));

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({
      ok: false,
      error: "hp_zero",
    });
    expect(store.get("inventory.v2")).toMatchObject({ hpCharges: 0 });
    expect(store.get("character.v2")).toMatchObject({ hp: 1 });
    expect(upsertSaves).toHaveBeenCalledTimes(1);
    expect(upsertSave).not.toHaveBeenCalled();
  });

  it("HP 충전약 목표를 설정하면 전투 전에도 해당 체력까지만 회복한다", async () => {
    store.set("character.v2", {
      ...(store.get("character.v2") as object),
      hp: 0,
      hpRegenSince: Date.now(),
    });
    store.set("inventory.v2", { hpCharges: 999_999, mpCharges: 0 });

    const res = await POST(
      huntReq({
        floor: 2,
        autoStopConfig: { hpPotionTargetPct: 50 },
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      result: { hpBefore: number; maxHp: number };
    };
    expect(json.result.hpBefore).toBe(Math.ceil(json.result.maxHp * 0.5));
  });

  it("단계 잠금 — 다음 대표 단계보다 깊은 곳은 403", async () => {
    // frontierDepth 2 → 다음 도전은 4. 대표 depth 6은 잠김.
    const res = await POST(huntReq({ floor: 6 }));
    expect(res.status).toBe(403);
    const json = (await res.json()) as { ok: boolean; error: string };
    expect(json.ok).toBe(false);
    expect(json.error).toBe("depth_locked");
  });

  it("일반 사냥은 대표 깊이가 아닌 레거시 깊이를 거부", async () => {
    const res = await POST(huntReq({ floor: 3 }));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error?: string };
    expect(json.error).toBe("hunt_stage_only");
  });

  it("다음 대표 단계는 +2여도 도전 가능하고 승리하면 frontier가 갱신", async () => {
    const res = await POST(huntReq({ floor: 4 }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      result: { won: boolean; maxDepth: number };
    };
    expect(json.result.won).toBe(true);
    expect(json.result.maxDepth).toBe(4);
  });

  it("홍보 단계 보상이 지급된 사냥 응답에만 우편 알림 갱신 신호를 담는다", async () => {
    overpowerSeededWarrior();
    rewardReferralTutorialTasks.mockResolvedValueOnce({
      staminaPotions: 2,
      newlyCompletedTaskIds: ["hunt_depth_24"],
      completedTaskIds: ["hunt_depth_24"],
    });
    store.set("character.v2", {
      ...(store.get("character.v2") as object),
      frontierDepth: 22,
    });

    const rewardedRes = await POST(huntReq({ floor: 24 }));
    expect(rewardedRes.status).toBe(200);
    const rewardedJson = await rewardedRes.json();
    expect(rewardedJson).toMatchObject({
      result: { won: true },
    });
    expect(rewardedJson).toMatchObject({
      result: { referralRewardEarned: true },
    });
    expect(rewardReferralTutorialTasks).toHaveBeenCalledWith(
      expect.anything(),
      "u-test",
      expect.any(String),
      ["hunt_depth_24"],
    );

    const ordinaryRes = await POST(huntReq({ floor: 24 }));
    expect(ordinaryRes.status).toBe(200);
    await expect(ordinaryRes.json()).resolves.toMatchObject({
      result: { referralRewardEarned: false },
    });
  });

});
