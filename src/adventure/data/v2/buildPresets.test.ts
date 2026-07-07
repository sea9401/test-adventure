import { describe, expect, it } from "vitest";
import { V2_BUILD_TAG_LABEL } from "./buildTags";
import {
  MAX_ACTIVE_BUILD_GOALS,
  V2_BUILD_PRESETS,
  parseBuildGoalsState,
  setBuildGoalActive,
} from "./buildPresets";
import { V2_EQUIPMENT } from "./v2Equipment";
import { V2_SKILLS } from "./v2Skills";

describe("v2 build presets", () => {
  it("실제 장비·스킬과 공용 태그만 참조한다", () => {
    expect(V2_BUILD_PRESETS).toHaveLength(6);
    for (const preset of V2_BUILD_PRESETS) {
      expect(preset.equipmentIds.length, preset.id).toBeGreaterThan(0);
      expect(preset.skillIds.length, preset.id).toBeGreaterThan(0);
      for (const tag of preset.tags) {
        expect(V2_BUILD_TAG_LABEL[tag], `${preset.id}:${tag}`).toBeTruthy();
      }
      for (const id of preset.equipmentIds) {
        expect(V2_EQUIPMENT[id], `${preset.id}:${id}`).toBeTruthy();
      }
      for (const id of preset.skillIds) {
        expect(V2_SKILLS[id], `${preset.id}:${id}`).toBeTruthy();
      }
    }
  });

  it("저장된 목표 프리셋은 유효 id만 중복 없이 최대 개수까지 파싱한다", () => {
    expect(
      parseBuildGoalsState({
        activePresetIds: [
          "venomlord_dash",
          "missing",
          "relic_tank",
          "venomlord_dash",
          "arcane_breaker",
          "duelist_sword",
        ],
      }).activePresetIds,
    ).toEqual(["venomlord_dash", "relic_tank", "arcane_breaker"]);
    expect(MAX_ACTIVE_BUILD_GOALS).toBe(3);
    expect(parseBuildGoalsState(null).activePresetIds).toEqual([]);
  });

  it("목표 토글은 최근 선택을 앞으로 당기고 최대 개수를 유지한다", () => {
    const one = setBuildGoalActive(
      { activePresetIds: ["venomlord_dash", "relic_tank"] },
      "arcane_breaker",
      true,
    );
    expect(one.activePresetIds).toEqual([
      "arcane_breaker",
      "venomlord_dash",
      "relic_tank",
    ]);

    const two = setBuildGoalActive(one, "duelist_sword", true);
    expect(two.activePresetIds).toEqual([
      "duelist_sword",
      "arcane_breaker",
      "venomlord_dash",
    ]);

    const three = setBuildGoalActive(two, "arcane_breaker", false);
    expect(three.activePresetIds).toEqual(["duelist_sword", "venomlord_dash"]);
  });
});
