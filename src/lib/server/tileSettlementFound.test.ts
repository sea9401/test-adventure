// 개척마을 생성(found) 길드 규칙 — 길드 소속이면 마스터/부마스터만 + 길드 자금 소모.
//   영토=길드 소유 — 무소속은 개척 불가(need_guild). (2026-06-24 길드 전용 영토)

import { afterEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  guildId: null as number | null,
  isAdmin: false,
  guildGold: 0,
  soloGold: 0,
  inserts: [] as Record<string, unknown>[],
  guildUpserts: [] as unknown[],
  soloSaves: [] as Record<string, unknown>[],
  // FOR UPDATE 로 읽히는 기존 정착지 행(rename 시나리오). 기본 없음.
  existing: [] as Record<string, unknown>[],
  updates: [] as Record<string, unknown>[],
  // 플레이어 마커 위치(readSave) — found 는 그 칸에 있어야 가능. 기본=foundReq 좌표(2,3) 일치.
  tilePos: { col: 2, row: 3 } as { col: number; row: number } | null,
}));

vi.mock("@/adventure/data/v2/coreLoopConfig", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/adventure/data/v2/coreLoopConfig")>();
  return { ...actual, V2_CORE_LOOP_V2: true, V2_FREEFORM_TILES: true };
});
vi.mock("@/adventure/data/v2/settlementWarfareConfig", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/adventure/data/v2/settlementWarfareConfig")
    >();
  return { ...actual, V2_TILE_WARFARE: true };
});
vi.mock("@/lib/server/ensureUser", () => ({ ensureUser: vi.fn(async () => "u-me") }));
vi.mock("@/lib/server/v2EnsureSoloGuild", () => ({
  getGuildId: vi.fn(async () => h.guildId),
}));
vi.mock("@/lib/server/guildAdmin", () => ({
  isGuildMasterOrVice: vi.fn(async () => h.isAdmin),
}));
vi.mock("@/lib/server/v2GuildResources", () => ({
  lockGuildResources: vi.fn(async () => ({ gold: h.guildGold })),
  upsertGuildResources: vi.fn(async (_tx, _gid, patch: unknown) => {
    h.guildUpserts.push(patch);
  }),
}));
vi.mock("@/lib/server/tileOccupation", () => ({
  createTileOccupation: vi.fn(async () => ({ created: true, guildId: 7 })),
  removeTileWarfare: vi.fn(async () => {}),
}));
vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: vi.fn(async () => ({ gold: h.soloGold, bankedGold: 0 })),
  readSave: vi.fn(async () => ({ tilePos: h.tilePos ?? undefined })),
  upsertSave: vi.fn(async (_tx, _uid, _key, v: Record<string, unknown>) => {
    h.soloSaves.push(v);
  }),
}));
vi.mock("@/db", () => {
  const tx = {
    select: () => ({
      from: () => ({
        where: () => ({ for: () => ({ limit: async () => h.existing }) }),
      }),
    }),
    insert: () => ({
      values: async (v: Record<string, unknown>) => {
        h.inserts.push(v);
      },
    }),
    update: () => ({
      set: (v: Record<string, unknown>) => ({
        where: async () => {
          h.updates.push(v);
        },
      }),
    }),
    delete: () => ({ where: async () => {} }),
  };
  return {
    db: { transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(tx)) },
  };
});

import { POST } from "@/app/api/v2/me/tile-settlement/route";
import { scaledTileGoldCost } from "@/adventure/data/v2/tileConfig";

function foundReq(col = 2, row = 3, name = "내정착지"): Request {
  return new Request("http://t/api/v2/me/tile-settlement", {
    method: "POST",
    body: JSON.stringify({ action: "found", col, row, name }),
  });
}

const COST = 10_000_000; // TILE_FOUND_COST
// found 좌표 (2,3) = 리베라(4,4) 체비셰프 거리 2 → 생성비 거리 스케일.
const FOUND_COST = scaledTileGoldCost(COST, 2, 3);

describe("POST tile-settlement found — 길드 규칙", () => {
  afterEach(() => {
    h.guildId = null;
    h.isAdmin = false;
    h.guildGold = 0;
    h.soloGold = 0;
    h.inserts = [];
    h.guildUpserts = [];
    h.soloSaves = [];
    h.existing = [];
    h.updates = [];
    h.tilePos = { col: 2, row: 3 };
    vi.clearAllMocks();
  });

  it("길드 마스터/부마스터: 길드 자금 소모 + 정착지 생성(이름 저장·개인 골드 불변)", async () => {
    h.guildId = 7;
    h.isAdmin = true;
    h.guildGold = FOUND_COST + COST; // 차감 후 COST 남도록
    h.soloGold = 0; // 개인 골드 0이어도 길드 자금으로 생성 가능
    const res = await POST(foundReq());
    expect(res.status).toBe(200);
    expect(h.inserts).toHaveLength(1); // tile_settlements insert
    // 창립자가 지은 이름이 그대로 저장(자동 이름 아님).
    expect(h.inserts[0]).toMatchObject({ name: "내정착지" });
    expect(h.guildUpserts).toContainEqual({ gold: COST }); // 2*COST - COST
    expect(h.soloSaves).toHaveLength(0); // 개인 골드 차감 없음
  });

  it("이름 없으면 400 invalid_name (미생성)", async () => {
    h.guildId = 7;
    h.isAdmin = true;
    h.guildGold = FOUND_COST * 2;
    const res = await POST(
      new Request("http://t/api/v2/me/tile-settlement", {
        method: "POST",
        body: JSON.stringify({ action: "found", col: 2, row: 3 }),
      }),
    );
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe(
      "invalid_name",
    );
    expect(h.inserts).toHaveLength(0);
  });

  it("길드원이지만 마스터/부마스터 아님 → 403 not_guild_admin", async () => {
    h.guildId = 7;
    h.isAdmin = false;
    h.guildGold = COST * 2;
    const res = await POST(foundReq());
    expect(res.status).toBe(403);
    const j = (await res.json()) as { error: string };
    expect(j.error).toBe("not_guild_admin");
    expect(h.inserts).toHaveLength(0); // 생성 안 됨
  });

  it("길드 자금 부족 → 409 out_of_guild_gold(미생성)", async () => {
    h.guildId = 7;
    h.isAdmin = true;
    h.guildGold = FOUND_COST - 1;
    const res = await POST(foundReq());
    expect(res.status).toBe(409);
    const j = (await res.json()) as { error: string };
    expect(j.error).toBe("out_of_guild_gold");
    expect(h.inserts).toHaveLength(0);
  });

  it("그 칸에 있지 않으면 → 409 not_at_tile (미생성)", async () => {
    h.guildId = 7;
    h.isAdmin = true;
    h.guildGold = FOUND_COST * 2;
    h.tilePos = { col: 0, row: 0 }; // 대상(2,3)과 불일치 — 현장에 없음
    const res = await POST(foundReq());
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe("not_at_tile");
    expect(h.inserts).toHaveLength(0); // 정착지 미생성
    expect(h.guildUpserts).toHaveLength(0);
  });

  it("위치 정보 없으면(tilePos null) → 409 not_at_tile", async () => {
    h.guildId = 7;
    h.isAdmin = true;
    h.guildGold = FOUND_COST * 2;
    h.tilePos = null;
    const res = await POST(foundReq());
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe("not_at_tile");
    expect(h.inserts).toHaveLength(0);
  });

  it("무소속 → 403 need_guild (영토=길드 소유, 솔로 개척 폐기)", async () => {
    h.guildId = null;
    h.soloGold = FOUND_COST + COST;
    const res = await POST(foundReq());
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: string }).error).toBe("need_guild");
    expect(h.inserts).toHaveLength(0); // 정착지 미생성
    expect(h.guildUpserts).toHaveLength(0);
  });
});

describe("POST tile-settlement rename — 개명 폐지(이름 불변)", () => {
  afterEach(() => {
    h.existing = [];
    h.updates = [];
    h.soloGold = 0;
    vi.clearAllMocks();
  });

  it("rename 액션 → 400 bad_request (이름은 개척 때 한 번만·불변·미갱신)", async () => {
    h.existing = [
      { col: 2, row: 3, userId: "u-me", tier: "frontier", name: "옛이름" },
    ];
    const res = await POST(
      new Request("http://t/api/v2/me/tile-settlement", {
        method: "POST",
        body: JSON.stringify({ action: "rename", col: 2, row: 3, name: "새이름" }),
      }),
    );
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("bad_request");
    expect(h.updates).toHaveLength(0);
  });
});
