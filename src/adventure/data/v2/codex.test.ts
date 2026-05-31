import { describe, it, expect } from "vitest";
import {
  V2_CODEX_TOTAL,
  discoveredMaterialIds,
  countDiscoveredMaterials,
  codexRequirement,
} from "./codex";

describe("v2 코덱스(재료 도감) 진척", () => {
  it("V2_CODEX_TOTAL = 알려진 재료 종 수 (>0)", () => {
    expect(V2_CODEX_TOTAL).toBeGreaterThan(0);
  });

  it("discoveredMaterialIds — count>0 유효 재료만 (0/음수/미지/미수집 제외)", () => {
    const r = discoveredMaterialIds({
      v2_herb: 3,
      v2_stone_chip: 1,
      v2_slime_shard: 0, // 미수집
      v2_bone_fragment: -2, // 음수
      unknown_material_id: 5, // 미지 재료
    });
    expect(r.slice().sort()).toEqual(["v2_herb", "v2_stone_chip"].sort());
    expect(countDiscoveredMaterials({ v2_herb: 3, v2_stone_chip: 1 })).toBe(2);
  });

  it("비객체/null/undefined 입력은 빈 진척", () => {
    expect(discoveredMaterialIds(null)).toEqual([]);
    expect(discoveredMaterialIds("x")).toEqual([]);
    expect(discoveredMaterialIds(undefined)).toEqual([]);
    expect(countDiscoveredMaterials(undefined)).toBe(0);
  });

  it("codexRequirement — 총량으로 클램프, 미지정/0 은 요건 없음", () => {
    expect(codexRequirement(undefined)).toBe(0);
    expect(codexRequirement(0)).toBe(0);
    expect(codexRequirement(3)).toBe(Math.min(3, V2_CODEX_TOTAL));
    // 총량 초과 요건은 총량으로 클램프(완성 불가 게이트 방지).
    expect(codexRequirement(9999)).toBe(V2_CODEX_TOTAL);
  });
});
