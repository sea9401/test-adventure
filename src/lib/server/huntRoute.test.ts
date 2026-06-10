// 사냥 라우트(POST /api/v2/dungeon/hunt) 통합 테스트 — 핸들러를 in-memory savesKv 스토어
// 위에서 end-to-end 로 돌린다. DB I/O 경계(savesKv 헬퍼·db.transaction·ensureUser·getGuildId·
// serverFeed)만 모킹하고 라우트 본문(전투 resolve·EXP·드랍·숙련도·세이브 변형)은 REAL 코드를
// 그대로 실행한다. tx 모킹은 raw 쿼리를 "항상 빈 결과/no-op" 로 받는 최소 체인 — outpostId
// 경로에서 occupations FOR UPDATE 가 빈 결과 = 미점령(NPC 세금) 거점으로 동작한다.
//
// PR-perf(사냥 배치 read 폴드)의 안전망: skills/proficiency 를 upfront lock-read 해 derive 에
// 4개 모두 preload 한다. preload 가 빠지면(회귀) REAL derive 래퍼가 더미 tx({}) 에 .select() 를
// 호출해 throw → 이 테스트가 실패한다. 즉 "사냥이 성공한다"는 사실 자체가 폴드 배선을 검증한다.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock 팩토리는 호이스팅되므로 공유 스토어는 vi.hoisted 로.
const { store } = vi.hoisted(() => ({ store: new Map<string, unknown>() }));

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
// tx/db raw 쿼리 — 모든 select 체인은 빈 결과, insert 는 no-op. 솔로 경로는 안 타고,
// outpostId 경로에선 occupations FOR UPDATE [] = 미점령(NPC 세금→거점 금고) 으로 동작.
// 세금 라벨 해석(db.select, tx 밖)도 같은 빈 체인 → "거점 금고".
vi.mock("@/db", () => {
  const chain: Record<string, unknown> = {};
  chain.from = () => chain;
  chain.where = () => chain;
  chain.for = () => chain;
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
import { V2_PROFICIENCY_PER_KILL } from "@/adventure/data/v2/proficiency";
import { OUTPOSTS } from "@/adventure/data/v2/outposts";

function seedStrongWarrior() {
  store.clear();
  // 강한 전사 — depth 1(들판) 몹을 확정 처치하도록 grown.str 크게 + cap 넉넉히(클램프 회피).
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

function huntReq(body: Record<string, unknown>): Request {
  return new Request("http://t/api/v2/dungeon/hunt", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/v2/dungeon/hunt — 통합(폴드 안전망)", () => {
  beforeEach(() => {
    seedStrongWarrior();
    // 결정적 RNG — 0.5 는 명중 임계(missPct ~6) 위라 평타 적중, 크리/추가타 임계 아래라 단타.
    // 강한 무기(atk ~175) + 우호 명중 → depth1 몹 확정 1타 처치.
    vi.spyOn(Math, "random").mockReturnValue(0.5);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("단판(count=1) 승리 — 200 + EXP/골드/숙련도/킬로그 갱신, 스태미나 1 차감", async () => {
    const res = await POST(huntReq({ floor: 1 }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      ok: boolean;
      result: {
        floor: number;
        won: boolean;
        expGained: number;
        proficiencyGained: number;
        enemyName: string;
      };
    };
    expect(json.ok).toBe(true);
    expect(json.result.floor).toBe(1);
    // 강한 전사 + 우호 RNG → 확정 승리.
    expect(json.result.won).toBe(true);
    expect(json.result.expGained).toBeGreaterThan(0);
    expect(json.result.proficiencyGained).toBe(V2_PROFICIENCY_PER_KILL);

    // 세이브 권위 반영 확인.
    const char = store.get("character.v2") as { exp: number; stamina: { current: number } };
    expect(char.exp).toBeGreaterThan(0);
    expect(char.stamina.current).toBe(4999); // 5000 - HUNT_COST(1)
    const prof = store.get("proficiency.v2") as {
      groups: { warrior: { points: number } };
    };
    expect(prof.groups.warrior.points).toBe(V2_PROFICIENCY_PER_KILL);
    const log = store.get("adventure-log.v2") as {
      monsters: Record<string, { kills?: number }>;
    };
    expect(log.monsters[json.result.enemyName]?.kills).toBe(1);
  });

  it("배치(count=5) — 5회 완료 + 판간 read-your-writes 이월(스태미나·EXP 누적)", async () => {
    const res = await POST(huntReq({ floor: 1, count: 5 }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      ok: boolean;
      batch: {
        attempted: number;
        completed: number;
        wins: number;
        losses: number;
        totalExp: number;
        totalProficiency: number;
        stoppedReason: string | null;
      };
    };
    expect(json.ok).toBe(true);
    expect(json.batch.attempted).toBe(5);
    expect(json.batch.completed).toBe(5);
    expect(json.batch.wins).toBe(5);
    expect(json.batch.losses).toBe(0);
    expect(json.batch.stoppedReason).toBeNull();
    expect(json.batch.totalProficiency).toBe(5 * V2_PROFICIENCY_PER_KILL);

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
      groups: { warrior: { points: number } };
    };
    expect(prof.groups.warrior.points).toBe(5 * V2_PROFICIENCY_PER_KILL);
  });

  it("거점(미점령) 사냥 — NPC 세금 차감 + 수취 라벨 '거점 금고'", async () => {
    const res = await POST(huntReq({ floor: 1, outpostId: OUTPOSTS[0].id }));
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
    // 미점령 거점 = NPC 세율 — 승리·gross>0 이면 최소 1G 차감 + net 정합.
    expect(json.result.goldGross).toBeGreaterThan(0);
    expect(json.result.goldTaxed).toBeGreaterThan(0);
    expect(json.result.goldGained).toBe(
      json.result.goldGross - json.result.goldTaxed,
    );
    expect(json.result.taxOwnerLabel).toBe("거점 금고");
  });

  it("배치 + 거점 — totalGoldGross/totalGoldTaxed 합산 + 수취 라벨", async () => {
    const res = await POST(
      huntReq({ floor: 1, count: 3, outpostId: OUTPOSTS[0].id }),
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
    expect(json.batch.totalGoldTaxed).toBeGreaterThan(0);
    expect(json.batch.totalGold).toBe(
      json.batch.totalGoldGross - json.batch.totalGoldTaxed,
    );
    expect(json.batch.taxOwnerLabel).toBe("거점 금고");
  });

  it("스태미나 부족 — 첫 판부터 막히면 409(단판과 동일 에러)", async () => {
    store.set("character.v2", {
      ...(store.get("character.v2") as object),
      // lastUpdatedAt 을 현재로 — 과거값이면 라우트의 Date.now() 까지 재생되어 풀충된다.
      stamina: { current: 0, lastUpdatedAt: Date.now() },
    });
    const res = await POST(huntReq({ floor: 1 }));
    expect(res.status).toBe(409);
    const json = (await res.json()) as { ok: boolean; error: string };
    expect(json.ok).toBe(false);
    expect(json.error).toBe("out_of_stamina");
  });

  it("깊이 잠금 — frontierDepth+1 초과 깊이는 403", async () => {
    // frontierDepth 2 → 최대 진입 3. depth 5 는 잠김.
    const res = await POST(huntReq({ floor: 5 }));
    expect(res.status).toBe(403);
    const json = (await res.json()) as { ok: boolean; error: string };
    expect(json.ok).toBe(false);
    expect(json.error).toBe("depth_locked");
  });
});
