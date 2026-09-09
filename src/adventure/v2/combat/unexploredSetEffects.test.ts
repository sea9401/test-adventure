import { describe, expect, it } from "vitest";
import {
  initialUnexploredSetRuntime, ironWallDefGain, manaRedeployment,
  colonyRegeneration, shouldQueueRevenge, afterimageShield, unyieldingDamage,
  revengeDamageMultiplier, revengePendingAfterAttack, crystalFocusStep,
  precisionShotStep, chainDriveFollowUp, frostMark, defenseAfterColossusCrush,
  type UnexploredAttackContext,
} from "./unexploredSetEffects";

const context = (kind: UnexploredAttackContext["kind"], overrides: Partial<UnexploredAttackContext> = {}): UnexploredAttackContext => ({
  kind, mpActuallySpent: 0, hit: true, anyCrit: false, multiHitIndex: 0, multiHitCount: 1, ...overrides,
});

describe("미개척 세트 순수 런타임", () => {
  it("전투마다 예약·횟수·행동 누적량·재귀 가드를 독립적으로 초기화한다", () => {
    const used = initialUnexploredSetRuntime();
    used.revengePending = true;
    used.paidDirectSkillCount = 2;
    used.manualBasicAttackCount = 3;
    used.manaSkillCount = 2;
    used.evasionReducedThisEnemyAction = 100;
    used.chainDriveResolving = true;
    expect(initialUnexploredSetRuntime()).toEqual({ revengePending: false, paidDirectSkillCount: 0, manualBasicAttackCount: 0, manaSkillCount: 0, evasionReducedThisEnemyAction: 0, chainDriveResolving: false });
  });

  it.each([[200, 99, 100], [0, 40, 40], [199, 0, 1], [133, 0, 0], [10000, 80, 100]])(
    "철벽은 실제 HP 피해 %s에서 기존 %s에 누적해 %s 방어력을 반환한다", (hpDamage, currentBonus, expected) => {
      expect(ironWallDefGain({ hpDamage, currentBonus, battleStartDef: 100 })).toBe(expected);
    },
  );

  it("영맥은 평타를 세지 않고 세 번째 스킬마다 내림한 8% 보호막으로 높은 값만 갱신한다", () => {
    expect(manaRedeployment({ currentSkillCount: 2, isSkill: false, currentShield: 50, maxHp: 1009 })).toEqual({ skillCount: 2, shield: 50 });
    expect(manaRedeployment({ currentSkillCount: 0, isSkill: true, currentShield: 50, maxHp: 1009 })).toEqual({ skillCount: 1, shield: 50 });
    expect(manaRedeployment({ currentSkillCount: 2, isSkill: true, currentShield: 50, maxHp: 1009 })).toEqual({ skillCount: 0, shield: 80 });
    expect(manaRedeployment({ currentSkillCount: 2, isSkill: true, currentShield: 100, maxHp: 1009 })).toEqual({ skillCount: 0, shield: 100 });
  });

  it.each([[500, 1, 20], [400, 1, 30], [401, 1, 20], [900, 1, 5], [350, 0, 0], [350, 0.55, 16], [500, 2, 20], [1000, 1, 0], [0, 1, 0]])(
    "군체는 HP %s·받는 회복 배율 %s에서 %s만 회복한다", (hp, receivedHealMult, expected) => {
      expect(colonyRegeneration({ hp, maxHp: 1000, receivedHealMult })).toBe(expected);
    },
  );

  it("응징은 적 행동의 실제 HP 피해가 최대 HP 5% 이상이어야 예약된다", () => {
    expect(shouldQueueRevenge(49, 1000)).toBe(false);
    expect(shouldQueueRevenge(50, 1000)).toBe(true);
    expect(shouldQueueRevenge(0, 1000)).toBe(false);
  });

  it.each([[400, 0, 30], [100, 20, 30], [99, 0, 14], [0, 20, 20]])(
    "허상 피막은 경감량 %s·현재 %s에서 누적 상한을 지켜 %s가 된다", (evasionPreventedDamage, currentShield, expected) => {
      expect(afterimageShield({ evasionPreventedDamage, currentShield, maxHp: 1000 })).toBe(expected);
    },
  );

  it.each([[101, 350, true, 85], [100, 351, true, 100], [100, 350, false, 100], [1, 350, true, 1], [0, 350, true, 0]])(
    "완강은 개별 피해 %s 직전 HP %s와 적격 여부 %s에서 %s 피해다", (damage, hpBefore, eligibleKind, expected) => {
      expect(unyieldingDamage({ damage, hpBefore, maxHp: 1000, eligibleKind })).toBe(expected);
    },
  );

  it.each(["manual_basic", "direct_skill", "counter", "extra_basic", "independent"] as const)(
    "응징은 %s의 실제 직접 피해에만 적용·소모된다", kind => {
      const eligible = kind === "manual_basic" || kind === "direct_skill";
      expect(revengeDamageMultiplier({ pending: true, context: context(kind) })).toBe(eligible ? 1.2 : 1);
      expect(revengeDamageMultiplier({ pending: false, context: context(kind) })).toBe(1);
      expect(revengePendingAfterAttack({ pending: true, context: context(kind), hpDamage: 1 })).toBe(!eligible);
      expect(revengePendingAfterAttack({ pending: true, context: context(kind), hpDamage: 0 })).toBe(true);
      expect(revengePendingAfterAttack({ pending: true, context: context(kind, { hit: false }), hpDamage: 0 })).toBe(true);
    },
  );

  it("응징 배율은 다단 스킬의 각 타격에 동일하게 적용한다", () => {
    for (const multiHitIndex of [0, 1, 2]) {
      expect(revengeDamageMultiplier({ pending: true, context: context("direct_skill", { multiHitIndex, multiHitCount: 3 }) })).toBe(1.2);
    }
  });

  it("수정 집속은 유료 직접 스킬의 세 번째 시도에만 강화하고 주기를 초기화한다", () => {
    let count = 0;
    for (const damageMult of [1, 1, 1.25, 1, 1, 1.25]) {
      const step = crystalFocusStep({ count, isPaidDirectSkill: true });
      expect(step.damageMult).toBe(damageMult);
      expect(step.consumeOnAttempt).toBe(damageMult > 1);
      count = step.count;
    }
    expect(count).toBe(0);
    expect(crystalFocusStep({ count: 2, isPaidDirectSkill: false })).toEqual({ count: 2, damageMult: 1, consumeOnAttempt: false });
  });

  it("정밀 사격은 직접 평타 네 번째마다 일반 명중과 피해를 강화한다", () => {
    let count = 0;
    for (const damageMult of [1, 1, 1, 1.5, 1]) {
      const step = precisionShotStep({ count, isManualBasic: true });
      expect(step.damageMult).toBe(damageMult);
      expect(step.ignoreNormalMiss).toBe(damageMult > 1);
      count = step.count;
    }
    expect(count).toBe(1);
    expect(precisionShotStep({ count: 3, isManualBasic: false })).toEqual({ count: 3, damageMult: 1, ignoreNormalMiss: false });
  });

  it("연쇄 구동은 25% 미만에서 60% 평타를 강화하며 추가 공격 재귀를 막는다", () => {
    const input = { eligibleDirectSkillHit: true, alreadyResolving: false, roll: 0.249, extraBasicAttackDamagePct: 20 };
    expect(chainDriveFollowUp(input)).toEqual({ fires: true, basicDamageMult: 0.72 });
    expect(chainDriveFollowUp({ ...input, extraBasicAttackDamagePct: 0 }).basicDamageMult).toBe(0.6);
    expect(chainDriveFollowUp({ ...input, roll: 0.25 }).fires).toBe(false);
    expect(chainDriveFollowUp({ ...input, alreadyResolving: true }).fires).toBe(false);
    expect(chainDriveFollowUp({ ...input, eligibleDirectSkillHit: false }).fires).toBe(false);
  });

  it("서리 표식은 치명타 적중 때만 2행동 둔화를 만들고 봉쇄로 강화한다", () => {
    expect(frostMark({ eligibleCrit: false, freezingLock: true })).toBeNull();
    expect(frostMark({ eligibleCrit: true, freezingLock: false })).toEqual({ speedReductionPct: 12, accuracyPenalty: 0, actions: 2 });
    expect(frostMark({ eligibleCrit: true, freezingLock: true })).toEqual({ speedReductionPct: 20, accuracyPenalty: 12, actions: 2 });
  });

  it.each(["manual_basic", "direct_skill", "counter", "extra_basic", "independent"] as const)(
    "거수 파쇄는 %s의 대응 방어력에 직접 공격 관통을 적용한다", kind => {
      expect(defenseAfterColossusCrush({ defense: 101, context: context(kind) })).toBe(kind === "manual_basic" || kind === "direct_skill" ? 90 : 101);
    },
  );
});
