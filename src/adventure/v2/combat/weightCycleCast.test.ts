import { describe, expect, it } from "vitest";
import type { V2SkillId } from "@/adventure/data/v2/v2Skills";
import { resolveV2SkillCast, type V2SkillCastInput } from "./combatShared";

function cast(
  skillId: V2SkillId,
  weight: number,
  passives: V2SkillId[] = [],
) {
  const equipped = [skillId, ...passives];
  const input: V2SkillCastInput = {
    skills: { learned: equipped, equipped },
    cooldowns: {},
    procRoll: 0,
    attacker: {
      mp: 999,
      atk: 100,
      def: 100,
      vit: 100,
      str: 100,
      int: 100,
      magicAtk: 100,
      maxHp: 1_000,
      currentHp: 1_000,
      maxMp: 999,
      mutationWeight: weight,
      selfBuffs: {},
      selfDebuffs: {},
    },
    target: {
      def: 0,
      maxHp: 100_000,
      currentHp: 100_000,
      selfBuffs: {},
      selfDebuffs: {},
    },
  };
  return resolveV2SkillCast(input);
}

describe("공용 시전 해석의 중량 순환", () => {
  it("기존 골렘 스킬은 골렘 계보 패시브 없이 이전과 같은 결과를 낸다", () => {
    expect(cast("v2c_golem_rocksmash", 0).enemyDamage).toBe(168);
    expect(cast("v2c_golem_rocksmash", 2).enemyDamage).toBe(184);
    expect(cast("v2c_golem_tectoniccollapse", 3).enemyDamage).toBe(350);
    expect(cast("v2c_golem_tectoniccollapse", 0).enemyDamage).toBe(191);
    const collapse = cast("v2c_golem_tectoniccollapse", 3);
    expect(collapse.selfHasteToApply).toBeUndefined();
    expect(collapse.shieldToApply).toBeUndefined();
  });

  it("암반 내려찍기는 소모 1당 15% 피해와 6% 지연을 적용한다", () => {
    const full = cast("v2c_rockgiant_bedrockslam", 3);
    const empty = cast("v2c_rockgiant_bedrockslam", 0);
    expect(full.enemyDamage / empty.enemyDamage).toBeCloseTo(1.15 * 1.45, 1);
    expect(full.enemyDelayToApply?.pct).toBe(18);
    expect(empty.enemyDelayToApply).toBeUndefined();
    expect(full.mutationTransition).toMatchObject({ weightAfter: 0, weightConsumed: 3 });
  });

  it("지각 붕괴 해방에도 암벽 갑주 보호막과 짐 벗기 가속이 붙는다", () => {
    const passives: V2SkillId[] = ["v2c_rockgiant_rampart", "v2c_rockbrawler_unburden"];
    const full = cast("v2c_golem_tectoniccollapse", 3, passives);
    expect(full.shieldToApply?.hp).toBe(90);
    expect(full.selfHasteToApply?.pct).toBe(15);
    const empty = cast("v2c_golem_tectoniccollapse", 0, passives);
    expect(empty.shieldToApply).toBeUndefined();
    expect(empty.selfHasteToApply).toBeUndefined();
  });

  it("산맥의 몸 재부착 중량은 이번 해방 피해에 반영되지 않는다", () => {
    const withBody = cast("v2c_golem_tectoniccollapse", 3, ["v2c_mountaingolem_mountainbody"]);
    expect(withBody.mutationTransition).toMatchObject({ weightAfter: 1, weightRegained: 1 });
    expect(withBody.enemyDamage).toBe(cast("v2c_golem_tectoniccollapse", 3).enemyDamage);
  });

  it("강철 망치는 중량 3에서 중량을 유지하고 과적 관통을 얻는다", () => {
    const full = cast("v2c_irongolem_ironhammer", 3);
    const two = cast("v2c_irongolem_ironhammer", 2);
    expect(full.mutationTransition.weightAfter).toBe(3);
    expect(two.mutationTransition.weightAfter).toBe(3);
    // 방어 0 대상에게 관통 10%p는 피해 +10%다. 중량 차이(1.15/1.10)와 곱해진다.
    expect(full.enemyDamage / two.enemyDamage).toBeCloseTo((1.15 / 1.1) * 1.1, 1);
  });

  it("바위 굴리기는 중량 0에서 2를 얻는다", () => {
    expect(cast("v2c_rockbrawler_boulderroll", 0).mutationTransition.weightAfter).toBe(2);
    expect(cast("v2c_rockbrawler_boulderroll", 1).mutationTransition.weightAfter).toBe(2);
  });

  it("완전 해방 보너스는 중량 3 소모에서만 적용된다", () => {
    expect(cast("v2c_mountaingolem_landslide", 3).healFromActualDamagePct).toBe(14);
    expect(cast("v2c_mountaingolem_landslide", 2).healFromActualDamagePct).toBe(0);
    const primeval = cast("v2c_primevalgolem_primordialcollapse", 3);
    expect(primeval.selfHasteToApply?.pct).toBe(15);
    expect(primeval.healFromActualDamagePct).toBe(0);
    expect(cast("v2c_primevalgolem_primordialcollapse", 2).selfHasteToApply).toBeUndefined();
  });

  it("대지의 정점은 중량 3 직접 물리 스킬만 10% 강화한다", () => {
    const apex: V2SkillId[] = ["v2c_primevalgolem_apex"];
    expect(
      cast("v2c_golem_rocksmash", 3, apex).enemyDamage /
        cast("v2c_golem_rocksmash", 3).enemyDamage,
    ).toBeCloseTo(1.1, 1);
    expect(cast("v2c_golem_rocksmash", 2, apex).enemyDamage).toBe(
      cast("v2c_golem_rocksmash", 2).enemyDamage,
    );
    expect(cast("v2c_mage_fireball", 3, apex).enemyDamage).toBe(
      cast("v2c_mage_fireball", 3).enemyDamage,
    );
  });
});
