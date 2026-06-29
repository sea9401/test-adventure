// 우편함 수령(POST /api/marketplace/inbox/claim) — season_reward 가 season 별 코인 지갑
// (pvp/fishing/treasure)에 올바르게 적립되는지 검증. @/db tx.select 체인 모킹 + upsertSave 캡처.
// (marketplaceInbox select → 청구 우편 / savesKv(지갑) select → 빈 지갑 [] → cur 0 에서 누적.)

import { beforeEach, describe, expect, it, vi } from "vitest";

const { savesStore, inboxRows } = vi.hoisted(() => ({
  savesStore: new Map<string, unknown>(),
  inboxRows: [] as Record<string, unknown>[],
}));

vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "u1"),
}));
vi.mock("@/lib/server/checkSession", () => ({
  checkSession: vi.fn(async () => null),
}));
vi.mock("@/lib/server/savesKv", () => ({
  upsertSave: vi.fn(async (_tx: unknown, u: string, key: string, v: unknown) => {
    savesStore.set(`${u}::${key}`, v);
  }),
}));
vi.mock("@/db", async () => {
  const { marketplaceInbox } = await import("@/db/schema");
  const chain = (rows: unknown[]) => {
    const c: Record<string, unknown> = {
      where: () => c,
      for: () => c,
      then: (res: (v: unknown[]) => unknown, rej?: (e: unknown) => unknown) =>
        Promise.resolve(rows).then(res, rej),
    };
    return c;
  };
  const tx = {
    select: () => ({
      from: (tbl: unknown) => chain(tbl === marketplaceInbox ? inboxRows : []),
    }),
    update: () => ({ set: () => ({ where: async () => undefined }) }),
  };
  return {
    db: { transaction: vi.fn(async (cb: (t: unknown) => unknown) => cb(tx)) },
  };
});

import { POST } from "@/app/api/marketplace/inbox/claim/route";

function req(ids: number[]): Request {
  return new Request("http://t/api/marketplace/inbox/claim", {
    method: "POST",
    body: JSON.stringify({ ids }),
  });
}

beforeEach(() => {
  savesStore.clear();
  inboxRows.length = 0;
});

describe("inbox claim — season_reward → 코인 지갑", () => {
  it("pvp/낚시/보물 보상이 각 지갑에 적립되고 claimed 마킹", async () => {
    inboxRows.push(
      {
        id: 1,
        kind: "season_reward",
        payload: { season: "pvp", coins: 600, rank: 2 },
        claimedAt: null,
      },
      {
        id: 2,
        kind: "season_reward",
        payload: { season: "fishing", coins: 120 },
        claimedAt: null,
      },
      {
        id: 3,
        kind: "season_reward",
        payload: { season: "treasure", coins: 80 },
        claimedAt: null,
      },
    );
    const res = await POST(req([1, 2, 3]));
    const j = (await res.json()) as {
      ok: boolean;
      claimed: number[];
      coinsAdded: { season: string; coins: number }[];
    };
    expect(res.status).toBe(200);
    expect(j.ok).toBe(true);
    expect([...j.claimed].sort()).toEqual([1, 2, 3]);
    expect(savesStore.get("u1::pvp-wallet.v1")).toEqual({ coins: 600 });
    expect(savesStore.get("u1::fishing-wallet.v1")).toEqual({ coins: 120 });
    expect(savesStore.get("u1::treasure-wallet.v1")).toEqual({ coins: 80 });
    const byS = Object.fromEntries(j.coinsAdded.map((c) => [c.season, c.coins]));
    expect(byS).toEqual({ pvp: 600, fishing: 120, treasure: 80 });
  });

  it("같은 시즌 여러 우편은 합산되어 한 지갑에", async () => {
    inboxRows.push(
      {
        id: 1,
        kind: "season_reward",
        payload: { season: "pvp", coins: 100 },
        claimedAt: null,
      },
      {
        id: 2,
        kind: "season_reward",
        payload: { season: "pvp", coins: 300 },
        claimedAt: null,
      },
    );
    const res = await POST(req([1, 2]));
    await res.json();
    expect(savesStore.get("u1::pvp-wallet.v1")).toEqual({ coins: 400 });
  });

  it("손상된 payload(잘못된 season)는 적립 안 되고 행 보존(claimed 제외)", async () => {
    inboxRows.push({
      id: 1,
      kind: "season_reward",
      payload: { season: "arena", coins: 999 },
      claimedAt: null,
    });
    const res = await POST(req([1]));
    const j = (await res.json()) as { claimed: number[] };
    expect(j.claimed).toEqual([]); // parse 실패 → 마킹 제외(보존)
    expect(savesStore.get("u1::pvp-wallet.v1")).toBeUndefined();
  });

  it("admin_gift 스태미나 회복약이 전용 세이브 키에 적립된다", async () => {
    inboxRows.push({
      id: 1,
      kind: "admin_gift",
      payload: { gold: 0, materials: [], items: [], staminaPotions: 3 },
      claimedAt: null,
    });
    const res = await POST(req([1]));
    const j = (await res.json()) as {
      ok: boolean;
      claimed: number[];
      staminaPotionsAdded: number;
      staminaPotions: number;
    };
    expect(res.status).toBe(200);
    expect(j.ok).toBe(true);
    expect(j.claimed).toEqual([1]);
    expect(j.staminaPotionsAdded).toBe(3);
    expect(j.staminaPotions).toBe(3);
    expect(savesStore.get("u1::stamina-potions.v1")).toEqual({ count: 3 });
  });

  it("admin_gift 장비는 inventory.v2 가 아니라 equipment.v2 개체로 들어간다", async () => {
    inboxRows.push({
      id: 1,
      kind: "admin_gift",
      payload: {
        gold: 0,
        materials: [],
        items: [{ itemId: "v2_iron_sword", count: 2 }],
        staminaPotions: 0,
      },
      claimedAt: null,
    });
    const res = await POST(req([1]));
    const j = (await res.json()) as {
      ok: boolean;
      claimed: number[];
      equipV2Added: { id: string; count: number }[];
    };
    expect(res.status).toBe(200);
    expect(j.ok).toBe(true);
    expect(j.claimed).toEqual([1]);
    expect(j.equipV2Added).toEqual([{ id: "v2_iron_sword", count: 2 }]);
    // 핵심: equipment.v2 에 개체 2개로 합류 (V2 UI 가 읽는 키). inventory.v2 에는 안 씀.
    const eq = savesStore.get("u1::equipment.v2") as {
      owned: { iid: string; id: string }[];
    };
    expect(eq.owned).toHaveLength(2);
    expect(eq.owned.every((o) => o.id === "v2_iron_sword")).toBe(true);
    expect(new Set(eq.owned.map((o) => o.iid)).size).toBe(2); // iid 고유
    expect(savesStore.get("u1::inventory.v2")).toBeUndefined();
  });

  it("admin_gift 재료는 inventory.v2 가 아니라 character.v2.materials 로 들어간다", async () => {
    inboxRows.push({
      id: 1,
      kind: "admin_gift",
      payload: {
        gold: 0,
        materials: [{ materialId: "v2_red_enhance_stone", count: 5 }],
        items: [],
        staminaPotions: 0,
      },
      claimedAt: null,
    });
    const res = await POST(req([1]));
    const j = (await res.json()) as {
      ok: boolean;
      claimed: number[];
      materialsV2Added: { id: string; count: number }[];
    };
    expect(res.status).toBe(200);
    expect(j.ok).toBe(true);
    expect(j.claimed).toEqual([1]);
    expect(j.materialsV2Added).toEqual([
      { id: "v2_red_enhance_stone", count: 5 },
    ]);
    // 핵심: character.v2.materials 에 누적 (V2 인벤토리 UI 가 읽는 곳). inventory.v2 엔 안 씀.
    const ch = savesStore.get("u1::character.v2") as {
      materials: Record<string, number>;
    };
    expect(ch.materials).toEqual({ v2_red_enhance_stone: 5 });
    expect(savesStore.get("u1::inventory.v2")).toBeUndefined();
  });
});
