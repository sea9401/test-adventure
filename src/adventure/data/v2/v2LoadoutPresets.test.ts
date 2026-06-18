import { describe, it, expect } from "vitest";
import {
  PRESET_SLOTS_FREE,
  PRESET_SLOT_COSTS,
  PRESET_SLOTS_BUYABLE_MAX,
  clampSlotsBought,
  totalPresetSlots,
  presetSlotSpend,
  nextPresetSlotCost,
} from "./v2LoadoutPresets";
import { parseV2SkillsState } from "./v2Skills";
import { buildJobCodex } from "./v2JobCodex";
import { emptyProficiency } from "./proficiency";

describe("로드아웃 프리셋 슬롯 경제", () => {
  it("총 슬롯 = 무료 + 구매분, 구매분은 [0, MAX] 클램프", () => {
    expect(totalPresetSlots(0)).toBe(PRESET_SLOTS_FREE);
    expect(totalPresetSlots(2)).toBe(PRESET_SLOTS_FREE + 2);
    expect(clampSlotsBought(-5)).toBe(0);
    expect(clampSlotsBought(999)).toBe(PRESET_SLOTS_BUYABLE_MAX);
    expect(totalPresetSlots(999)).toBe(PRESET_SLOTS_FREE + PRESET_SLOTS_BUYABLE_MAX);
  });

  it("사용분(spend) = 구매한 슬롯 비용 누적합", () => {
    expect(presetSlotSpend(0)).toBe(0);
    expect(presetSlotSpend(1)).toBe(PRESET_SLOT_COSTS[0]);
    expect(presetSlotSpend(2)).toBe(PRESET_SLOT_COSTS[0] + PRESET_SLOT_COSTS[1]);
    expect(presetSlotSpend(PRESET_SLOTS_BUYABLE_MAX)).toBe(
      PRESET_SLOT_COSTS.reduce((a, b) => a + b, 0),
    );
  });

  it("다음 슬롯 가격 = 비용표 순서, 최대 도달 시 null", () => {
    expect(nextPresetSlotCost(0)).toBe(PRESET_SLOT_COSTS[0]);
    expect(nextPresetSlotCost(1)).toBe(PRESET_SLOT_COSTS[1]);
    expect(nextPresetSlotCost(PRESET_SLOTS_BUYABLE_MAX)).toBeNull();
  });

  it("비용은 점증(후반 수집에 당근)", () => {
    for (let i = 1; i < PRESET_SLOT_COSTS.length; i += 1) {
      expect(PRESET_SLOT_COSTS[i]).toBeGreaterThanOrEqual(PRESET_SLOT_COSTS[i - 1]);
    }
  });
});

describe("parseV2SkillsState — 로드아웃 프리셋", () => {
  it("슬롯 수만큼만 프리셋 유지(초과 drop) + 이름 trim/상한 + 유효 id·중복 제거", () => {
    const parsed = parseV2SkillsState({
      learned: ["v2c_warrior_strike", "v2c_warrior_might"],
      equipped: [],
      loadoutPresetSlotsBought: 1, // 총 슬롯 = free(1) + 1 = 2
      loadoutPresets: [
        {
          name: "  탱  ",
          skills: ["v2c_warrior_might", "v2c_warrior_might", "bogus_id"],
        },
        { name: "딜", skills: ["v2c_warrior_strike"] },
        { name: "초과(드롭)", skills: ["v2c_warrior_strike"] }, // 슬롯 2 초과 → drop
      ],
    });
    expect(parsed.loadoutPresetSlotsBought).toBe(1);
    expect(parsed.loadoutPresets).toHaveLength(2); // 슬롯 상한
    expect(parsed.loadoutPresets![0].name).toBe("탱"); // trim
    expect(parsed.loadoutPresets![0].skills).toEqual(["v2c_warrior_might"]); // 중복·무효 제거
  });

  it("미설정/손상은 안전(키 생략, 빈 처리) + slotsBought 클램프", () => {
    const empty = parseV2SkillsState({ learned: [], equipped: [] });
    expect(empty.loadoutPresets).toBeUndefined();
    expect(empty.loadoutPresetSlotsBought).toBeUndefined();
    const clamped = parseV2SkillsState({
      learned: [],
      equipped: [],
      loadoutPresetSlotsBought: 999,
      loadoutPresets: "garbage",
    });
    expect(clamped.loadoutPresetSlotsBought).toBe(PRESET_SLOTS_BUYABLE_MAX);
    expect(clamped.loadoutPresets).toBeUndefined(); // garbage → 빈 → 키 생략
  });
});

describe("buildJobCodex — 수집 포인트 사용분/잔액(소비형)", () => {
  it("누적은 등급 기준·불변, 잔액 = 누적 − 사용분", () => {
    // 직업 패시브 2개 학습 → 누적 2.
    const learned = ["v2c_warrior_might", "v2c_squire_might"];
    const c0 = buildJobCodex(emptyProficiency(), learned, "warrior", null, 0);
    expect(c0.collectionPoints).toBe(2);
    expect(c0.collectionPointsSpent).toBe(0);
    expect(c0.collectionPointsAvailable).toBe(2);

    // 슬롯 1개 구매분 → 사용분 = PRESET_SLOT_COSTS[0]. 누적(등급)은 불변.
    const c1 = buildJobCodex(emptyProficiency(), learned, "warrior", null, 1);
    expect(c1.collectionPoints).toBe(2); // 등급 기준 불변
    expect(c1.collectionPointsSpent).toBe(PRESET_SLOT_COSTS[0]);
    expect(c1.collectionPointsAvailable).toBe(Math.max(0, 2 - PRESET_SLOT_COSTS[0]));
  });

  it("잔액은 음수로 안 내려간다(0 바닥)", () => {
    const c = buildJobCodex(emptyProficiency(), [], "warrior", null, 3);
    expect(c.collectionPoints).toBe(0);
    expect(c.collectionPointsAvailable).toBe(0);
  });
});
