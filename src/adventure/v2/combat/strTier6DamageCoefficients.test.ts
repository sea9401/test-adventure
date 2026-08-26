import { describe, expect, it } from "vitest";
import { V2_COMMON_SKILLS } from "@/adventure/data/v2/v2SkillsCommonCatalog";
import { spCostOf, V2_SKILLS } from "@/adventure/data/v2/v2Skills";
import { resolveV2SkillCast, type V2SkillCastInput } from "./combatShared";

function directSkillCast(
  skillId:
    | "v2c_swordsaint_flash"
    | "v2c_hegemon_annihilation"
    | "v2c_celestialdragon_combo",
  combatMode: "pve" | "pvp",
) {
  return resolveV2SkillCast({
    skills: { learned: [skillId], equipped: [skillId] },
    cooldowns: {},
    procRoll: 0,
    combatMode,
    attacker: {
      mp: 1_000,
      atk: 100,
      str: 100,
      maxHp: 1_000,
      currentHp: 400,
      selfBuffs: {},
      selfDebuffs: {},
    },
    target: {
      def: 0,
      maxHp: 10_000,
      currentHp: 10_000,
      selfBuffs: {},
      selfDebuffs: {},
    },
  } as V2SkillCastInput);
}

describe("6차 STR 직군 직접 피해 계수", () => {
  it("PvE 전용 피해 옵션을 패시브에 두지 않는다", () => {
    for (const skillId of [
      "v2c_swordsaint_transcendence",
      "v2c_hegemon_dominion",
      "v2c_celestialdragon_breath",
    ] as const) {
      expect(V2_COMMON_SKILLS[skillId].passive).not.toHaveProperty(
        "pvePhysicalDamagePct",
      );
    }
  });

  it("검성과 천룡권성은 직접 피해 계수를 크게 올린다", () => {
    expect(V2_COMMON_SKILLS.v2c_swordsaint_flash.effects[0]).toMatchObject({
      kind: "damage",
      statCoef: 1.95,
      primaryStatCoef: 5,
      baseFlat: 460,
    });
    expect(
      V2_COMMON_SKILLS.v2c_celestialdragon_combo.effects.slice(0, 5),
    ).toEqual(
      Array.from({ length: 5 }, () => ({
        kind: "damage",
        statCoef: 0.36,
        primaryStatCoef: 1.2,
        baseFlat: 150,
      })),
    );
    expect(spCostOf(V2_SKILLS.v2c_swordsaint_flash)).toBe(11);
    expect(spCostOf(V2_SKILLS.v2c_celestialdragon_combo)).toBe(11);
  });

  it("PvP가 강한 패황은 기본 계수만 10% 올린다", () => {
    expect(V2_COMMON_SKILLS.v2c_hegemon_annihilation.effects[0]).toMatchObject({
      kind: "missingHpDamage",
      attackCoef: 2.2,
      statCoef: 2.64,
      missingHpCoef: 2,
    });
  });

  it("검성과 천룡권성의 상향 계수는 PvE와 PvP에서 같은 공식으로 작동한다", () => {
    for (const skillId of [
      "v2c_swordsaint_flash",
      "v2c_celestialdragon_combo",
    ] as const) {
      expect(directSkillCast(skillId, "pve").enemyDamage).toBe(
        directSkillCast(skillId, "pvp").enemyDamage,
      );
    }
  });

  it("패황의 기존 PvP 잃은 체력 계수 감산은 유지한다", () => {
    expect(
      directSkillCast("v2c_hegemon_annihilation", "pvp").enemyDamage,
    ).toBeLessThan(
      directSkillCast("v2c_hegemon_annihilation", "pve").enemyDamage,
    );
  });
});
