import { describe, it, expect } from "vitest";
import {
  V2_SKILL_LEARN_COST_COMMON,
  V2_SKILL_LEARN_COST_SPEC,
  v2SkillLearnCost,
} from "./v2Skills";
import { elementalSkillsForClass } from "./classes";

// 직업 시스템 무조건화(PR-6) — elementalSkillsForClass 는 jobId 기준 시그니처 스킬셋(직업 킷)을
// 반환한다. 옛 공용+전문화 차수 게이팅은 폐지. (함수명은 레거시 — 호출부 5곳 호환 위해 유지.)
describe("elementalSkillsForClass — jobId 직업 킷(차수 게이팅 없음)", () => {
  it("기본 직업 = 그 직업 킷, spec 매핑되면 상위 직업 킷", () => {
    // 기본 직업 — 킷(액티브 1 + 패시브 1).
    expect(elementalSkillsForClass("warrior")).toEqual([
      "v2c_warrior_strike",
      "v2c_warrior_might",
    ]);
    expect(elementalSkillsForClass("mage")).toEqual([
      "v2c_mage_boltcast",
      "v2c_mage_acumen",
    ]);
    // spec 이 상위 직업으로 매핑(jobIdFromLegacy) → 그 상위 직업 킷.
    expect(elementalSkillsForClass("warrior", "gwang")).toEqual([
      "v2c_squire_cleave",
      "v2c_squire_might",
    ]); // 견습 기사
    expect(elementalSkillsForClass("warrior", "knight")).toEqual([
      "v2c_shieldman_bash",
      "v2c_shieldman_vitality",
    ]); // 방패병
    // 타직군 stale spec → 부모 기본 직업 킷(jobIdFromLegacy 폴백).
    expect(elementalSkillsForClass("warrior", "archery")).toEqual([
      "v2c_warrior_strike",
      "v2c_warrior_might",
    ]);
    expect(elementalSkillsForClass("none")).toEqual([]);
    expect(elementalSkillsForClass("none", "gwang")).toEqual([]);
  });

  it("3번째 인자(옛 차수)는 무시 — 동일 결과", () => {
    expect(elementalSkillsForClass("warrior", "gwang", 1)).toEqual(
      elementalSkillsForClass("warrior", "gwang", 4),
    );
    expect(elementalSkillsForClass("warrior", "gwang", 2)).toEqual(
      elementalSkillsForClass("warrior", "gwang"),
    );
  });

  it("학습 비용은 스킬 종류별 고정 — 공용 1500 · 전문화 5000", () => {
    // 공용(1차 직업) 스킬.
    expect(v2SkillLearnCost("v2c_warrior_strike")).toBe(
      V2_SKILL_LEARN_COST_COMMON,
    );
    expect(V2_SKILL_LEARN_COST_COMMON).toBe(1500);
    // 전문화 스킬은 더 비싸다.
    expect(v2SkillLearnCost("v2s_gwang_greatcleave")).toBe(
      V2_SKILL_LEARN_COST_SPEC,
    );
    expect(V2_SKILL_LEARN_COST_SPEC).toBe(5000);
    expect(V2_SKILL_LEARN_COST_SPEC).toBeGreaterThan(
      V2_SKILL_LEARN_COST_COMMON,
    );
  });
});
