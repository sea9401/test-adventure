import { describe, expect, it } from "vitest";
import {
  aggregateEquippedPassives,
  describeV2Skill,
  spCostOf,
  V2_SKILLS,
  type V2SkillId,
} from "./v2Skills";

describe("결투가 선언과 평타 패시브", () => {
  it.each([
    ["v2c_duelist_declaration", "결투 선언", 32, 5, 1, 3],
    ["v2c_contender_insight", "빈틈 간파", 36, 5, 2, 3],
    ["v2c_undefeated_momentum", "무패의 기세", 40, 6, 3, 4],
    ["v2c_grandchampion_hour", "챔피언의 시간", 44, 7, 4, 5],
  ] as const)("%s는 피해 없는 선언 버프다", (id, name, mpCost, cooldown, rank, hits) => {
    expect(V2_SKILLS[id]).toMatchObject({
      id,
      name,
      category: "buff",
      mpCost,
      cooldown,
      procChance: 100,
      effects: [],
      duelistDeclaration: { rank, hits },
    });
  });

  it("검의 균형은 힘·행운·민첩을 각각 8% 올린다", () => {
    const passive = aggregateEquippedPassives(["v2c_duelist_balance" as V2SkillId]);
    expect(passive.statPct).toMatchObject({ str: 8, luk: 8, dex: 8 });
  });

  it("평타 전용 패시브를 일반 전투 레버와 분리해 집계한다", () => {
    const passive = aggregateEquippedPassives([
      "v2c_contender_precision",
      "v2c_undefeated_rhythm",
      "v2c_grandchampion_instinct",
    ] as V2SkillId[]);
    expect(passive.basicDefPenetrationPct).toBe(10);
    expect(passive.basicCritHastePct).toBe(8);
    expect(passive.basicCritChanceCap).toBe(85);
    expect(passive.enemyPhysicalDefReductionPct).toBe(0);
    expect(passive.critPct).toBe(0);
  });

  it.each([
    [
      "v2c_duelist_declaration",
      7,
      ["다음 평타 3회", "평타 피해 +15%", "평타 치명타 확률 +15%p"],
    ],
    [
      "v2c_contender_insight",
      8,
      ["다음 평타 3회", "평타 방어 관통 +15%p"],
    ],
    [
      "v2c_undefeated_momentum",
      11,
      ["다음 평타 4회", "연속 평타마다 피해 +5% (최대 +15%)"],
    ],
    [
      "v2c_grandchampion_hour",
      13,
      [
        "다음 평타 5회",
        "평타 치명타 배율 +0.25배",
        "평타 치명타 확률 상한 95%",
      ],
    ],
  ] as const)("%s 툴팁과 SP가 계보 효과를 반영한다", (id, spCost, effectLines) => {
    expect(spCostOf(V2_SKILLS[id])).toBe(spCost);
    expect(describeV2Skill(V2_SKILLS[id])).toEqual(
      expect.arrayContaining([...effectLines]),
    );
  });

  it.each([
    ["v2c_duelist_balance", 5, ["힘 +8%", "행운 +8%", "민첩 +8%"]],
    ["v2c_contender_precision", 6, ["평타 방어 관통 +10%p"]],
    [
      "v2c_undefeated_rhythm",
      6,
      ["평타 치명타 시 다음 행동 간격 -8% (1회)"],
    ],
    ["v2c_grandchampion_instinct", 8, ["평타 치명타 확률 상한 85%"]],
  ] as const)("%s 패시브 툴팁과 SP를 표시한다", (id, spCost, effectLines) => {
    expect(spCostOf(V2_SKILLS[id])).toBe(spCost);
    expect(describeV2Skill(V2_SKILLS[id])).toEqual(
      expect.arrayContaining([...effectLines]),
    );
  });
});
