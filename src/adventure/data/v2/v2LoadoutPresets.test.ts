import { describe, it, expect } from "vitest";
import { PRESET_SLOTS, totalPresetSlots } from "./v2LoadoutPresets";
import { parseV2SkillsState } from "./v2Skills";

describe("로드아웃 프리셋 슬롯(무료 고정)", () => {
  it("총 슬롯 = PRESET_SLOTS 고정(구매 폐지·인자 없음)", () => {
    expect(totalPresetSlots()).toBe(PRESET_SLOTS);
    expect(PRESET_SLOTS).toBe(5);
  });
});

describe("parseV2SkillsState — 로드아웃 프리셋", () => {
  it("이름 trim/상한 + 유효 id·중복 제거", () => {
    const parsed = parseV2SkillsState({
      learned: ["v2c_warrior_strike", "v2c_warrior_might"],
      equipped: [],
      loadoutPresets: [
        {
          name: "  탱  ",
          skills: ["v2c_warrior_might", "v2c_warrior_might", "bogus_id"],
        },
        { name: "딜", skills: ["v2c_warrior_strike"] },
      ],
    });
    expect(parsed.loadoutPresets).toHaveLength(2);
    expect(parsed.loadoutPresets![0].name).toBe("탱"); // trim
    expect(parsed.loadoutPresets![0].skills).toEqual(["v2c_warrior_might"]); // 중복·무효 제거
  });

  it("고정 슬롯(5) 초과분은 drop", () => {
    const many = Array.from({ length: 8 }, (_, i) => ({
      name: `p${i}`,
      skills: ["v2c_warrior_strike"],
    }));
    const parsed = parseV2SkillsState({
      learned: ["v2c_warrior_strike"],
      equipped: [],
      loadoutPresets: many,
    });
    expect(parsed.loadoutPresets).toHaveLength(PRESET_SLOTS); // 5 상한
  });

  it("옛 loadoutPresetSlotsBought 필드는 무시(inert)·미보존", () => {
    const parsed = parseV2SkillsState({
      learned: [],
      equipped: [],
      loadoutPresetSlotsBought: 3,
    });
    expect(
      (parsed as { loadoutPresetSlotsBought?: number }).loadoutPresetSlotsBought,
    ).toBeUndefined();
  });

  it("미설정/손상은 안전(키 생략)", () => {
    const empty = parseV2SkillsState({ learned: [], equipped: [] });
    expect(empty.loadoutPresets).toBeUndefined();
    const garbage = parseV2SkillsState({
      learned: [],
      equipped: [],
      loadoutPresets: "garbage",
    });
    expect(garbage.loadoutPresets).toBeUndefined();
  });
});
