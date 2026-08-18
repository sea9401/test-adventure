import { describe, expect, it } from "vitest";
import {
  LEGACY_CLASS_SPEC_BY_JOB,
  TIER5_UNLOCK_CUMLEVEL,
  jobById,
} from "./v2JobCatalog";
import { effectiveCultivateProfile } from "./proficiency";
import {
  V2_SKILLS,
  aggregateEquippedPassives,
  spCostOf,
} from "./v2Skills";
import { skillsForJob } from "./v2SkillsByJob";

describe("빙결술사 5차 카탈로그", () => {
  it("냉기 마법사 숙련도로 해금되고 INT 3·SPI 2 수행과 직업 보너스를 가진다", () => {
    expect(jobById("cryomancer")).toMatchObject({
      id: "cryomancer",
      name: "빙결술사",
      tier: 5,
      unlock: { prereqs: { frostmage: TIER5_UNLOCK_CUMLEVEL } },
      jobBonus: { int: 18, spi: 8 },
    });
    expect(effectiveCultivateProfile("mage", "cryomancer")).toEqual({
      int: 3,
      spi: 2,
    });
    expect(LEGACY_CLASS_SPEC_BY_JOB.cryomancer).toEqual({
      class: "mage",
      spec: "cryomancer",
    });
  });

  it("빙결술사의 스킬과 한기 계약을 선언한다", () => {
    expect(skillsForJob("cryomancer")).toEqual([
      "v2c_cryomancer_absolutezero",
      "v2c_cryomancer_freezingpoint",
    ]);
    expect(V2_SKILLS.v2c_cryomancer_absolutezero).toMatchObject({
      name: "절대영도",
      stat: "int",
      category: "attack",
      tier: 3,
      fixedMpCost: 155,
      cooldown: 0,
      procChance: 53,
      learnCost: 8000,
      spCost: 7,
      frostChillGain: 3,
      effects: [
        { kind: "damage", statCoef: 1.98, baseFlat: 486, scaling: "magic" },
      ],
    });
    expect(V2_SKILLS.v2c_cryomancer_freezingpoint).toMatchObject({
      name: "빙점 지배",
      stat: "int",
      category: "passive",
      tier: 3,
      learnCost: 8000,
      spCost: 6,
      passive: {
        maxMpPct: 12,
        freezeDamagePct: 50,
        freezeDelayPct: 40,
      },
    });
    expect(spCostOf(V2_SKILLS.v2c_cryomancer_absolutezero)).toBe(7);
    expect(spCostOf(V2_SKILLS.v2c_cryomancer_freezingpoint)).toBe(6);
  });

  it("빙하진은 보호막·즉시 지연 대신 한기 2를 부여한다", () => {
    expect(V2_SKILLS.v2c_frostmage_glacier).toMatchObject({
      frostChillGain: 2,
      effects: [
        { kind: "damage", statCoef: 1.26, baseFlat: 244, scaling: "magic" },
      ],
    });
  });

  it("빙점 지배의 패시브를 집계하고 미장착 기본값은 0이다", () => {
    expect(
      aggregateEquippedPassives(["v2c_cryomancer_freezingpoint"]),
    ).toMatchObject({
      maxMpPct: 12,
      freezeDamagePct: 50,
      freezeDelayPct: 40,
    });
    expect(aggregateEquippedPassives([])).toMatchObject({
      freezeDamagePct: 0,
      freezeDelayPct: 0,
    });
  });

  it("지각진은 기존 지연·보호막 정체성을 유지한다", () => {
    expect(V2_SKILLS.v2c_earthmage_tectonic.effects).toEqual([
      { kind: "damage", statCoef: 1.3, baseFlat: 252, scaling: "magic" },
      { kind: "enemyDelay", pct: 35 },
      { kind: "shield", pctMaxHp: 6, turns: 3 },
    ]);
  });
});
