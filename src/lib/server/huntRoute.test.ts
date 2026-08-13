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

// vi.mock 팩토리는 호이스팅되므로 공유 스토어는 vi.hoisted 로.
const { rewardReferralTutorialTasks, store } = vi.hoisted(() => ({
  rewardReferralTutorialTasks: vi.fn(async () => ({
    staminaPotions: 0,
    newlyCompletedTaskIds: [] as string[],
    completedTaskIds: [] as string[],
  })),
  store: new Map<string, unknown>(),
}));

vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "u-test"),
}));
vi.mock("@/lib/server/v2EnsureSoloGuild", () => ({
  getGuildId: vi.fn(async () => null),
}));
vi.mock("@/lib/server/serverFeed", () => ({
  insertFeedEntry: vi.fn(async () => {}),
  resolveUserDisplayName: vi.fn(async () => "이름 없는 모험가"),
}));
vi.mock("@/lib/server/referrals", () => ({ rewardReferralTutorialTasks }));
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
    insert: () => ({
      values: () => ({ onConflictDoUpdate: async () => undefined }),
    }),
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
  readSave: vi.fn(async (_tx, _uid, key: string, fallback: unknown) =>
    store.has(key) ? store.get(key) : fallback,
  ),
  upsertSave: vi.fn(async (_tx, _uid, key: string, value: unknown) => {
    store.set(key, value);
  }),
}));

import { POST } from "@/app/api/v2/dungeon/hunt/route";
import {
  lockSaveForUpdate,
  readSave,
  upsertSave,
} from "@/lib/server/savesKv";
import { GUILD_DINING_USER_SAVE_KEY } from "@/adventure/data/v2/guildDining";
import { kstWeekMondayKey } from "@/lib/kst";
import { proficiencyPerKillAtDepth } from "@/adventure/data/v2/proficiency";
import { requiredExpToNext } from "@/lib/leveling";
import {
  OUTPOSTS,
  START_OUTPOST_ID,
} from "@/adventure/data/v2/outposts";

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
    seedStrongWarrior();
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

    // 세이브 권위 반영 확인.
    const char = store.get("character.v2") as { exp: number; stamina: { current: number } };
    expect(char.exp).toBeGreaterThan(0);
    expect(char.stamina.current).toBe(4999); // 5000 - HUNT_COST(1)
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
  });

  it("활성 음식의 사냥 경험치 버프를 캐릭터 EXP에 적용한다", async () => {
    const baselineRes = await POST(huntReq({ floor: 2 }));
    const baseline = (await baselineRes.json()) as {
      result: { expGained: number };
    };

    seedStrongWarrior();
    const char = store.get("character.v2") as Record<string, unknown>;
    store.set("character.v2", {
      ...char,
      activeFoodBuff: {
        recipeId: "herb_tea",
        recipeName: "깨달음의 허브차",
        statPct: { int: 5 },
        expPct: 60,
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
      };
    };
    const expected = applyStochasticPercentBonus(
      baseline.result.expGained,
      60,
      () => 0.5,
    );
    expect(boosted.result.expGained).toBe(expected);
    expect(boosted.result.foodExpBuff).toEqual({
      name: "깨달음의 허브차",
      expPct: 60,
      expBonus: expected - baseline.result.expGained,
    });
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
    expect(json.batch.replays[0]?.replay.log).toEqual([]);
    expect(json.batch.replays[0]?.replay.replayId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );

    // 판간 이월 — 매 판 stamina 1 차감을 다음 판이 재read. 5판 후 5000-5=4995.
    const char = store.get("character.v2") as {
      exp: number;
      stamina: { current: number };
    };
    expect(char.stamina.current).toBe(4995);
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
    const lockKeys = vi
      .mocked(lockSaveForUpdate)
      .mock.calls.map((call) => call[2]);
    for (const key of [
      "character.v2",
      "equipment.v2",
      "skills.v2",
      "proficiency.v2",
      "inventory.v2",
      "adventure-log.v2",
    ]) {
      expect(lockKeys.filter((lockedKey) => lockedKey === key)).toHaveLength(1);
    }
    const killLogWrites = vi
      .mocked(upsertSave)
      .mock.calls.filter((call) => call[2] === "adventure-log.v2");
    expect(killLogWrites).toHaveLength(1);
    for (const key of [
      "character.v2",
      "equipment.v2",
      "inventory.v2",
      "proficiency.v2",
    ]) {
      expect(
        vi.mocked(upsertSave).mock.calls.filter((call) => call[2] === key),
      ).toHaveLength(1);
    }
    expect(
      vi
        .mocked(readSave)
        .mock.calls.filter((call) => call[2] === GUILD_DINING_USER_SAVE_KEY),
    ).toHaveLength(1);
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

    expect(
      vi
        .mocked(readSave)
        .mock.calls.filter((call) => call[2] === GUILD_DINING_USER_SAVE_KEY),
    ).toHaveLength(1);
    expect(
      vi
        .mocked(lockSaveForUpdate)
        .mock.calls.filter((call) => call[2] === GUILD_DINING_USER_SAVE_KEY),
    ).toHaveLength(1);
    expect(
      vi
        .mocked(upsertSave)
        .mock.calls.filter((call) => call[2] === GUILD_DINING_USER_SAVE_KEY),
    ).toHaveLength(1);
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
