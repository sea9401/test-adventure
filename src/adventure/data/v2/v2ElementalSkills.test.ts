import { describe, it, expect } from "vitest";
import {
  V2_SKILLS,
  V2_ELEMENTAL_SKILLS_BY_CLASS,
  V2_ELEMENTAL_LEARN_COST,
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

  it("elementalSkillsForClass — 스킬 재설계 후 공용+계파 풀 반환(구 원소 은퇴), none 은 빈", () => {
    // 구 원소 풀은 학습 목록서 은퇴 → 함수가 더 이상 V2_ELEMENTAL_SKILLS_BY_CLASS 를 반환하지 않음.
    // 새 풀 = 공용(직군) + 계파(직군 9). 전사/무도가=5공용, 마법사/도적=4공용(마력구/예기 패시브 제외).
    const warrior = elementalSkillsForClass("warrior");
    expect(warrior).toContain("v2c_warrior_strike"); // 공용
    expect(warrior).toContain("v2s_gwang_greatcleave"); // 계파
    expect(warrior).toHaveLength(5 + 9);
    expect(elementalSkillsForClass("mage")).toHaveLength(4 + 9); // 마력구 패시브 제외
    // 구 원소 스킬은 더 이상 포함 안 됨.
    for (const id of V2_ELEMENTAL_SKILLS_BY_CLASS.swordsman) {
      expect(warrior).not.toContain(id);
    }
    expect(elementalSkillsForClass("none")).toEqual([]);
  });

  it("학습 비용은 양수", () => {
    expect(V2_ELEMENTAL_LEARN_COST).toBeGreaterThan(0);
  });
});
