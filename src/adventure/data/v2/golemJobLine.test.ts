import { describe, expect, it } from "vitest";
import {
  V2_SKILLS,
  describeV2Skill,
  skillPowerScore,
  spCostOf,
} from "./v2Skills";
import { V2_SKILLS_BY_JOB } from "./v2SkillsByJob";

const PACKAGES = {
  rockbrawler: {
    ids: ["v2c_rockbrawler_boulderroll", "v2c_rockbrawler_unburden"],
    power: [2.3, 2.5],
    sp: 8,
  },
  rockgiant: {
    ids: ["v2c_rockgiant_bedrockslam", "v2c_rockgiant_rampart"],
    power: [2.9, 3.1],
    sp: 9,
  },
  irongolem: {
    ids: ["v2c_irongolem_ironhammer", "v2c_irongolem_ironframe"],
    power: [3.7, 3.9],
    // 루브릭 산출값. 성능 범위 안에서는 12 SP 경계에 닿지 않는다.
    sp: 11,
  },
  mountaingolem: {
    ids: ["v2c_mountaingolem_landslide", "v2c_mountaingolem_mountainbody"],
    power: [5.0, 5.2],
    sp: 15,
  },
  primevalgolem: {
    ids: ["v2c_primevalgolem_primordialcollapse", "v2c_primevalgolem_apex"],
    power: [9.2, 9.4],
    sp: 26,
  },
} as const;

const RELEASE_PATTERN = {
  priority: 500,
  condition: { kind: "self_resource", resource: "weight", op: "atLeast", value: 3 },
};

describe("골렘 2~6차 스킬 패키지", () => {
  it.each(Object.entries(PACKAGES))(
    "%s 는 액티브 하나와 패시브 하나를 가진다",
    (jobId, expected) => {
      expect(V2_SKILLS_BY_JOB[jobId]).toEqual(expected.ids);
      const [activeId, passiveId] = expected.ids;
      const active = V2_SKILLS[activeId];
      const passive = V2_SKILLS[passiveId];
      expect(active.category).toBe("attack");
      expect(passive.category).toBe("passive");
      expect(active.stat).toBe("vit");
      expect(active.fixedMpCost).toBeUndefined();
      expect(active.cooldown).toBe(0);
      expect(active.spCostDiscount).toBeUndefined();
      expect(passive.spCostDiscount).toBeUndefined();
      expect(active.effects).toHaveLength(1);
      expect(active.effects[0]).toMatchObject({ kind: "damage", scaling: "def" });
    },
  );

  it.each(Object.entries(PACKAGES))(
    "%s 는 승인된 성능·SP 범위 안에 있다",
    (_jobId, expected) => {
      const skills = expected.ids.map((id) => V2_SKILLS[id]);
      const power = skills.reduce((sum, skill) => sum + skillPowerScore(skill), 0);
      const sp = skills.reduce((sum, skill) => sum + spCostOf(skill), 0);
      expect(power).toBeGreaterThanOrEqual(expected.power[0]);
      expect(power).toBeLessThanOrEqual(expected.power[1]);
      expect(sp).toBe(expected.sp);
    },
  );

  it("승인된 중량 순환 수치를 데이터로 선언한다", () => {
    expect(V2_SKILLS.v2c_rockbrawler_boulderroll).toMatchObject({
      tier: 2, tempo: "control",
      weightCycle: { gain: { amount: 1, amountFromEmpty: 2 } },
      defaultPattern: {
        priority: 450,
        condition: { kind: "self_resource", resource: "weight", op: "atMost", value: 0 },
      },
    });
    expect(V2_SKILLS.v2c_rockbrawler_unburden.weightCycle).toEqual({
      onRelease: { hastePctPerStack: 5, hasteMaxPct: 15 },
    });
    expect(V2_SKILLS.v2c_rockgiant_bedrockslam).toMatchObject({
      tier: 3, tempo: "payoff",
      weightCycle: {
        release: { damagePctPerStack: 15, enemyDelayPctPerStack: 6, enemyDelayMaxPct: 18 },
      },
      defaultPattern: RELEASE_PATTERN,
    });
    expect(V2_SKILLS.v2c_rockgiant_rampart).toMatchObject({
      passive: { statPct: { vit: 10 } },
      weightCycle: { onRelease: { shieldMaxHpPctPerStack: 3 } },
    });
    expect(V2_SKILLS.v2c_irongolem_ironhammer).toMatchObject({
      tier: 3, tempo: "control",
      weightCycle: { gain: { amount: 1, overloadPenetrationPct: 10 } },
    });
    expect(V2_SKILLS.v2c_irongolem_ironframe).toMatchObject({
      passive: { statPct: { str: 12 } },
      weightCycle: { speedPenaltyPctPerStack: 3 },
    });
    expect(V2_SKILLS.v2c_mountaingolem_landslide).toMatchObject({
      tier: 3, tempo: "payoff",
      weightCycle: { release: { damagePctPerStack: 18, fullActualDamageHealPct: 14 } },
      defaultPattern: RELEASE_PATTERN,
    });
    expect(V2_SKILLS.v2c_mountaingolem_mountainbody).toMatchObject({
      passive: { statPct: { vit: 12 }, maxHpPct: 12 },
      weightCycle: { onRelease: { regainWeight: 1 } },
    });
    expect(V2_SKILLS.v2c_primevalgolem_primordialcollapse).toMatchObject({
      tier: 3, tempo: "payoff",
      weightCycle: {
        release: { damagePctPerStack: 20, fullPenetrationPct: 12, fullCastHastePct: 15 },
      },
      defaultPattern: RELEASE_PATTERN,
    });
    expect(V2_SKILLS.v2c_primevalgolem_apex).toMatchObject({
      passive: { statPct: { vit: 24, str: 18 }, maxHpPct: 16 },
      weightCycle: {
        fullWeightDirectPhysicalDamagePct: 10,
        fullWeightDamageTakenReductionPct: 8,
      },
    });
  });

  it("같은 선언으로 상세 칩을 만든다", () => {
    expect(describeV2Skill(V2_SKILLS.v2c_rockgiant_bedrockslam)).toEqual(
      expect.arrayContaining([
        "중량 전부 소모 · 소모 1당 최종 피해 +15%",
        "명중 시 소모 1당 적 다음 행동 6% 지연 (최대 18%)",
      ]),
    );
    expect(describeV2Skill(V2_SKILLS.v2c_irongolem_ironframe)).toContain(
      "중량당 SPD 감소 5% → 3%",
    );
  });

  it("기존 골렘 스킬의 SP와 성능은 바뀌지 않는다", () => {
    expect(spCostOf(V2_SKILLS.v2c_golem_rocksmash)).toBe(4);
    expect(spCostOf(V2_SKILLS.v2c_golem_tectoniccollapse)).toBe(5);
    expect(spCostOf(V2_SKILLS.v2c_golem_stoneskin)).toBe(1);
    expect(skillPowerScore(V2_SKILLS.v2c_golem_rocksmash)).toBeCloseTo(1.256, 3);
    expect(skillPowerScore(V2_SKILLS.v2c_golem_tectoniccollapse)).toBeCloseTo(1.384, 3);
  });
});
