import { describe, expect, it } from "vitest";
import {
  V2_EQUIPMENT,
  V2_EQUIP_SETS,
  V2_EQUIP_TAG_SETS,
} from "./v2Equipment";
import { V2_SKILLS } from "./v2Skills";
import {
  V2_BUILD_TAG_LABEL,
  V2_EQUIPMENT_CODEX_BUILD_TAG_FILTERS,
  V2_EQUIPMENT_OPTION_BUILD_TAGS,
  buildTagsForEquipment,
  buildTagsForSkill,
  equipmentHasBuildTag,
  type V2BuildTagId,
} from "./buildTags";

function expectTags(
  tags: readonly V2BuildTagId[],
  expected: readonly V2BuildTagId[],
) {
  for (const tag of expected) expect(tags).toContain(tag);
}

describe("v2 build tags", () => {
  it("도감 필터 태그는 모두 라벨을 가진다", () => {
    expect(V2_EQUIPMENT_CODEX_BUILD_TAG_FILTERS.length).toBeGreaterThan(0);
    for (const tag of V2_EQUIPMENT_CODEX_BUILD_TAG_FILTERS) {
      expect(V2_BUILD_TAG_LABEL[tag]).toBeTruthy();
    }
  });

  it("장비 옵션 태그는 모두 공용 라벨을 가진다", () => {
    for (const tags of Object.values(V2_EQUIPMENT_OPTION_BUILD_TAGS)) {
      for (const tag of tags ?? []) expect(V2_BUILD_TAG_LABEL[tag]).toBeTruthy();
    }
  });

  it("장비 태그 — 옵션·세트·시그니처에서 빌드 축을 추론한다", () => {
    expectTags(buildTagsForEquipment(V2_EQUIPMENT.v2_boss_canyon_fang), [
      "crit",
      "poison",
      "dot",
      "signature",
    ]);
    expectTags(buildTagsForEquipment(V2_EQUIPMENT.v2_hard_sangoon_cleaver), [
      "physical",
      "tank",
      "set",
    ]);
    expectTags(buildTagsForEquipment(V2_EQUIPMENT.v2_boss_abyssal_armor), [
      "magic",
      "tank",
      "set",
    ]);
    expect(equipmentHasBuildTag(V2_EQUIPMENT.v2_boss_canyon_fang, "poison")).toBe(
      true,
    );
  });

  it("세트 정의 태그는 조각 장비에 상속된다", () => {
    expectTags(buildTagsForEquipment(V2_EQUIPMENT.v2_sanctum_sig_priest_armor), [
      "heal",
      "low_hp",
      "set",
    ]);
    expectTags(buildTagsForEquipment(V2_EQUIPMENT.v2_swamp_sig_venom_gloves), [
      "crit",
      "evasion",
      "speed",
      "set",
    ]);
    expectTags(buildTagsForEquipment(V2_EQUIPMENT.v2_den_sig_alpha_greatsword), [
      "bleed",
      "dot",
      "set",
    ]);
    expectTags(buildTagsForEquipment(V2_EQUIPMENT.v2_crafted_oathblade), [
      "tank",
      "set",
    ]);
  });

  it("모든 장비 세트와 태그 세트는 빌드 태그를 가진다", () => {
    for (const set of V2_EQUIP_SETS) {
      expect(set.buildTags?.length ?? 0, set.id).toBeGreaterThan(0);
      for (const tag of set.buildTags ?? []) {
        expect(V2_BUILD_TAG_LABEL[tag], `${set.id}:${tag}`).toBeTruthy();
      }
    }
    for (const set of V2_EQUIP_TAG_SETS) {
      expect(set.buildTags?.length ?? 0, set.id).toBeGreaterThan(0);
      for (const tag of set.buildTags ?? []) {
        expect(V2_BUILD_TAG_LABEL[tag], `${set.id}:${tag}`).toBeTruthy();
      }
    }
  });

  it("스킬 태그 — 효과·패시브에서 빌드 축을 추론한다", () => {
    expectTags(buildTagsForSkill(V2_SKILLS.v2c_venomist_toxiccloud), [
      "luk",
      "poison",
      "dot",
    ]);
    expectTags(buildTagsForSkill(V2_SKILLS.v2c_warder_barrier), [
      "int",
      "magic",
      "shield",
      "tank",
    ]);
    expectTags(buildTagsForSkill(V2_SKILLS.v2c_chief_strike), [
      "dex",
      "physical",
      "pierce",
    ]);
    expectTags(buildTagsForSkill(V2_SKILLS.v2c_crimsontemplar_oath), [
      "str",
      "low_hp",
      "heal",
      "tank",
    ]);
  });

  it("명시 buildTags 는 추론 태그와 함께 유지된다", () => {
    expect(
      buildTagsForEquipment({
        ...V2_EQUIPMENT.v2_iron_sword,
        buildTags: ["low_hp"],
      }),
    ).toContain("low_hp");
    expect(
      buildTagsForSkill({
        ...V2_SKILLS.v2_skill_strike,
        buildTags: ["execute"],
      }),
    ).toContain("execute");
  });
});
