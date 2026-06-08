import { describe, it, expect } from "vitest";
import {
  V2_CODEX_TOTAL,
  discoveredMaterialIds,
  countDiscoveredMaterials,
  codexRequirement,
} from "./codex";

// 2026-06-08: 재료 콘텐츠 제거 — 등재 재료 0종. V2_CODEX_TOTAL = 0, 도감 진척은 항상 빈 상태.
// 순수 헬퍼는 보존(재료 재도입 시 자동 부활)하므로 빈 카탈로그에서의 안전 동작만 검증한다.

describe("v2 코덱스(재료 도감) 진척 — 재료 제거(0종)", () => {
  it("V2_CODEX_TOTAL = 0 (등재 재료 없음)", () => {
    expect(V2_CODEX_TOTAL).toBe(0);
  });

  it("discoveredMaterialIds — 등재 재료가 없으면 어떤 보유분도 진척에 안 잡힘", () => {
    expect(
      discoveredMaterialIds({ v2_field_grass: 3, v2_field_stone: 1 }),
    ).toEqual([]);
    expect(countDiscoveredMaterials({ v2_field_grass: 3 })).toBe(0);
  });

  it("비객체/null/undefined 입력은 빈 진척", () => {
    expect(discoveredMaterialIds(null)).toEqual([]);
    expect(discoveredMaterialIds("x")).toEqual([]);
    expect(discoveredMaterialIds(undefined)).toEqual([]);
    expect(countDiscoveredMaterials(undefined)).toBe(0);
  });

  it("codexRequirement — 등재 0종이라 항상 0 (보류 플래그·요건값과 무관하게 클램프 결과 0)", () => {
    expect(codexRequirement(undefined)).toBe(0);
    expect(codexRequirement(0)).toBe(0);
    expect(codexRequirement(3)).toBe(0);
    expect(codexRequirement(9999)).toBe(0);
  });
});
