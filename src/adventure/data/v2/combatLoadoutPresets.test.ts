import { describe, expect, it } from "vitest";
import type { V2EquipInstance } from "./v2Equipment";
import {
  COMBAT_LOADOUT_PRESET_SLOTS,
  combatLoadoutPresetMatches,
  eligiblePresetEquipment,
  eligiblePresetSkills,
  parseCombatLoadoutPresets,
  type CombatLoadoutPreset,
} from "./combatLoadoutPresets";

const STRIKE = "v2c_warrior_strike";

const preset: CombatLoadoutPreset = {
  name: "사냥",
  savedAt: "2026-08-12T00:00:00.000Z",
  skills: [STRIKE],
  pattern: {
    blocks: [
      {
        condition: { kind: "always" },
        action: { kind: "skill", skillId: STRIKE },
      },
    ],
  },
  equipment: { weapon: "w-1" },
};

describe("통합 전투 프리셋 파싱", () => {
  it("손상된 값은 비우고 슬롯 위치를 유지하며 다섯 칸을 넘기지 않는다", () => {
    const parsed = parseCombatLoadoutPresets([
      null,
      {
        name: "  사냥  ",
        savedAt: "2026-08-12T00:00:00.000Z",
        skills: [STRIKE, STRIKE, 7],
        pattern: { blocks: [] },
        equipment: { weapon: "w-1", bogus: "x" },
      },
      "broken",
      null,
      null,
      { name: "sixth", skills: [] },
    ]);

    expect(parsed).toHaveLength(COMBAT_LOADOUT_PRESET_SLOTS);
    expect(parsed[0]).toBeNull();
    expect(parsed[1]).toMatchObject({
      name: "사냥",
      skills: [STRIKE],
      equipment: { weapon: "w-1" },
    });
    expect(parsed[2]).toBeNull();
  });

  it("배열이 아닌 저장값은 빈 다섯 칸으로 복구한다", () => {
    expect(parseCombatLoadoutPresets({ bad: true })).toEqual([
      null,
      null,
      null,
      null,
      null,
    ]);
  });

  it("빈 이름은 슬롯 번호 기본 이름으로 바꾸고 이름 길이를 제한한다", () => {
    const parsed = parseCombatLoadoutPresets([
      { ...preset, name: " " },
      { ...preset, name: "가".repeat(40) },
    ]);

    expect(parsed[0]?.name).toBe("프리셋 1");
    expect(parsed[1]?.name).toBe("가".repeat(24));
  });
});

describe("통합 전투 프리셋 적용 판정", () => {
  it("스킬 순서·패턴·여섯 장비 슬롯이 모두 같을 때만 현재 프리셋이다", () => {
    expect(
      combatLoadoutPresetMatches(preset, {
        skills: [STRIKE],
        pattern: preset.pattern,
        equipment: { weapon: "w-1" },
      }),
    ).toBe(true);
    expect(
      combatLoadoutPresetMatches(preset, {
        skills: [STRIKE],
        pattern: null,
        equipment: { weapon: "w-1" },
      }),
    ).toBe(false);
    expect(
      combatLoadoutPresetMatches(preset, {
        skills: [STRIKE],
        pattern: preset.pattern,
        equipment: { weapon: "w-1", ring: "r-1" },
      }),
    ).toBe(false);
  });

  it("현재 배우지 않은 스킬을 적용 목록에서 제외한다", () => {
    expect(eligiblePresetSkills(preset, [])).toEqual({
      skills: [],
      unavailableSkillIds: [STRIKE],
    });
    expect(eligiblePresetSkills(preset, [STRIKE])).toEqual({
      skills: [STRIKE],
      unavailableSkillIds: [],
    });
  });

  it("판매했거나 저장 슬롯과 실제 슬롯이 다른 장비를 적용 목록에서 제외한다", () => {
    const wrongSlot: V2EquipInstance = {
      iid: "w-1",
      id: "v2_chain_mail",
    };
    expect(eligiblePresetEquipment(preset, [wrongSlot])).toEqual({
      equipment: {},
      unavailableEquipmentIids: ["w-1"],
    });
    expect(eligiblePresetEquipment(preset, [])).toEqual({
      equipment: {},
      unavailableEquipmentIids: ["w-1"],
    });

    const weapon: V2EquipInstance = { iid: "w-1", id: "v2_iron_sword" };
    expect(eligiblePresetEquipment(preset, [weapon])).toEqual({
      equipment: { weapon: "w-1" },
      unavailableEquipmentIids: [],
    });
  });
});
