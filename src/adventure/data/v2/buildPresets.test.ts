import { describe, expect, it } from "vitest";
import { V2_BUILD_TAG_LABEL } from "./buildTags";
import {
  MAX_ACTIVE_BUILD_GOALS,
  V2_BUILD_PRESETS,
  buildPresetProgress,
  parseBuildGoalsState,
  recommendBuildPresets,
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

  it("프리셋 진행률은 장비·도감·스킬·장착 축을 분리해 계산한다", () => {
    const preset = V2_BUILD_PRESETS[0];
    const progress = buildPresetProgress(preset, {
      ownedEquipmentIds: new Set([preset.equipmentIds[0], preset.equipmentIds[1]]),
      registeredEquipmentIds: new Set([preset.equipmentIds[0]]),
      learnedSkillIds: new Set([preset.skillIds[0], preset.skillIds[1]]),
      equippedSkillIds: new Set([preset.skillIds[0]]),
    });

    expect(progress.equipmentOwned).toBe(2);
    expect(progress.equipmentRegistered).toBe(1);
    expect(progress.skillsLearned).toBe(2);
    expect(progress.skillsEquipped).toBe(1);
    expect(progress.score).toBe(6);
    expect(progress.maxScore).toBe(16);
    expect(progress.pct).toBe(38);
    expect(progress.missingEquipmentIds).toEqual(preset.equipmentIds.slice(2));
    expect(progress.missingSkillIds).toEqual(preset.skillIds.slice(2));
    expect(progress.unequippedLearnedSkillIds).toEqual([preset.skillIds[1]]);
  });

  it("현재 보유 상태에 가까운 프리셋을 추천 순으로 정렬한다", () => {
    const [venom, relic, arcane] = V2_BUILD_PRESETS;
    const recommendations = recommendBuildPresets([venom, relic, arcane], {
      ownedEquipmentIds: new Set([...arcane.equipmentIds, relic.equipmentIds[0]]),
      registeredEquipmentIds: new Set([arcane.equipmentIds[0]]),
      learnedSkillIds: new Set(arcane.skillIds),
      equippedSkillIds: new Set([arcane.skillIds[0], arcane.skillIds[1]]),
    });

    expect(recommendations.map((entry) => entry.preset.id)).toEqual([
      arcane.id,
      relic.id,
      venom.id,
    ]);
    expect(recommendations[0].rank).toBe(1);
    expect(recommendations[0].reason).toBe("스킬 장착만 보강");
  });
});
