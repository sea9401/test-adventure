// 타일 전쟁 검증(P4-prep) — attack 라우트가 합성 타일 id 에서 약탈/정복을 수행하는 end-to-end.
//   전투 없는 경로만(무수비 raid·빈 큐 conquest)으로 전투 엔진 모킹 회피. 컬럼 모양으로 테이블 구분.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  occ: null as Record<string, unknown> | null,
  treasuryGold: 0,
  upsertGuildRes: [] as Array<{ guildId: number; patch: unknown }>,
  occUpdates: [] as unknown[],
  tileUpdates: [] as unknown[],
  attackerGuildId: 7 as number | null, // 공격자 길드(솔로 공격자 테스트는 null)
  pvpAttackerWins: true, // resolveBattlePvP mock 결과 제어(솔로 수비 결투)
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
    player: { maxMp: 100, hp: 1000 },
    maxHp: 1000,
    selectedStance: null,
  })),
}));
// 솔로 수비 결투(주인 단독 수비)용 — 결정적 결과. 빈 큐(길드 무수비) 경로는 이 mock 미사용.
vi.mock("@/adventure/v2/combat/engine-pvp", () => ({
  resolveBattlePvP: vi.fn(() => ({
    outcome: h.pvpAttackerWins ? "p1_win" : "p2_win",
    finalState: {
      p1: { hp: 900, mp: 50 },
      p2: { hp: h.pvpAttackerWins ? 0 : 800, mp: 0 },
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
  lockSaveForUpdate: vi.fn(async () => ({})),
  upsertSave: vi.fn(async () => {}),
}));
vi.mock("@/db", () => {
  // 컬럼 모양으로 테이블 구분(huntTileTax 패턴 확장).
  function rows(cols?: unknown): Promise<unknown[]> {
    if (cols && typeof cols === "object") {
      const c = cols as Record<string, unknown>;
      if ("tier" in c) return Promise.resolve([{ tier: "village", name: "테스트" }]);
      if ("gold" in c) return Promise.resolve([{ gold: h.treasuryGold }]);
      if ("userId" in c) return Promise.resolve([]); // 수비 큐 비었음
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
    h.attackerGuildId = 7;
    h.pvpAttackerWins = true;
  });
  afterEach(() => vi.clearAllMocks());

  it("무수비 약탈(raid) → 타일 금고 50% 탈취 → 공격 길드 골드", async () => {
    h.occ = occRow({});
    h.treasuryGold = 1000;
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
    expect(json.stolenGold).toBe(500); // 1000 * 0.5
    // 공격 길드(7)에 탈취분 적립.
    expect(h.upsertGuildRes).toContainEqual({
      guildId: 7,
      patch: { gold: 500 },
    });
  });

  it("빈 큐 정복(conquest) — 성벽 ≤ 공성 → 함락 + 타일 tier 1단계 강등(village→frontier)", async () => {
    h.occ = occRow({ fortHp: 10 }); // 10 ≤ SIEGE_DAMAGE_PER_WIN(20) → 1격 함락
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
});

describe("POST /api/v2/outpost/attack — 솔로(무길드) 타일", () => {
  beforeEach(() => {
    h.upsertGuildRes = [];
    h.occUpdates = [];
    h.tileUpdates = [];
    h.attackerGuildId = 7;
    h.pvpAttackerWins = true;
  });
  afterEach(() => vi.clearAllMocks());

  // 솔로 점령행 = occupiedByGuildId:null + occupiedByUserId(주인 단독 수비).
  const soloOcc = (over: Record<string, unknown> = {}) =>
    occRow({ occupiedByGuildId: null, occupiedByUserId: "u-owner", ...over });

  it("솔로 공격자(무길드) → 솔로 타일 정복 → 개인 소유 인수(guild=null·tile userId=공격자)", async () => {
    h.attackerGuildId = null; // 무길드 공격자
    h.occ = soloOcc({ fortHp: 10 }); // 주인(u-owner) 격파 후 1격 함락
    const res = await POST(req({ outpostId: "tile:5,5", mode: "conquest" }));
    expect(res.status).toBe(200);
    expect((await res.json()) as { captured: boolean }).toMatchObject({
      captured: true,
    });
    // 점령행 이관: 솔로→개인(공격자) — occupiedByGuildId null 유지.
    expect(h.occUpdates).toContainEqual(
      expect.objectContaining({
        occupiedByUserId: "u-atk",
        occupiedByGuildId: null,
      }),
    );
    expect(h.tileUpdates).toContainEqual(
      expect.objectContaining({ userId: "u-atk" }),
    );
  });

  it("길드 공격자 → 솔로 타일 정복 → 길드 영지로 인수(occupiedByGuildId=공격자 길드)", async () => {
    h.attackerGuildId = 7;
    h.occ = soloOcc({ fortHp: 10 });
    const res = await POST(req({ outpostId: "tile:5,6", mode: "conquest" }));
    expect(res.status).toBe(200);
    expect(h.occUpdates).toContainEqual(
      expect.objectContaining({
        occupiedByUserId: "u-atk",
        occupiedByGuildId: 7,
      }),
    );
  });

  it("솔로 타일 약탈(raid) → raid_solo_unsupported (금고 없음)", async () => {
    h.occ = soloOcc({});
    const res = await POST(req({ outpostId: "tile:5,7", mode: "raid" }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe(
      "raid_solo_unsupported",
    );
  });

  it("솔로 공격자 → 길드 영지 공격 → no_guild (개인은 길드 땅 공격 불가)", async () => {
    h.attackerGuildId = null;
    h.occ = occRow({ occupiedByGuildId: 99, occupiedByUserId: "u-owner" });
    const res = await POST(req({ outpostId: "tile:5,8", mode: "conquest" }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("no_guild");
  });

  it("본인 솔로 타일 공격 → already_yours", async () => {
    h.attackerGuildId = null;
    h.occ = soloOcc({ occupiedByUserId: "u-atk" }); // 공격자 == 주인
    const res = await POST(req({ outpostId: "tile:5,9", mode: "conquest" }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe(
      "already_yours",
    );
  });
});
