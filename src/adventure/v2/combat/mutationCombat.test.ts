import { describe, expect, it } from "vitest";
import {
  clampMutationResource,
  effectiveMutationDef,
  equippedWeightCycleProfile,
  mutationCastTransition,
  mutationTransitionLogLines,
  resolveWeightCycleCast,
  weightFullDamageTakenReductionPct,
  stoneskinDefMultiplier,
  weightPhysicalSkillMultiplier,
  weightSpeedMultiplier,
} from "./mutationCombat";
import { V2_SKILLS, type V2SkillId } from "@/adventure/data/v2/v2Skills";

describe("mutation battle resources", () => {
  it("중량을 전투 상한 0..3으로 정규화한다", () => {
    expect(clampMutationResource(-1)).toBe(0);
    expect(clampMutationResource(2.9)).toBe(2);
    expect(clampMutationResource(9)).toBe(3);
  });

  it("중량은 스택당 물리 스킬 +5%, 속도 -5%를 적용한다", () => {
    expect(weightPhysicalSkillMultiplier(0)).toBe(1);
    expect(weightPhysicalSkillMultiplier(3)).toBe(1.15);
    expect(weightSpeedMultiplier(3)).toBe(0.85);
  });

  it("돌가죽은 중량당 방어력 6%를 적용한다", () => {
    expect(stoneskinDefMultiplier(3, 6)).toBe(1.18);
    expect(stoneskinDefMultiplier(3, 0)).toBe(1);
    expect(effectiveMutationDef(100, 3, 6)).toBe(118);
  });

  it("마무리기는 기존 자원을 모두 소비하고 생성기는 피해 뒤 자원을 얻는다", () => {
    expect(
      mutationCastTransition(2, { weightGain: 1 }),
    ).toMatchObject({
      weightAfter: 3,
      weightGained: 1,
      weightConsumed: 0,
    });
    expect(
      mutationCastTransition(3, { consumeWeight: true }),
    ).toEqual({
      weightAfter: 0,
      weightGained: 0,
      weightConsumed: 3,
      weightRegained: 0,
    });
  });
});

describe("골렘 계보 중량 순환 판정", () => {
  const resolve = (
    activeId: V2SkillId,
    preCastWeight: number,
    passives: readonly V2SkillId[] = [],
  ) =>
    resolveWeightCycleCast({
      preCastWeight,
      active: V2_SKILLS[activeId],
      equippedPassives: passives.flatMap((id) => {
        const m = V2_SKILLS[id].weightCycle;
        return m ? [m] : [];
      }),
    });

  it("바위 굴리기는 중량 0에서 2, 그 외에는 1을 얻는다", () => {
    expect([0, 1, 2, 3].map((w) => resolve("v2c_rockbrawler_boulderroll", w).weightGain))
      .toEqual([2, 1, 1, 1]);
  });

  it("강철 망치는 중량 3에서만 과적 관통을 얻는다", () => {
    expect([0, 1, 2, 3].map((w) => resolve("v2c_irongolem_ironhammer", w)))
      .toMatchObject([
        { weightGain: 1, piercePct: 0 },
        { weightGain: 1, piercePct: 0 },
        { weightGain: 1, piercePct: 0 },
        { weightGain: 1, piercePct: 10 },
      ]);
  });

  it("암반 내려찍기는 소모량에 비례한 피해와 지연을 만든다", () => {
    expect([0, 1, 2, 3].map((w) => {
      const r = resolve("v2c_rockgiant_bedrockslam", w);
      return [r.consumed, r.releaseDamagePct, r.enemyDelayPct];
    })).toEqual([[0, 0, 0], [1, 15, 6], [2, 30, 12], [3, 45, 18]]);
  });

  it("지각 붕괴로 해방해도 해방 패시브가 발동하고 소모 0이면 발동하지 않는다", () => {
    const passives: V2SkillId[] = [
      "v2c_rockbrawler_unburden",
      "v2c_rockgiant_rampart",
      "v2c_mountaingolem_mountainbody",
    ];
    expect(resolve("v2c_golem_tectoniccollapse", 3, passives)).toMatchObject({
      consumes: true,
      consumed: 3,
      selfHastePct: 15,
      shieldMaxHpPct: 9,
      regainAfterConsume: 1,
      releaseDamagePct: 0,
    });
    expect(resolve("v2c_golem_tectoniccollapse", 0, passives)).toMatchObject({
      consumes: true,
      consumed: 0,
      selfHastePct: 0,
      shieldMaxHpPct: 0,
      regainAfterConsume: 0,
    });
  });

  it("짐 벗기 가속은 15%에서 멈추고 태고의 붕괴 완전 해방과 합산된다", () => {
    expect(resolve("v2c_golem_tectoniccollapse", 3, ["v2c_rockbrawler_unburden"]).selfHastePct)
      .toBe(15);
    expect(resolve("v2c_primevalgolem_primordialcollapse", 3, ["v2c_rockbrawler_unburden"]))
      .toMatchObject({ selfHastePct: 30, piercePct: 12, releaseDamagePct: 60 });
    expect(resolve("v2c_primevalgolem_primordialcollapse", 2, ["v2c_rockbrawler_unburden"]))
      .toMatchObject({ selfHastePct: 10, piercePct: 0 });
  });

  it("산사태 회복은 중량 3을 소모했을 때만 적용된다", () => {
    expect(resolve("v2c_mountaingolem_landslide", 3).actualDamageHealPct).toBe(14);
    expect(resolve("v2c_mountaingolem_landslide", 2).actualDamageHealPct).toBe(0);
  });

  it("대지의 정점은 시전 전 중량 3에서만 직접 물리 피해를 올린다", () => {
    expect(resolve("v2c_golem_rocksmash", 3, ["v2c_primevalgolem_apex"]).directPhysicalDamagePct)
      .toBe(10);
    expect(resolve("v2c_golem_rocksmash", 2, ["v2c_primevalgolem_apex"]).directPhysicalDamagePct)
      .toBe(0);
  });

  it("축적기는 소모하지 않고 기존 암석 강타는 1을 얻는다", () => {
    expect(resolve("v2c_golem_rocksmash", 1)).toMatchObject({
      consumes: false,
      consumed: 0,
      weightGain: 1,
    });
  });

  it("강철 골격 장착 시에만 중량당 SPD 감소가 3%로 완화된다", () => {
    expect(weightSpeedMultiplier(3, 3)).toBeCloseTo(0.91, 10);
    expect(equippedWeightCycleProfile([])).toEqual({
      speedPenaltyPctPerStack: 5,
      fullWeightDamageTakenReductionPct: 0,
    });
    expect(equippedWeightCycleProfile(["v2c_irongolem_ironframe"])).toEqual({
      speedPenaltyPctPerStack: 3,
      fullWeightDamageTakenReductionPct: 0,
    });
  });

  it("대지의 정점은 중량 3에서만 받는 직접 피해를 8% 줄인다", () => {
    expect(weightFullDamageTakenReductionPct(3, ["v2c_primevalgolem_apex"])).toBe(8);
    expect(weightFullDamageTakenReductionPct(2, ["v2c_primevalgolem_apex"])).toBe(0);
    expect(weightFullDamageTakenReductionPct(3, [])).toBe(0);
  });

  it("산맥의 몸 재부착 중량을 전이와 로그에 반영한다", () => {
    const transition = mutationCastTransition(3, {
      consumeWeight: true,
      regainAfterConsume: 1,
    });
    expect(transition).toMatchObject({
      weightAfter: 1,
      weightConsumed: 3,
      weightRegained: 1,
    });
    expect(mutationTransitionLogLines("암반 내려찍기", transition)).toEqual([
      "[암반 내려찍기] 중량 3 소모",
      "[산맥의 몸] 중량 +1 (1/3)",
    ]);
  });
});
