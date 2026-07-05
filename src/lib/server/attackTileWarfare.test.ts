// 타일 전쟁 검증(P4-prep) — attack 라우트가 합성 타일 id 에서 약탈/정복을 수행하는 end-to-end.
//   무수비/수비 raid·빈 큐 conquest 경로를 고정. 컬럼 모양으로 테이블 구분.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  occ: null as Record<string, unknown> | null,
  treasuryGold: 0,
  defenderQueue: [] as Array<{ userId: string }>,
  upsertGuildRes: [] as Array<{ guildId: number; patch: unknown }>,
  occUpdates: [] as unknown[],
  tileUpdates: [] as unknown[],
  attackerGuildId: 7 as number | null, // 공격자 길드(솔로 공격자 테스트는 null)
  pvpAttackerWins: true, // resolveBattlePvP mock 결과 제어(솔로 수비 결투)
  // 공격자 위치 마커(약탈 "현지 위치" 게이트) — 대상 칸 일치 시 통과.
  attackerTilePos: null as { col: number; row: number; at?: number } | null,
  attackerWarVigor: { hp: 1, mp: 1, at: 0 },
  lastWarAttackAt: 0,
  upsertSaves: [] as Array<{ userId: string; value: Record<string, unknown> }>,
  // 정복 발판(guildTileFoothold mock) — 기본 허용(인접 영지 보유).
  foothold: { ownsAny: true, adjacentOwned: true },
}));

vi.mock("@/adventure/data/v2/settlementWarfareConfig", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/adventure/data/v2/settlementWarfareConfig")
    >();
  return { ...actual, V2_SETTLEMENT_WARFARE: true, V2_TILE_WARFARE: true };
});
vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "u-atk"),
}));
vi.mock("@/lib/server/v2EnsureSoloGuild", () => ({
  getGuildId: vi.fn(async () => h.attackerGuildId), // 공격자 길드(솔로면 null)
}));
vi.mock("@/lib/server/derivePlayerCombatV2", () => ({
  derivePlayerCombatV2: vi.fn(async () => ({
    // 전투력비율 공성 — derivePowerScore 입력(atk/def/spd) 필요. 임의 값.
    player: { atk: 100, magicAtk: 0, def: 50, spd: 50, maxMp: 100, hp: 1000 },
    maxHp: 1000,
    selectedStance: null,
  })),
}));
vi.mock("@/lib/server/v2BattlePrep", () => ({
  prepareV2BattleActor: vi.fn(async ({ userId }: { userId: string }) => ({
    player: {
      // 전투력비율 공성 — derivePowerScore 입력(atk/def/spd) 필요. 임의 값.
      player: { atk: 100, magicAtk: 0, def: 50, spd: 50, maxMp: 100, hp: 1000 },
      maxHp: 1000,
      selectedStance: null,
    },
    skills: {
      learned: [`${userId}:skill`],
      equipped: [`${userId}:skill`],
    },
  })),
}));
// 수비 결투용 — 결정적 결과. 빈 큐(길드 무수비) 경로는 이 mock 미사용.
vi.mock("@/adventure/v2/combat/engine-pvp", () => ({
  resolveBattlePvP: vi.fn(() => ({
    outcome: h.pvpAttackerWins ? "p1_win" : "p2_win",
    turns: 3,
    finalState: {
      p1: { hp: 900, mp: 50 },
      p2: { hp: h.pvpAttackerWins ? 0 : 800, mp: 0 },
      log: [],
    },
  })),
}));
vi.mock("@/lib/server/serverFeed", () => ({
  insertFeedEntry: vi.fn(async () => {}),
  resolveUserDisplayName: vi.fn(async () => "공격자"),
}));
vi.mock("@/lib/server/v2GuildResources", () => ({
  lockGuildResources: vi.fn(async () => ({ gold: 0 })),
  upsertGuildResources: vi.fn(async (_tx, guildId: number, patch: unknown) => {
    h.upsertGuildRes.push({ guildId, patch });
  }),
}));
vi.mock("@/lib/server/v2GuildFame", () => ({
  addGuildFame: vi.fn(async () => {}),
}));
vi.mock("@/lib/server/savesKv", () => ({
  // 공격자(u-atk) 세이브엔 tilePos 주입(약탈 위치 게이트용). 그 외(수비자)는 빈 세이브.
  lockSaveForUpdate: vi.fn(async (_tx: unknown, id: string) =>
    id === "u-atk"
      ? {
          tilePos: h.attackerTilePos,
          warVigor: h.attackerWarVigor,
          lastWarAttackAt: h.lastWarAttackAt,
        }
      : {},
  ),
  upsertSave: vi.fn(
    async (
      _tx: unknown,
      userId: string,
      _key: string,
      value: Record<string, unknown>,
    ) => {
      h.upsertSaves.push({ userId, value });
    },
  ),
}));
// 정복 발판 게이트 — guildTileFoothold 는 제어용 h.foothold 반환(인접 영지/땅 보유 판정).
//   중립 거점 인접(isTileAdjacentToNeutralOutpost)은 mock 하지 않음(실로직 검증).
vi.mock("@/lib/server/tileWarfareGates", () => ({
  guildTileFoothold: vi.fn(async () => h.foothold),
}));
vi.mock("@/db", () => {
  // 컬럼 모양으로 테이블 구분(huntTileTax 패턴 확장).
  function rows(cols?: unknown): Promise<unknown[]> {
    if (cols && typeof cols === "object") {
      const c = cols as Record<string, unknown>;
      if ("tier" in c) return Promise.resolve([{ tier: "village", name: "테스트" }]);
      if ("gold" in c) return Promise.resolve([{ gold: h.treasuryGold }]);
      if ("userId" in c) return Promise.resolve(h.defenderQueue); // 수비 큐
    }
    return Promise.resolve(h.occ ? [h.occ] : []); // cols 없음 = 점령행(select *)
  }
  function chain(cols?: unknown): Record<string, unknown> {
    const c: Record<string, unknown> = {};
    c.from = () => c;
    c.where = () => c;
    c.for = () => c;
    c.orderBy = () => rows(cols); // 수비 큐 종단
    c.limit = () => rows(cols); // 그 외 종단
    return c;
  }
  const tx = {
    select: (cols?: unknown) => chain(cols),
    update: () => ({
      set: (v: unknown) => ({
        where: async () => {
          // 점령행 vs 타일행 구분 — 값에 tier 있으면 tile_settlements.
          if (v && typeof v === "object" && "tier" in (v as object))
            h.tileUpdates.push(v);
          else h.occUpdates.push(v);
        },
      }),
    }),
    delete: () => ({ where: async () => {} }),
    insert: () => ({
      values: () => ({
        onConflictDoUpdate: async () => {},
        onConflictDoNothing: async () => {},
      }),
    }),
  };
  return {
    db: {
      transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(tx)),
      select: (cols?: unknown) => chain(cols),
    },
  };
});

import { POST } from "@/app/api/v2/outpost/attack/route";
import { resolveBattlePvP } from "@/adventure/v2/combat/engine-pvp";

function req(body: Record<string, unknown>): Request {
  return new Request("http://t/api/v2/outpost/attack", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function occRow(over: Record<string, unknown>) {
  return {
    occupiedByUserId: "u-owner",
    occupiedByGuildId: 99, // 적 길드
    occupiedAt: new Date(0),
    policy: "open",
    taxRate: "0.100",
    nextAttackAt: new Date(0),
    fortHp: 100,
    fortMaxHp: 100,
    fortUpdatedAt: new Date(),
    protectedUntil: new Date(0), // 과거 = 보호 해제
    ...over,
  };
}

describe("POST /api/v2/outpost/attack — 타일 정착지", () => {
  beforeEach(() => {
    h.upsertGuildRes = [];
    h.occUpdates = [];
    h.tileUpdates = [];
    h.defenderQueue = [];
    h.attackerGuildId = 7;
    h.pvpAttackerWins = true;
    h.attackerTilePos = null;
    h.attackerWarVigor = { hp: 1, mp: 1, at: 0 };
    h.lastWarAttackAt = 0;
    h.upsertSaves = [];
    h.foothold = { ownsAny: true, adjacentOwned: true };
  });
  afterEach(() => vi.clearAllMocks());

  it("무수비 약탈(raid) → 타일 금고 25% 탈취 → 공격 길드 골드", async () => {
    h.occ = occRow({});
    h.treasuryGold = 1000;
    h.attackerTilePos = { col: 2, row: 3, at: Date.now() - 61 * 60_000 }; // 1시간 체류 통과
    const res = await POST(req({ outpostId: "tile:2,3", mode: "raid" }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      ok: boolean;
      mode: string;
      won: boolean;
      stolenGold: number;
    };
    expect(json.ok).toBe(true);
    expect(json.mode).toBe("raid");
    expect(json.won).toBe(true);
    expect(json.stolenGold).toBe(250); // 1000 * 0.25
    // 공격 길드(7)에 탈취분 적립.
    expect(h.upsertGuildRes).toContainEqual({
      guildId: 7,
      patch: { gold: 250 },
    });
    expect(h.upsertSaves.some((s) => s.value.lastWarAttackAt)).toBe(true);
  });

  it("수비대 격파 약탈(raid) → 타일 금고 10% 탈취 → 공격 길드 골드", async () => {
    h.occ = occRow({});
    h.treasuryGold = 1000;
    h.defenderQueue = [{ userId: "u-def" }];
    h.pvpAttackerWins = true;
    h.attackerTilePos = { col: 2, row: 3, at: Date.now() - 61 * 60_000 };
    const res = await POST(req({ outpostId: "tile:2,3", mode: "raid" }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      ok: boolean;
      mode: string;
      won: boolean;
      stolenGold: number;
    };
    expect(json.ok).toBe(true);
    expect(json.mode).toBe("raid");
    expect(json.won).toBe(true);
    expect(json.stolenGold).toBe(100); // 1000 * 0.1
    expect(h.upsertGuildRes).toContainEqual({
      guildId: 7,
      patch: { gold: 100 },
    });
    expect(vi.mocked(resolveBattlePvP).mock.calls[0]?.[4]).toMatchObject({
      v2Skills: {
        p1: { equipped: ["u-atk:skill"] },
        p2: { equipped: ["u-def:skill"] },
      },
    });
  });

  it("빈 큐 정복(conquest) — 성벽 ≤ 공성 → 함락 + 타일 tier 1단계 강등(village→frontier)", async () => {
    h.occ = occRow({ fortHp: 10 }); // 10 ≤ 최소 공성데미지(BASE×0.5=38) → 1격 함락
    h.treasuryGold = 0;
    const res = await POST(req({ outpostId: "tile:4,4", mode: "conquest" }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      ok: boolean;
      mode: string;
      captured: boolean;
      downgradedTo: string | null;
    };
    expect(json.ok).toBe(true);
    expect(json.mode).toBe("conquest");
    expect(json.captured).toBe(true);
    expect(json.downgradedTo).toBe("개척마을"); // village → frontier
    // 점령행 이관 + 타일 tier/소유자 write-back 발생.
    expect(h.occUpdates.length).toBeGreaterThan(0);
    expect(h.tileUpdates).toContainEqual({ tier: "frontier", userId: "u-atk" });
  });

  it("약탈(raid) — 대상 칸에 없으면 not_present (전투/탈취 없음)", async () => {
    h.occ = occRow({});
    h.treasuryGold = 1000;
    h.attackerTilePos = { col: 0, row: 0 }; // 대상(tile:2,3)과 불일치
    const res = await POST(req({ outpostId: "tile:2,3", mode: "raid" }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("not_present");
    expect(h.upsertGuildRes).toHaveLength(0); // 금고 탈취 없음
  });

  it("약탈(raid) — 대상 칸 1시간 체류 전이면 raid_stay_required (전투/탈취 없음)", async () => {
    h.occ = occRow({});
    h.treasuryGold = 1000;
    h.attackerTilePos = { col: 2, row: 3, at: Date.now() - 59 * 60_000 };
    const res = await POST(req({ outpostId: "tile:2,3", mode: "raid" }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe(
      "raid_stay_required",
    );
    expect(h.upsertGuildRes).toHaveLength(0); // 금고 탈취 없음
  });

  it("공격 쿨타임 중이면 429 war_attack_cooldown (전투/탈취 없음)", async () => {
    h.occ = occRow({});
    h.treasuryGold = 1000;
    h.attackerTilePos = { col: 2, row: 3, at: Date.now() - 61 * 60_000 };
    h.lastWarAttackAt = Date.now() - 60_000;
    const res = await POST(req({ outpostId: "tile:2,3", mode: "raid" }));
    expect(res.status).toBe(429);
    expect(((await res.json()) as { error: string }).error).toBe(
      "war_attack_cooldown",
    );
    expect(h.upsertGuildRes).toHaveLength(0);
    expect(h.upsertSaves).toHaveLength(0);
  });

  it("건강도 HP/MP 중 하나라도 50% 미만이면 low_war_vigor (전투/탈취 없음)", async () => {
    h.occ = occRow({});
    h.treasuryGold = 1000;
    h.attackerTilePos = { col: 2, row: 3, at: Date.now() - 61 * 60_000 };
    h.attackerWarVigor = { hp: 0.49, mp: 1, at: Date.now() };
    const res = await POST(req({ outpostId: "tile:2,3", mode: "raid" }));
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe(
      "low_war_vigor",
    );
    expect(h.upsertGuildRes).toHaveLength(0);
    expect(h.upsertSaves).toHaveLength(0);
  });

  it("정복(conquest) — 인접 영지 없고 중립 거점 인접도 아니면 no_foothold", async () => {
    h.occ = occRow({ fortHp: 10 });
    h.foothold = { ownsAny: true, adjacentOwned: false }; // 땅은 있으나 비인접
    const res = await POST(req({ outpostId: "tile:0,0", mode: "conquest" }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("no_foothold");
    expect(h.occUpdates).toHaveLength(0); // 점령행 무변동
  });

  it("정복(conquest) — 땅 없는 길드 + 중립 거점(리베라 4,4) 인접 칸이면 허용", async () => {
    h.occ = occRow({ fortHp: 10 });
    h.foothold = { ownsAny: false, adjacentOwned: false }; // 땅 없음 → 중립 인접으로 통과
    const res = await POST(req({ outpostId: "tile:3,4", mode: "conquest" })); // (3,4)=리베라 인접
    expect(res.status).toBe(200);
    expect(((await res.json()) as { captured: boolean }).captured).toBe(true);
  });
});

describe("POST /api/v2/outpost/attack — 솔로(무길드) 타일", () => {
  beforeEach(() => {
    h.upsertGuildRes = [];
    h.occUpdates = [];
    h.tileUpdates = [];
    h.defenderQueue = [];
    h.attackerGuildId = 7;
    h.pvpAttackerWins = true;
    h.attackerTilePos = null;
    h.attackerWarVigor = { hp: 1, mp: 1, at: 0 };
    h.lastWarAttackAt = 0;
    h.upsertSaves = [];
    h.foothold = { ownsAny: true, adjacentOwned: true };
  });
  afterEach(() => vi.clearAllMocks());

  // 솔로 점령행 = occupiedByGuildId:null + occupiedByUserId(주인 단독 수비).
  const soloOcc = (over: Record<string, unknown> = {}) =>
    occRow({ occupiedByGuildId: null, occupiedByUserId: "u-owner", ...over });

  it("무소속(무길드) 공격자 → 400 no_guild (전쟁은 길드만, 솔로 공격 경로 폐기)", async () => {
    h.attackerGuildId = null;
    h.occ = soloOcc({ fortHp: 10 });
    const res = await POST(req({ outpostId: "tile:5,5", mode: "conquest" }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("no_guild");
    expect(h.occUpdates).toHaveLength(0); // 점령행 무변동
  });

  it("길드 공격자 → 솔로 타일 정복 → 길드 영지로 인수(razed=false·occupiedByGuildId=공격자 길드)", async () => {
    h.attackerGuildId = 7;
    h.occ = soloOcc({ fortHp: 10 });
    const res = await POST(req({ outpostId: "tile:5,6", mode: "conquest" }));
    expect(res.status).toBe(200);
    expect(((await res.json()) as { razed: boolean }).razed).toBe(false);
    expect(h.occUpdates).toContainEqual(
      expect.objectContaining({
        occupiedByUserId: "u-atk",
        occupiedByGuildId: 7,
      }),
    );
  });

  it("솔로 타일 약탈(raid) → raid_solo_unsupported (금고 없음)", async () => {
    h.occ = soloOcc({});
    h.attackerTilePos = { col: 5, row: 7, at: Date.now() - 61 * 60_000 }; // 체류 게이트 통과 후 솔로 거부
    const res = await POST(req({ outpostId: "tile:5,7", mode: "raid" }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe(
      "raid_solo_unsupported",
    );
  });
});
