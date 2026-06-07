import { describe, it, expect } from "vitest";
import {
  V2_SKILL_LEARN_COST_COMMON,
  V2_SKILL_LEARN_COST_SPEC,
  v2SkillLearnCost,
} from "./v2Skills";
import { elementalSkillsForClass } from "./classes";

// 구 원소 풀(직업군 × 속성 42종)은 은퇴·제거됨. 남은 elementalSkillsForClass 의 공용 + 전문화
// (전직·차수) 게이팅만 검증한다. (함수명 elementalSkillsForClass 는 레거시 — 호출부 호환.)
describe("elementalSkillsForClass — 공용 + 전문화(전직·차수) 게이팅", () => {
  it("공용은 항상, 전문화 스킬은 선택 전문화(전직)일 때만 노출", () => {
    // 전문화 미선택 → 공용만(전문화 숨김). 전사=5공용, 마법사=4공용(마력구 패시브 제외).
    const warriorNoSpec = elementalSkillsForClass("warrior");
    expect(warriorNoSpec).toContain("v2c_warrior_strike"); // 공용
    expect(warriorNoSpec).not.toContain("v2s_gwang_greatcleave"); // 전문화 미선택 → 숨김
    expect(warriorNoSpec).toHaveLength(5);
    expect(elementalSkillsForClass("mage")).toHaveLength(4); // 마력구 패시브 제외

    // 전문화 선택 → 공용 + 그 전문화 3종만(같은 직군의 다른 전문화는 숨김).
    const gwang = elementalSkillsForClass("warrior", "gwang");
    expect(gwang).toContain("v2c_warrior_strike"); // 공용 유지
    expect(gwang).toContain("v2s_gwang_greatcleave"); // 선택 전문화
    expect(gwang).not.toContain("v2s_knight_shieldbash"); // 다른 전문화 숨김
    expect(gwang).toHaveLength(5 + 3);

    // 직군 불일치 stale 전문화(도적 전문화 archery 를 전사에) → 교집합으로 탈락, 공용만.
    expect(elementalSkillsForClass("warrior", "archery")).toHaveLength(5);
    expect(elementalSkillsForClass("none")).toEqual([]);
    expect(elementalSkillsForClass("none", "gwang")).toEqual([]);
  });

  it("전문화 스킬은 차수당 1개씩 해금(2차=1·3차=2·4차=3)", () => {
    // 배열 순서 = 해금 순서. gwang = [greatcleave(2차), skysplit(3차), resolve(4차)].
    const common = 5; // 전사 공용
    expect(elementalSkillsForClass("warrior", "gwang", 1)).toHaveLength(common); // 1차 = 전문화 0
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
