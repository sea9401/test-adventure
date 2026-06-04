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

  it("elementalSkillsForClass — 4직군 각각 대표 구 원소그룹 7종, none 은 빈", () => {
    expect(elementalSkillsForClass("warrior")).toEqual(
      V2_ELEMENTAL_SKILLS_BY_CLASS.swordsman,
    );
    expect(elementalSkillsForClass("rogue")).toEqual(
      V2_ELEMENTAL_SKILLS_BY_CLASS.archer,
    );
    expect(elementalSkillsForClass("mage")).toEqual(
      V2_ELEMENTAL_SKILLS_BY_CLASS.mage,
    );
    expect(elementalSkillsForClass("martial")).toEqual(
      V2_ELEMENTAL_SKILLS_BY_CLASS.martial,
    );
    expect(elementalSkillsForClass("warrior")).toHaveLength(7);
    expect(elementalSkillsForClass("none")).toEqual([]);
  });

  it("학습 비용은 양수", () => {
    expect(V2_ELEMENTAL_LEARN_COST).toBeGreaterThan(0);
  });
});
