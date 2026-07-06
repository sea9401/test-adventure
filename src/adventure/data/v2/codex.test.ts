import { describe, it, expect } from "vitest";
import {
  V2_CODEX_TOTAL,
  discoveredMaterialIds,
  countDiscoveredMaterials,
  codexRequirement,
} from "./codex";

// 2026-06-08: 재료 콘텐츠 제거 — 등재 재료 0종. V2_CODEX_TOTAL = 0, 도감 진척은 항상 빈 상태.
// 2026-06-11: 강화석 2종 입주(장비 강화 PR-2) — 단 V2_MATERIALS_ENABLED=false 유지라
// codexRequirement(전직 재료 요건)는 계속 0(플래그 게이트). 총량/진척 카운트만 2종 반영.
// 2026-06-30: 길드 대장간 제작 재료 4종 추가. 전직 요건 잠금은 유지.
// 2026-07-02: 협동 보스 소환서 + 보상 7종(주화/보스재료/장비상자) 추가.
// 2026-07-05: 낚시 이벤트 협동 보스 보상 2종 추가.

describe("v2 코덱스(재료 도감) 진척 — 등재 재료·요건은 플래그 잠금", () => {
  it("V2_CODEX_TOTAL = 25 (기존 15종 + 소환서 + 협동 보스 보상 9종 등재)", () => {
    expect(V2_CODEX_TOTAL).toBe(25);
  });

  it("discoveredMaterialIds — 미등재 보유분은 진척에 안 잡힘", () => {
    expect(
      discoveredMaterialIds({ v2_field_grass: 3, v2_field_stone: 1 }),
    ).toEqual([]);
    expect(countDiscoveredMaterials({ v2_field_grass: 3 })).toBe(0);
    // 등재 재료(강화석)는 잡힘.
    expect(countDiscoveredMaterials({ v2_red_enhance_stone: 1 })).toBe(1);
  });

  it("비객체/null/undefined 입력은 빈 진척", () => {
    expect(discoveredMaterialIds(null)).toEqual([]);
    expect(discoveredMaterialIds("x")).toEqual([]);
    expect(discoveredMaterialIds(undefined)).toEqual([]);
    expect(countDiscoveredMaterials(undefined)).toBe(0);
  });

  it("codexRequirement — V2_MATERIALS_ENABLED=false 라 항상 0 (전직 요건 잠금 유지)", () => {
    expect(codexRequirement(undefined)).toBe(0);
    expect(codexRequirement(0)).toBe(0);
    expect(codexRequirement(3)).toBe(0);
    expect(codexRequirement(9999)).toBe(0);
  });
});
