// 성벽 수리 키트 조합 라우트(POST /api/v2/me/repair-kit-combine) 통합 테스트 —
// in-memory savesKv 위 end-to-end. 통나무3 + 철광석3 → 키트1(결정론·무료). reforgeCombineRoute 패턴.

import { afterEach, describe, expect, it, vi } from "vitest";

const { store } = vi.hoisted(() => ({ store: new Map<string, unknown>() }));

vi.mock("@/adventure/data/v2/settlementWarfareConfig", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/adventure/data/v2/settlementWarfareConfig")
    >();
  return { ...actual, V2_SETTLEMENT_WARFARE: true };
});
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

import { POST } from "@/app/api/v2/me/repair-kit-combine/route";
import {
  SETTLEMENT_MATERIAL_ID,
  WALL_REPAIR_KIT_ID,
  WALL_REPAIR_KIT_COST,
} from "@/adventure/data/v2/settlementMaterials";
import { COMBINE_GOLD_COST } from "@/adventure/data/v2/v2EquipVariance";

const TIMBER = SETTLEMENT_MATERIAL_ID.timber;
const ORE = SETTLEMENT_MATERIAL_ID.ironOre;
const NEED_T = WALL_REPAIR_KIT_COST[TIMBER];
const NEED_O = WALL_REPAIR_KIT_COST[ORE];
const GOLD = COMBINE_GOLD_COST * 3; // 조합 비용 여유

function seed(timber: number, ore: number, kits?: number, gold = GOLD) {
  store.clear();
  const materials: Record<string, number> = { [TIMBER]: timber, [ORE]: ore };
  if (kits != null) materials[WALL_REPAIR_KIT_ID] = kits;
  store.set("character.v2", { gold, materials });
}

const charOf = () =>
  store.get("character.v2") as {
    gold: number;
    materials: Record<string, number>;
  };

afterEach(() => vi.restoreAllMocks());

describe("POST /api/v2/me/repair-kit-combine", () => {
  it("통나무·철광석 N개 차감 + 키트 1 적립", async () => {
    seed(NEED_T + 2, NEED_O + 1, 4);
    const res = await POST();
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.timberLeft).toBe(2);
    expect(json.oreLeft).toBe(1);
    expect(json.kits).toBe(5);
    expect(charOf().materials[TIMBER]).toBe(2);
    expect(charOf().materials[ORE]).toBe(1);
    expect(charOf().materials[WALL_REPAIR_KIT_ID]).toBe(5);
    expect(json.goldCost).toBe(COMBINE_GOLD_COST);
    expect(charOf().gold).toBe(GOLD - COMBINE_GOLD_COST); // 조합 비용 차감
  });

  it("골드 부족(<비용) — insufficient_gold, 재료·골드 불변", async () => {
    seed(NEED_T + 2, NEED_O + 1, 4, COMBINE_GOLD_COST - 1); // 재료는 충분, 골드만 부족
    const before = JSON.stringify(charOf().materials);
    const res = await POST();
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.error).toBe("insufficient_gold");
    expect(json.goldCost).toBe(COMBINE_GOLD_COST);
    expect(JSON.stringify(charOf().materials)).toBe(before); // 미변경
    expect(charOf().gold).toBe(COMBINE_GOLD_COST - 1); // 미차감
  });

  it("딱 N개면 재료 키 제거 + 키트 신규 1", async () => {
    seed(NEED_T, NEED_O); // 키트 없음
    const res = await POST();
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.timberLeft).toBe(0);
    expect(json.oreLeft).toBe(0);
    expect(charOf().materials[TIMBER]).toBeUndefined(); // 0 = 키 삭제
    expect(charOf().materials[ORE]).toBeUndefined();
    expect(charOf().materials[WALL_REPAIR_KIT_ID]).toBe(1);
  });

  it("재료 부족 — insufficient_material, 재료 불변", async () => {
    seed(NEED_T - 1, NEED_O);
    const before = JSON.stringify(charOf().materials);
    const res = await POST();
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.error).toBe("insufficient_material");
    expect(json.needTimber).toBe(NEED_T);
    expect(json.needOre).toBe(NEED_O);
    expect(JSON.stringify(charOf().materials)).toBe(before); // 미변경
  });
});
