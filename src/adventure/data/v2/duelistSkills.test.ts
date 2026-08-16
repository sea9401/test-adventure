import { describe, expect, it } from "vitest";
import { aggregateEquippedPassives, V2_SKILLS, type V2SkillId } from "./v2Skills";

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
});
