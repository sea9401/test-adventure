import { describe, expect, it } from "vitest";
import { derivePlayerCombatV2Pure } from "@/lib/server/derivePlayerCombatV2";
import {
  TIER6_UNLOCK_CUMLEVEL,
  LEGACY_CLASS_SPEC_BY_JOB,
  jobById,
} from "./v2JobCatalog";
import { effectiveCultivateProfile } from "./proficiency";
import {
  V2_SKILLS,
  aggregateEquippedPassives,
  rebalanceDynamicV2SkillEffects,
  spCostOf,
} from "./v2Skills";
import { skillsForJob } from "./v2SkillsByJob";
import { lawInscriptionRelease } from "@/adventure/v2/combat/lawInscription";

describe("법칙술사 6차 카탈로그", () => {
  it("각인술사 숙련도로 해금되고 INT 3·SPI 3 수행과 직업 보너스를 가진다", () => {
    expect(jobById("lawweaver")).toMatchObject({
      id: "lawweaver",
      name: "법칙술사",
      tier: 6,
      unlock: { prereqs: { inscriber: TIER6_UNLOCK_CUMLEVEL } },
      jobBonus: { int: 28, spi: 12 },
    });
    expect(effectiveCultivateProfile("mage", "lawweaver")).toEqual({
      int: 3,
      spi: 3,
    });
    expect(LEGACY_CLASS_SPEC_BY_JOB.lawweaver).toEqual({
      class: "mage",
      spec: "lawweaver",
    });
  });

  it("법칙 각인과 만상각인 해방의 정적 계약을 선언한다", () => {
    expect(skillsForJob("lawweaver")).toEqual([
      "v2c_lawweaver_release",
      "v2c_lawweaver_inscription",
    ]);
    expect(V2_SKILLS.v2c_lawweaver_release).toMatchObject({
      name: "만상각인 해방",
      stat: "int",
      category: "attack",
      tier: 3,
      mpCost: 86,
      fixedMpCost: 200,
      cooldown: 0,
      procChance: 100,
      learnCost: 12000,
      spCost: 13,
      consumesLawInscriptions: true,
      effects: [],
      defaultPattern: {
        priority: 600,
        condition: {
          kind: "self_resource",
          resource: "inscription",
          op: "atLeast",
          value: 4,
        },
      },
    });
    expect(V2_SKILLS.v2c_lawweaver_inscription).toMatchObject({
      name: "법칙 각인",
      stat: "int",
      category: "passive",
      tier: 3,
      learnCost: 12000,
      spCost: 13,
      passive: {
        statPct: { int: 18, spi: 8 },
        maxMpPct: 16,
        lawInscription: true,
      },
    });
    expect(spCostOf(V2_SKILLS.v2c_lawweaver_release)).toBe(13);
    expect(spCostOf(V2_SKILLS.v2c_lawweaver_inscription)).toBe(13);
  });

  it("장착 패시브를 PlayerCombat 법칙 각인 플래그까지 전달한다", () => {
    expect(
      aggregateEquippedPassives(["v2c_lawweaver_inscription"])
        .lawInscription,
    ).toBe(true);
    expect(aggregateEquippedPassives([]).lawInscription).toBe(false);
    expect(
      derivePlayerCombatV2Pure({
        level: 1,
        v2Equipped: {},
        passiveLawInscription: true,
      }).player.lawInscription,
    ).toBe(true);
    expect(
      derivePlayerCombatV2Pure({ level: 1, v2Equipped: {} }).player,
    ).not.toHaveProperty("lawInscription");
  });

  it("동적 해방 피해에도 6차 액티브 보정을 정확히 한 번 적용할 수 있다", () => {
    expect(
      rebalanceDynamicV2SkillEffects(
        "v2c_lawweaver_release",
        lawInscriptionRelease({ assault: 2, reflux: 1 }).effects,
      ),
    ).toEqual([
      { kind: "damage", statCoef: 2.17, baseFlat: 504, scaling: "magic" },
      { kind: "damage", statCoef: 0.3, baseFlat: 81, scaling: "magic" },
      { kind: "damage", statCoef: 0.3, baseFlat: 81, scaling: "magic" },
      { kind: "manaRestore", pctMaxMp: 4 },
    ]);
  });
});
