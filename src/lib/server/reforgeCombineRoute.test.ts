// 재련석 조합 라우트(POST /api/v2/me/reforge-stone-combine) 통합 테스트 —
// in-memory savesKv 위 end-to-end. 일반 3 → 상급 1(결정론·무료). reforgeRoute.test 패턴.

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

import { POST } from "@/app/api/v2/me/reforge-stone-combine/route";
import {
  REFORGE_COMBINE_COST,
  REFORGE_STONE_MATERIAL_ID,
} from "@/adventure/data/v2/v2EquipVariance";

const BASIC = REFORGE_STONE_MATERIAL_ID.basic;
const HIGH = REFORGE_STONE_MATERIAL_ID.high;

function seed(basic: number, high?: number) {
  store.clear();
  const materials: Record<string, number> = { [BASIC]: basic };
  if (high != null) materials[HIGH] = high;
  store.set("character.v2", { gold: 123, materials });
}

const charOf = () =>
  store.get("character.v2") as {
    gold: number;
    materials: Record<string, number>;
  };

afterEach(() => vi.restoreAllMocks());

describe("POST /api/v2/me/reforge-stone-combine", () => {
  it("일반 N개 차감 + 상급 1 적립", async () => {
    seed(5, 1);
    const res = await POST();
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.basicLeft).toBe(5 - REFORGE_COMBINE_COST);
    expect(json.high).toBe(2);
    expect(charOf().materials[BASIC]).toBe(5 - REFORGE_COMBINE_COST);
    expect(charOf().materials[HIGH]).toBe(2);
    expect(charOf().gold).toBe(123); // 무료 — 골드·기타 필드 불변
  });

  it("딱 N개면 일반 키 제거 + 상급 신규 1", async () => {
    seed(REFORGE_COMBINE_COST); // 상급 없음
    const res = await POST();
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.basicLeft).toBe(0);
    expect(charOf().materials[BASIC]).toBeUndefined(); // 0 = 키 삭제
    expect(charOf().materials[HIGH]).toBe(1);
  });

  it("일반 부족(<N) — insufficient_stone, 재료 불변", async () => {
    seed(REFORGE_COMBINE_COST - 1, 0);
    const before = JSON.stringify(charOf().materials);
    const res = await POST();
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.error).toBe("insufficient_stone");
    expect(json.need).toBe(REFORGE_COMBINE_COST);
    expect(JSON.stringify(charOf().materials)).toBe(before); // 미변경
  });
});
