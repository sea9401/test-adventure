import { describe, it, expect } from "vitest";
import { V2_SKILL_LEARN_COST_BASE, v2SkillLearnCost } from "./v2Skills";
import { elementalSkillsForClass } from "./classes";

// 구 원소 풀(직업군 × 속성 42종)은 은퇴·제거됨. 남은 elementalSkillsForClass 의 공용 + 계파
// (전직·차수) 게이팅만 검증한다. (함수명 elementalSkillsForClass 는 레거시 — 호출부 호환.)
describe("elementalSkillsForClass — 공용 + 계파(전직·차수) 게이팅", () => {
  it("공용은 항상, 계파 스킬은 선택 계파(전직)일 때만 노출", () => {
    // 계파 미선택 → 공용만(계파 숨김). 전사=5공용, 마법사=4공용(마력구 패시브 제외).
    const warriorNoSpec = elementalSkillsForClass("warrior");
    expect(warriorNoSpec).toContain("v2c_warrior_strike"); // 공용
    expect(warriorNoSpec).not.toContain("v2s_gwang_greatcleave"); // 계파 미선택 → 숨김
    expect(warriorNoSpec).toHaveLength(5);
    expect(elementalSkillsForClass("mage")).toHaveLength(4); // 마력구 패시브 제외

    // 계파 선택 → 공용 + 그 계파 3종만(같은 직군의 다른 계파는 숨김).
    const gwang = elementalSkillsForClass("warrior", "gwang");
    expect(gwang).toContain("v2c_warrior_strike"); // 공용 유지
    expect(gwang).toContain("v2s_gwang_greatcleave"); // 선택 계파
    expect(gwang).not.toContain("v2s_knight_shieldbash"); // 다른 계파 숨김
    expect(gwang).toHaveLength(5 + 3);

    // 직군 불일치 stale 계파(도적 계파 archery 를 전사에) → 교집합으로 탈락, 공용만.
    expect(elementalSkillsForClass("warrior", "archery")).toHaveLength(5);
    expect(elementalSkillsForClass("none")).toEqual([]);
    expect(elementalSkillsForClass("none", "gwang")).toEqual([]);
  });

  it("계파 스킬은 차수당 1개씩 해금(2차=1·3차=2·4차=3)", () => {
    // 배열 순서 = 해금 순서. gwang = [greatcleave(2차), skysplit(3차), resolve(4차)].
    const common = 5; // 전사 공용
    expect(elementalSkillsForClass("warrior", "gwang", 1)).toHaveLength(common); // 1차 = 계파 0
    const t2 = elementalSkillsForClass("warrior", "gwang", 2);
    expect(t2).toHaveLength(common + 1);
    expect(t2).toContain("v2s_gwang_greatcleave"); // 첫 해금
    expect(t2).not.toContain("v2s_gwang_skysplit");
    const t3 = elementalSkillsForClass("warrior", "gwang", 3);
    expect(t3).toHaveLength(common + 2);
    expect(t3).toContain("v2s_gwang_skysplit"); // 두 번째 해금
    expect(t3).not.toContain("v2s_gwang_resolve");
    const t4 = elementalSkillsForClass("warrior", "gwang", 4);
    expect(t4).toHaveLength(common + 3);
    expect(t4).toContain("v2s_gwang_resolve"); // 마지막 해금
    // tier 미지정 = 게이팅 없음(전부) — 하위호환.
    expect(elementalSkillsForClass("warrior", "gwang")).toHaveLength(common + 3);
  });

  it("학습 비용은 양수", () => {
    expect(V2_SKILL_LEARN_COST_BASE).toBeGreaterThan(0);
  });

  it("학습 비용은 캐릭 성장(cumLevel) 비례로 단조 상승", () => {
    // 신참(cumLevel 0) = base, 음수 cumLevel 도 base 로 클램프.
    expect(v2SkillLearnCost(0)).toBe(V2_SKILL_LEARN_COST_BASE);
    expect(v2SkillLearnCost(-50)).toBe(V2_SKILL_LEARN_COST_BASE);
    // 누적 레벨이 오를수록 비싸진다(엄격 단조).
    expect(v2SkillLearnCost(75)).toBeGreaterThan(v2SkillLearnCost(0));
    expect(v2SkillLearnCost(200)).toBeGreaterThan(v2SkillLearnCost(75));
    // 정수 포인트(반올림).
    expect(Number.isInteger(v2SkillLearnCost(33))).toBe(true);
  });
});
