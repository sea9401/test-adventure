// 재련 라우트(POST /api/v2/me/reforge) 통합 테스트 — in-memory savesKv 스토어 위에서
// end-to-end. 굴림은 Math.random 모킹으로 결정화. enhanceRoute.test 와 동일 패턴.
// PR-2: 골드 + 재련석 1개 하이브리드(일반=현 굴림·상급=max-of-3).

import { afterEach, describe, expect, it, vi } from "vitest";

const { store } = vi.hoisted(() => ({ store: new Map<string, unknown>() }));

vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "u-test"),
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
  upsertSave: vi.fn(async (_tx, _uid, key: string, value: unknown) => {
    store.set(key, value);
  }),
}));

import { POST } from "@/app/api/v2/me/reforge/route";
import {
  V2_EQUIPMENT,
  type V2EquipmentId,
} from "@/adventure/data/v2/v2Equipment";
import {
  REFORGE_STONE_MATERIAL_ID,
  reforgeGoldCost,
  rollItemStats,
  rollItemStatsBest,
} from "@/adventure/data/v2/v2EquipVariance";

const WEAPON = "v2_den_greatsword" as V2EquipmentId; // 흔한(noDrop normal) — 유니크 배수 없음
const ITEM = V2_EQUIPMENT[WEAPON];
const COST = reforgeGoldCost(ITEM);
const BASIC = REFORGE_STONE_MATERIAL_ID.basic;
const HIGH = REFORGE_STONE_MATERIAL_ID.high;

function req(body: Record<string, unknown>): Request {
  return new Request("http://t/api/v2/me/reforge", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function seed(over?: {
  gold?: number;
  roll?: unknown;
  hasRoll?: boolean;
  basic?: number;
  high?: number;
}) {
  store.clear();
  store.set("character.v2", {
    gold: over?.gold ?? 10_000_000,
    materials: { [BASIC]: over?.basic ?? 5, [HIGH]: over?.high ?? 5 },
  });
  const inst: Record<string, unknown> = { iid: "w1", id: WEAPON };
  if (over?.hasRoll !== false) {
    inst.roll = over?.roll ?? { power: 300, weight: 5 };
  }
  store.set("equipment.v2", {
    owned: [inst],
    equipped: { weapon: "w1" },
  });
}

const charOf = () =>
  store.get("character.v2") as {
    gold: number;
    materials: Record<string, number>;
  };

afterEach(() => vi.restoreAllMocks());

describe("POST /api/v2/me/reforge", () => {
  it("성공(일반) — 골드 + 재련석1 차감 + 굴림 교체(장착 유지)", async () => {
    seed({ gold: 10_000_000, basic: 3 });
    vi.spyOn(Math, "random").mockReturnValue(0); // 결정적: 최저 굴림
    const res = await POST(req({ iid: "w1", stone: "basic" }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.stone).toBe("basic");
    expect(json.stoneLeft).toBe(2);
    expect(json.goldCost).toBe(COST);
    expect(json.gold).toBe(10_000_000 - COST);

    // 일반 = N1 → rollItemStats 동일.
    const expectRoll = rollItemStats(ITEM, () => 0);
    const eq = store.get("equipment.v2") as {
      owned: { roll: unknown }[];
      equipped: unknown;
    };
    expect(eq.owned[0].roll).toEqual(expectRoll);
    expect(json.newRoll).toEqual(expectRoll);
    expect(eq.equipped).toEqual({ weapon: "w1" }); // 장착 유지
    expect(charOf().materials[BASIC]).toBe(2); // 재련석 차감
  });

  it("상급 — max-of-3 굴림 + 상급 재련석 차감", async () => {
    seed({ high: 4 });
    const vals = [
      0.1, 0.9, 0.2, 0.8, 0.95, 0.05, 0.99, 0.5, 0.3, 0.7, 0.6, 0.4, 0.85,
      0.15, 0.45, 0.25, 0.65, 0.35, 0.75, 0.55,
    ];
    let i = 0;
    vi.spyOn(Math, "random").mockImplementation(() => vals[i++ % vals.length]);
    const res = await POST(req({ iid: "w1", stone: "high" }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.stone).toBe("high");
    expect(json.stoneLeft).toBe(3);
    // 같은 시퀀스로 max-of-3 재현(라우트 첫 random 소비 = rollItemStatsBest).
    let j = 0;
    const seq = () => vals[j++ % vals.length];
    expect(json.newRoll).toEqual(rollItemStatsBest(ITEM, seq, 3));
    expect(charOf().materials[HIGH]).toBe(3);
  });

  it("재련석 1개면 차감 후 키 제거", async () => {
    seed({ basic: 1 });
    vi.spyOn(Math, "random").mockReturnValue(0);
    const res = await POST(req({ iid: "w1", stone: "basic" }));
    const json = await res.json();
    expect(json.stoneLeft).toBe(0);
    expect(charOf().materials[BASIC]).toBeUndefined(); // 0 = 키 삭제
  });

  it("재련석 부족 — insufficient_stone, 세이브·골드 불변", async () => {
    seed({ basic: 0 });
    const before = JSON.stringify(store.get("equipment.v2"));
    const res = await POST(req({ iid: "w1", stone: "basic" }));
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.error).toBe("insufficient_stone");
    expect(JSON.stringify(store.get("equipment.v2"))).toBe(before);
    expect(charOf().gold).toBe(10_000_000); // 골드 미차감
  });

  it("상급 재련석 부족 — insufficient_stone(high) — 일반 보유와 무관·골드 불변", async () => {
    seed({ basic: 5, high: 0 }); // 일반은 있어도 상급 0 이면 상급 재련 불가.
    const res = await POST(req({ iid: "w1", stone: "high" }));
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.error).toBe("insufficient_stone");
    expect(json.stone).toBe("high");
    expect(charOf().gold).toBe(10_000_000); // 골드 미차감
    expect(charOf().materials[BASIC]).toBe(5); // 일반 미차감
  });

  it("골드 부족 — insufficient_gold, 재련석·골드 불변", async () => {
    seed({ gold: 10, basic: 3 });
    const before = JSON.stringify(store.get("equipment.v2"));
    const res = await POST(req({ iid: "w1", stone: "basic" }));
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.error).toBe("insufficient_gold");
    expect(JSON.stringify(store.get("equipment.v2"))).toBe(before); // 굴림 불변
    expect(charOf().gold).toBe(10); // 차감 없음
    expect(charOf().materials[BASIC]).toBe(3); // 재련석 미차감
  });

  it("굴림 없는 개체(상점 정가) — not_reforgeable", async () => {
    seed({ hasRoll: false });
    const res = await POST(req({ iid: "w1", stone: "basic" }));
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.error).toBe("not_reforgeable");
  });

  it("미보유 iid — 404", async () => {
    seed();
    const res = await POST(req({ iid: "nope", stone: "basic" }));
    const json = await res.json();
    expect(res.status).toBe(404);
    expect(json.error).toBe("not_owned");
  });
});
