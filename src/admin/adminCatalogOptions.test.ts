import { describe, expect, it } from "vitest";
import {
  cookingIngredientOptions,
  v2EquipmentOptionGroups,
  v2EquipmentOptions,
  v2MaterialOptionGroups,
  v2MaterialOptions,
} from "./adminCatalogOptions";

describe("관리자 요리 재료 선택지", () => {
  it("SVG 전용 재료는 장식 문자 없이 이름을 표시한다", () => {
    const options = cookingIngredientOptions();

    expect(options.find((option) => option.id === "pantry:salt")?.label).toBe(
      "상점 · 소금",
    );
    expect(
      options.find((option) => option.id === "processed:cheese")?.label,
    ).toBe("가공 · 치즈");
  });
});

function flattenedIds(groups: Array<{ options: Array<{ id: string }> }>) {
  return groups.flatMap((group) => group.options.map((option) => option.id));
}

describe("관리자 지급 카탈로그 분류", () => {
  it("모든 재료를 중복 없이 한 분류에 넣고 미개척지 재료와 소환석을 분리한다", () => {
    const groups = v2MaterialOptionGroups();
    const ids = flattenedIds(groups);
    const allIds = v2MaterialOptions().map((option) => option.id);

    expect(ids).toHaveLength(new Set(ids).size);
    expect(new Set(ids)).toEqual(new Set(allIds));
    expect(
      groups.find((group) => group.id === "unexplored-materials")?.options,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "v2_unexplored_star_sea_shell" }),
        expect.objectContaining({ id: "v2_unexplored_dead_star_eye" }),
      ]),
    );
    expect(
      groups.find((group) => group.id === "unexplored-boss-materials")
        ?.options,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "v2_unexplored_boss_core" }),
      ]),
    );
    expect(
      groups.find((group) => group.id === "unexplored-summon-stones")
        ?.options,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "v2_unexplored_tracking_weapon_summon_stone",
        }),
        expect.objectContaining({
          id: "v2_unexplored_toxic_blood_lord_summon_stone",
        }),
        expect.objectContaining({
          id: "v2_unexplored_glacial_colossus_summon_stone",
        }),
      ]),
    );
  });

  it("모든 장비를 중복 없이 한 분류에 넣고 미개척지 장비를 출처별로 분리한다", () => {
    const groups = v2EquipmentOptionGroups();
    const ids = flattenedIds(groups);
    const allIds = v2EquipmentOptions().map((option) => option.id);

    expect(ids).toHaveLength(new Set(ids).size);
    expect(new Set(ids)).toEqual(new Set(allIds));
    expect(
      groups.find((group) => group.id === "unexplored-pioneer")?.options,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "v2_pioneer_iron_wall_armor" }),
      ]),
    );
    expect(
      groups.find((group) => group.id === "unexplored-crafted")?.options,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "v2_unexplored_overheat_tracking_gloves",
        }),
      ]),
    );
    expect(
      groups.find((group) => group.id === "unexplored-boss")?.options,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "v2_unexplored_tracking_blade_dagger",
        }),
        expect.objectContaining({
          id: "v2_unexplored_absolute_zero_core",
        }),
      ]),
    );
  });
});
