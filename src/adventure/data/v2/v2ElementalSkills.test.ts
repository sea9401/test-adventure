import { describe, it, expect } from "vitest";
import {
  V2_SKILLS,
  V2_ELEMENTAL_SKILLS_BY_CLASS,
  V2_SKILL_LEARN_COST_BASE,
  v2SkillLearnCost,
} from "./v2Skills";
import { elementalSkillsForClass } from "./classes";

describe("직업군별 속성 스킬 (6 직업군 × 7 속성 = 42)", () => {
  const GROUPS = [
    "swordsman",
    "archer",
    "martial",
    "mage",
    "priest",
    "ninja",
  ] as const;
  const ELEMS = [
    "water",
    "fire",
    "wind",
    "starlight",
    "void",
    "earth",
    "lightning",
  ] as const;

  it("그룹당 7종, 총 42종", () => {
    let total = 0;
    for (const g of GROUPS) {
      expect(V2_ELEMENTAL_SKILLS_BY_CLASS[g], g).toHaveLength(7);
      total += V2_ELEMENTAL_SKILLS_BY_CLASS[g].length;
    }
    expect(total).toBe(42);
  });

  it("각 속성 스킬 — 카탈로그 존재·id 일치·공격·element 일치·데미지 보유·몹전용 아님", () => {
    for (const g of GROUPS) {
      for (const el of ELEMS) {
        const id = `v2_skill_elem_${g}_${el}`;
        const def = V2_SKILLS[id as keyof typeof V2_SKILLS];
        expect(def, id).toBeDefined();
        expect(def.id).toBe(id);
        expect(def.category).toBe("attack");
        expect(def.element, id).toBe(el);
        expect(def.effects.some((e) => e.kind === "damage"), id).toBe(true);
        expect(def.monsterOnly ?? false).toBe(false);
        expect(def.mpCost).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("각 그룹의 7종이 7속성을 빠짐없이 1번씩 덮는다", () => {
    for (const g of GROUPS) {
      const els = V2_ELEMENTAL_SKILLS_BY_CLASS[g].map(
        (id) => V2_SKILLS[id].element,
      );
      expect(new Set(els), g).toEqual(new Set(ELEMS));
    }
  });

  it("속성 스킬 이름 — 서로·기존 스킬과 충돌 없음", () => {
    const elem: string[] = [];
    const base = new Set<string>();
    for (const [id, def] of Object.entries(V2_SKILLS)) {
      if (id.startsWith("v2_skill_elem_")) elem.push(def.name);
      else base.add(def.name);
    }
    expect(new Set(elem).size).toBe(elem.length); // 서로 유니크
    for (const n of elem) expect(base.has(n), n).toBe(false); // 기존과 충돌 없음
  });

  it("elementalSkillsForClass — 공용은 항상, 계파 스킬은 선택 계파(전직)일 때만 노출", () => {
    // 구 원소 풀은 은퇴. 풀 = 공용(직군) + 선택 계파 3종. 계파 미선택이면 공용만(계파 숨김).
    // 전사/무도가=5공용, 마법사/도적=4공용(마력구/예기 패시브 제외).
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

    // 구 원소 스킬은 더 이상 포함 안 됨.
    for (const id of V2_ELEMENTAL_SKILLS_BY_CLASS.swordsman) {
      expect(warriorNoSpec).not.toContain(id);
    }
    expect(elementalSkillsForClass("none")).toEqual([]);
    expect(elementalSkillsForClass("none", "gwang")).toEqual([]);
  });

  it("elementalSkillsForClass — 계파 스킬은 차수당 1개씩 해금(2차=1·3차=2·4차=3)", () => {
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
