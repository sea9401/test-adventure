import { describe, it, expect } from "vitest";
import {
  V2_CODEX_TOTAL,
  discoveredMaterialIds,
  countDiscoveredMaterials,
  codexRequirement,
} from "./codex";

// 2026-06-03: 재료 재설계 — 들판 5종 등재. V2_CODEX_TOTAL = 등재 재료 수(5). 전직 재료
// 요건은 min(요건, 총량)로 클램프(완성 불가 게이트 방지).

describe("v2 코덱스(재료 도감) 진척 — 들판 5종", () => {
  it("V2_CODEX_TOTAL = 5 (등재 재료 수)", () => {
    expect(V2_CODEX_TOTAL).toBe(5);
  });

  it("discoveredMaterialIds — count>0 유효 재료만 (0/음수/미등재 제외)", () => {
    const r = discoveredMaterialIds({
      v2_field_grass: 3,
      v2_field_stone: 1,
      v2_field_hide: 0, // 미수집
      v2_field_fang: -2, // 음수
      unknown_material_id: 5, // 미등재
    });
    expect(r.slice().sort()).toEqual(
      ["v2_field_grass", "v2_field_stone"].sort(),
    );
    expect(
      countDiscoveredMaterials({ v2_field_grass: 3, v2_field_stone: 1 }),
    ).toBe(2);
  });

  it("비객체/null/undefined 입력은 빈 진척", () => {
    expect(discoveredMaterialIds(null)).toEqual([]);
    expect(discoveredMaterialIds("x")).toEqual([]);
    expect(discoveredMaterialIds(undefined)).toEqual([]);
    expect(countDiscoveredMaterials(undefined)).toBe(0);
  });

  it("codexRequirement — 총량(5)으로 클램프, 미지정/0 은 요건 없음", () => {
    expect(codexRequirement(undefined)).toBe(0);
    expect(codexRequirement(0)).toBe(0);
    expect(codexRequirement(3)).toBe(3);
    expect(codexRequirement(9999)).toBe(5);
  });
});
