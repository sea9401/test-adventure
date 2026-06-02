import { describe, it, expect } from "vitest";
import {
  V2_CODEX_TOTAL,
  discoveredMaterialIds,
  countDiscoveredMaterials,
  codexRequirement,
} from "./codex";

// 2026-06-03: 재료 보류 — 카탈로그가 비어 V2_CODEX_TOTAL=0. 재료 수집 진척/전직 요건이
// 자동 0 으로 클램프(완성 불가 게이트로 진행이 막히지 않도록).

describe("v2 코덱스(재료 도감) 진척 — 재료 보류", () => {
  it("V2_CODEX_TOTAL = 0 (재료 없음)", () => {
    expect(V2_CODEX_TOTAL).toBe(0);
  });

  it("discoveredMaterialIds — 카탈로그 비어 항상 빈 진척", () => {
    expect(discoveredMaterialIds({ v2_herb: 3, v2_stone_chip: 1 })).toEqual([]);
    expect(countDiscoveredMaterials({ v2_herb: 3, v2_stone_chip: 1 })).toBe(0);
  });

  it("비객체/null/undefined 입력은 빈 진척", () => {
    expect(discoveredMaterialIds(null)).toEqual([]);
    expect(discoveredMaterialIds("x")).toEqual([]);
    expect(discoveredMaterialIds(undefined)).toEqual([]);
    expect(countDiscoveredMaterials(undefined)).toBe(0);
  });

  it("codexRequirement — 총량 0 이라 어떤 요건도 0 으로 클램프(전직 게이트 자동 해제)", () => {
    expect(codexRequirement(undefined)).toBe(0);
    expect(codexRequirement(0)).toBe(0);
    expect(codexRequirement(3)).toBe(0);
    expect(codexRequirement(9999)).toBe(0);
  });
});
