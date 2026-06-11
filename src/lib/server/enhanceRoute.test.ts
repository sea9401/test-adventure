// 강화 라우트(POST /api/v2/me/enhance) 통합 테스트 — in-memory savesKv 스토어 위에서
// end-to-end. 성공률 롤은 Math.random 모킹으로 결정화. huntRoute.test 와 동일 패턴.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { store } = vi.hoisted(() => ({ store: new Map<string, unknown>() }));

vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "u-test"),
}));
vi.mock("@/lib/server/serverFeed", () => ({
  insertFeedEntry: vi.fn(async () => {}),
}));
vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb({})),
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

import { POST } from "@/app/api/v2/me/enhance/route";
import {
  ENHANCE_STONE_MATERIAL_ID,
  enhanceGoldCost,
} from "@/adventure/data/v2/v2Enhance";
import { V2_EQUIPMENT } from "@/adventure/data/v2/v2Equipment";

const WEAPON = "v2_den_greatsword"; // 흔한(noDrop normal) — 유니크 배수 없음 가정 검증은 isUnique 따라.
const RED = ENHANCE_STONE_MATERIAL_ID.red;
const BLUE = ENHANCE_STONE_MATERIAL_ID.blue;

function req(body: Record<string, unknown>): Request {
  return new Request("http://t/api/v2/me/enhance", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function seed(over?: { materials?: Record<string, number>; gold?: number }) {
  store.clear();
  store.set("character.v2", {
    gold: over?.gold ?? 1_000_000,
    materials: over?.materials ?? { [RED]: 50, [BLUE]: 50 },
  });
  store.set("equipment.v2", {
    owned: [
      { iid: "w1", id: WEAPON, roll: { power: 300, weight: 5 } },
      { iid: "w2", id: WEAPON }, // 먹이 후보(같은 id, 미장착)
    ],
    equipped: { weapon: "w1" },
  });
}

type EquipSave = {
  owned: Array<{
    iid: string;
    id: string;
    enhance?: { level: number; bonusPct: number };
  }>;
};
type CharSave = { gold: number; materials: Record<string, number> };

describe("POST /api/v2/me/enhance", () => {
  beforeEach(() => {
    seed();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("골드만(stone 생략) 성공 — +1%p·돌 무차감·골드만 차감", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0); // 항상 성공
    const res = await POST(req({ iid: "w1" }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      success: boolean;
      enhance: { level: number; bonusPct: number };
      stoneCost: number;
    };
    expect(json.success).toBe(true);
    expect(json.enhance).toEqual({ level: 1, bonusPct: 1 });
    expect(json.stoneCost).toBe(0);
    const char = store.get("character.v2") as CharSave;
    expect(char.materials[RED]).toBe(50); // 돌 무차감
    expect(char.materials[BLUE]).toBe(50);
  });

  it("골드만 + 먹이 — 거부(면제할 돌이 없어 개체 보호)", async () => {
    const res = await POST(req({ iid: "w1", stone: "none", feedIid: "w2" }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("bad_feed");
  });

  it("푸른 돌 성공(+0→+1, +2%p) — 돌 1·골드 차감", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0); // 항상 성공
    const res = await POST(req({ iid: "w1", stone: "blue" }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      ok: boolean;
      success: boolean;
      enhance: { level: number; bonusPct: number };
      stoneCost: number;
      goldCost: number;
    };
    expect(json.success).toBe(true);
    expect(json.enhance).toEqual({ level: 1, bonusPct: 2 });
    expect(json.stoneCost).toBe(1);
    expect(json.goldCost).toBe(enhanceGoldCost(300, 0));
    const char = store.get("character.v2") as CharSave;
    expect(char.materials[BLUE]).toBe(49);
    expect(char.gold).toBe(1_000_000 - json.goldCost);
    const eq = store.get("equipment.v2") as EquipSave;
    expect(eq.owned.find((o) => o.iid === "w1")!.enhance).toEqual({
      level: 1,
      bonusPct: 2,
    });
  });

  it("붉은 돌 실패 — 재료만 소실, 레벨 불변(하락·파괴 없음)", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.999); // 항상 실패
    const res = await POST(req({ iid: "w1", stone: "red" }));
    const json = (await res.json()) as {
      ok: boolean;
      success: boolean;
      enhance: unknown;
    };
    expect(json.success).toBe(false);
    expect(json.enhance).toBeNull(); // 미강화였음 — 그대로
    const char = store.get("character.v2") as CharSave;
    expect(char.materials[RED]).toBe(49); // 소실
    const eq = store.get("equipment.v2") as EquipSave;
    expect(eq.owned.find((o) => o.iid === "w1")!.enhance).toBeUndefined();
  });

  it("먹이기 — 같은 id 개체 소모·강화석 면제(골드만)", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const res = await POST(req({ iid: "w1", stone: "blue", feedIid: "w2" }));
    const json = (await res.json()) as {
      ok: boolean;
      stoneCost: number;
      feedUsed: boolean;
    };
    expect(json.stoneCost).toBe(0);
    expect(json.feedUsed).toBe(true);
    const char = store.get("character.v2") as CharSave;
    expect(char.materials[BLUE]).toBe(50); // 면제
    const eq = store.get("equipment.v2") as EquipSave;
    expect(eq.owned.map((o) => o.iid)).toEqual(["w1"]); // 먹이 소모
  });

  it("거부 — 돌 부족 / 장착 중 먹이 / 미보유 iid", async () => {
    seed({ materials: {} });
    const r1 = await POST(req({ iid: "w1", stone: "blue" }));
    expect(r1.status).toBe(400);
    expect(((await r1.json()) as { error: string }).error).toBe(
      "insufficient_stone",
    );

    seed();
    const r2 = await POST(req({ iid: "w2", stone: "blue", feedIid: "w1" })); // w1 장착 중
    expect(r2.status).toBe(400);
    expect(((await r2.json()) as { error: string }).error).toBe("feed_in_use");

    const r3 = await POST(req({ iid: "nope", stone: "blue" }));
    expect(r3.status).toBe(404);
  });

  it("고강 실패(+6) — 강화 −1 하락(파괴 없음)", async () => {
    store.set("equipment.v2", {
      owned: [
        { iid: "w1", id: WEAPON, enhance: { level: 6, bonusPct: 13 } },
      ],
      equipped: {},
    });
    vi.spyOn(Math, "random").mockReturnValue(0.999); // 실패
    const res = await POST(req({ iid: "w1", stone: "blue" }));
    const json = (await res.json()) as {
      success: boolean;
      demoted: boolean;
      enhance: { level: number; bonusPct: number };
    };
    expect(json.success).toBe(false);
    expect(json.demoted).toBe(true);
    expect(json.enhance).toEqual({ level: 5, bonusPct: 11 });
    const eq = store.get("equipment.v2") as EquipSave;
    expect(eq.owned[0].enhance).toEqual({ level: 5, bonusPct: 11 });
  });

  it("저강 실패(+0~+5) — 하락 없음(재료만 소실)", async () => {
    store.set("equipment.v2", {
      owned: [{ iid: "w1", id: WEAPON, enhance: { level: 5, bonusPct: 10 } }],
      equipped: {},
    });
    vi.spyOn(Math, "random").mockReturnValue(0.999);
    const res = await POST(req({ iid: "w1", stone: "blue" }));
    const json = (await res.json()) as { demoted: boolean };
    expect(json.demoted).toBe(false);
    const eq = store.get("equipment.v2") as EquipSave;
    expect(eq.owned[0].enhance).toEqual({ level: 5, bonusPct: 10 });
  });

  it("고강 성공(+7→+8) — enhance_high 피드 발화", async () => {
    store.set("equipment.v2", {
      owned: [{ iid: "w1", id: WEAPON, enhance: { level: 7, bonusPct: 16 } }],
      equipped: {},
    });
    vi.spyOn(Math, "random").mockReturnValue(0); // 성공
    const res = await POST(req({ iid: "w1", stone: "blue" }));
    expect(res.status).toBe(200);
    const { insertFeedEntry } = await import("@/lib/server/serverFeed");
    expect(insertFeedEntry).toHaveBeenCalledWith("u-test", "enhance_high", {
      itemId: WEAPON,
      level: 8,
    });
  });

  it("상한 — +10 에서 거부", async () => {
    store.set("equipment.v2", {
      owned: [
        {
          iid: "w1",
          id: WEAPON,
          enhance: { level: 10, bonusPct: 30 },
        },
      ],
      equipped: {},
    });
    const res = await POST(req({ iid: "w1", stone: "blue" }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("max_level");
  });

  it("유니크 — 비용 ×2", async () => {
    const uniqueId = Object.keys(V2_EQUIPMENT).find(
      (id) =>
        (V2_EQUIPMENT[id as keyof typeof V2_EQUIPMENT] as { rarity?: string })
          .rarity === "unique",
    )!;
    store.set("equipment.v2", {
      owned: [{ iid: "u1", id: uniqueId, roll: { power: 200, weight: 3 } }],
      equipped: {},
    });
    vi.spyOn(Math, "random").mockReturnValue(0);
    const res = await POST(req({ iid: "u1", stone: "blue" }));
    const json = (await res.json()) as { stoneCost: number; goldCost: number };
    expect(json.stoneCost).toBe(2); // 1 × 2
    expect(json.goldCost).toBe(enhanceGoldCost(200, 0) * 2);
  });
});
