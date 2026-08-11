import { describe, expect, it } from "vitest";
import { V2_COMMON_SKILLS } from "./v2SkillsCommonCatalog";
import { describeV2Skill, spCostOf, V2_SKILLS } from "./v2Skills";

const HP_COST_RATIOS = {
  v2c_bloodtemplar_stigma: 1.14,
  v2c_bloodlord_brand: 1.82,
  v2c_blooddemon_reign: 2.62,
} as const;

describe("HP 기반 공격 계수 보상", () => {
  it("원본과 런타임 데이터에 승인된 HP 계수를 보존한다", () => {
    expect(V2_COMMON_SKILLS.v2c_immortal_lifestrike.effects[0]).toMatchObject({
      kind: "damage",
      scaling: "maxHp",
      statCoef: 0.04,
    });
    expect(V2_SKILLS.v2c_immortal_lifestrike.effects[0]).toMatchObject({
      kind: "damage",
      scaling: "maxHp",
      statCoef: 0.04,
    });

    for (const [id, soakRatio] of Object.entries(HP_COST_RATIOS)) {
      const raw = V2_COMMON_SKILLS[
        id as keyof typeof HP_COST_RATIOS
      ].effects.find((effect) => effect.kind === "hpCostDamage");
      const runtime = V2_SKILLS[
        id as keyof typeof HP_COST_RATIOS
      ].effects.find((effect) => effect.kind === "hpCostDamage");
      expect(raw, id).toMatchObject({
        kind: "hpCostDamage",
        soakRatio,
        soakCurrentHpFloorPct: 50,
      });
      expect(runtime, id).toMatchObject({
        kind: "hpCostDamage",
        soakRatio,
        soakCurrentHpFloorPct: 50,
      });
    }
  });

  it("자해·회복·보호막과 차수별 SP 정책을 유지한다", () => {
    const expectedSp = {
      v2c_immortal_lifestrike: 4,
      v2c_berserker_bloodslash: 6,
      v2c_bloodtemplar_stigma: 7,
      v2c_warlord_bloodbath: 7,
      v2c_overlord_ruin: 10,
      v2c_bloodlord_brand: 7,
      v2c_hegemon_annihilation: 13,
      v2c_blooddemon_reign: 12,
    } as const;
    for (const [id, sp] of Object.entries(expectedSp)) {
      expect(spCostOf(V2_SKILLS[id as keyof typeof expectedSp]), id).toBe(sp);
    }
    expect(V2_SKILLS.v2c_bloodtemplar_stigma.effects).toContainEqual({
      kind: "shield",
      pctMaxHp: 6,
      turns: 3,
    });
    expect(V2_SKILLS.v2c_blooddemon_reign.effects).toContainEqual({
      kind: "healFromDamage",
      pct: 20,
    });
    expect(describeV2Skill(V2_SKILLS.v2c_immortal_lifestrike)).toContain(
      "피해 공격력×1.2 + 최대 HP×0.04",
    );
  });
});
