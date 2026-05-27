import { describe, it, expect } from "vitest";
import {
  V2_SKILLS,
  V2_STARTER_SKILL_IDS,
  parseV2SkillsState,
  emptyV2SkillsState,
  v2SkillSlotsForLevel,
  type V2SkillId,
} from "./v2Skills";

describe("v2Skills 카탈로그", () => {
  it("스타터 6종 모두 카탈로그에 정의되어 있다", () => {
    for (const id of V2_STARTER_SKILL_IDS) {
      expect(V2_SKILLS[id]).toBeDefined();
      expect(V2_SKILLS[id].tier).toBe(1);
    }
  });

  it("카탈로그 entry 의 id 와 key 가 일치", () => {
    for (const [key, def] of Object.entries(V2_SKILLS)) {
      expect(def.id).toBe(key);
    }
  });

  it("MP cost / cooldown 은 음수 아님", () => {
    for (const def of Object.values(V2_SKILLS)) {
      expect(def.mpCost).toBeGreaterThanOrEqual(0);
      expect(def.cooldown).toBeGreaterThanOrEqual(0);
    }
  });

  it("스타터 6종은 6개 스탯 각각 1개씩", () => {
    const stats = new Set(
      V2_STARTER_SKILL_IDS.map((id) => V2_SKILLS[id].stat),
    );
    expect(stats.size).toBe(6);
    expect(stats).toEqual(
      new Set(["str", "dex", "vit", "spd", "luk", "int"]),
    );
  });
});

describe("v2SkillSlotsForLevel", () => {
  it("Lv1-33 = 3 슬롯", () => {
    expect(v2SkillSlotsForLevel(1)).toBe(3);
    expect(v2SkillSlotsForLevel(33)).toBe(3);
  });
  it("Lv34-66 = 4 슬롯", () => {
    expect(v2SkillSlotsForLevel(34)).toBe(4);
    expect(v2SkillSlotsForLevel(66)).toBe(4);
  });
  it("Lv67-99 = 5 슬롯", () => {
    expect(v2SkillSlotsForLevel(67)).toBe(5);
    expect(v2SkillSlotsForLevel(99)).toBe(5);
  });
  it("Lv100 = 6 슬롯", () => {
    expect(v2SkillSlotsForLevel(100)).toBe(6);
  });
  it("Lv0 이하는 Lv1 처럼 3 슬롯 (방어적)", () => {
    expect(v2SkillSlotsForLevel(0)).toBe(3);
    expect(v2SkillSlotsForLevel(-5)).toBe(3);
  });
});

describe("parseV2SkillsState", () => {
  it("undefined/null/string 등 비객체 → empty", () => {
    expect(parseV2SkillsState(undefined)).toEqual(emptyV2SkillsState());
    expect(parseV2SkillsState(null)).toEqual(emptyV2SkillsState());
    expect(parseV2SkillsState("garbage")).toEqual(emptyV2SkillsState());
  });

  it("valid id 만 남기고 unknown 거른다", () => {
    const r = parseV2SkillsState({
      learned: ["v2_skill_strike", "unknown_id", "v2_skill_dash"],
      equipped: ["v2_skill_strike"],
    });
    expect(r.learned).toEqual(["v2_skill_strike", "v2_skill_dash"]);
    expect(r.equipped).toEqual(["v2_skill_strike"]);
  });

  it("중복 id 한 번만 보존", () => {
    const r = parseV2SkillsState({
      learned: ["v2_skill_strike", "v2_skill_strike", "v2_skill_dash"],
      equipped: ["v2_skill_strike", "v2_skill_strike"],
    });
    expect(r.learned).toEqual(["v2_skill_strike", "v2_skill_dash"]);
    expect(r.equipped).toEqual(["v2_skill_strike"]);
  });

  it("learned 에 없는 id 는 equipped 에서 제거 (race 보정)", () => {
    const r = parseV2SkillsState({
      learned: ["v2_skill_strike"],
      equipped: ["v2_skill_strike", "v2_skill_dash"],
    });
    expect(r.equipped).toEqual(["v2_skill_strike"]);
  });

  it("equipped 순서 보존 (자동 발동 우선순위)", () => {
    const ids: V2SkillId[] = [
      "v2_skill_dash",
      "v2_skill_strike",
      "v2_skill_recover",
    ];
    const r = parseV2SkillsState({ learned: ids, equipped: ids });
    expect(r.equipped).toEqual(ids);
  });
});
