// 타일 전쟁 검증(P4-prep) — attack 라우트가 합성 타일 id 에서 약탈/정복을 수행하는 end-to-end.
//   전투 없는 경로만(무수비 raid·빈 큐 conquest)으로 전투 엔진 모킹 회피. 컬럼 모양으로 테이블 구분.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  occ: null as Record<string, unknown> | null,
  treasuryGold: 0,
  upsertGuildRes: [] as Array<{ guildId: number; patch: unknown }>,
  occUpdates: [] as unknown[],
  tileUpdates: [] as unknown[],
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
  getGuildId: vi.fn(async () => 7), // 공격자 길드(≠ 점령 길드 99)
}));
vi.mock("@/lib/server/derivePlayerCombatV2", () => ({
  derivePlayerCombatV2: vi.fn(async () => ({
    player: { maxMp: 100, hp: 1000 },
    maxHp: 1000,
    selectedStance: null,
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
