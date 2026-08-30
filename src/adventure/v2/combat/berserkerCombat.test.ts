import { describe, expect, it } from "vitest";
import {
  applyBerserkerCastTransition,
  applyBerserkerLethalDamage,
  berserkerCastContext,
  clampBerserkerGuardedHp,
  finishBerserkerCurrentActionGuard,
  finishBerserkerPlayerAttack,
  initialBerserkerCombatState,
} from "./berserkerCombat";

describe("광전사–패황 사망 극복 상태", () => {
  it("광기 0~2단계와 자발적 HP 비용은 사망 극복을 발동하지 않는다", () => {
    for (const madnessRank of [0, 2] as const) {
      const result = applyBerserkerLethalDamage({
        state: initialBerserkerCombatState(),
        madnessRank,
        hp: 0,
        maxHp: 1_000,
        source: "hostile",
      });
      expect(result.triggered).toBe(false);
      expect(result.deferToGenericEndurance).toBe(true);
    }

    const voluntary = applyBerserkerLethalDamage({
      state: initialBerserkerCombatState(),
      madnessRank: 4,
      hp: 0,
      maxHp: 1_000,
      source: "voluntary",
    });
    expect(voluntary.triggered).toBe(false);
    expect(voluntary.deferToGenericEndurance).toBe(false);
  });

  it("광기의 왕좌는 최대 HP 20%로 버티고 현재 적대 행동이 끝날 때까지 그 HP를 지킨다", () => {
    const result = applyBerserkerLethalDamage({
      state: initialBerserkerCombatState(),
      madnessRank: 3,
      hp: -200,
      maxHp: 1_001,
      source: "hostile",
    });

    expect(result).toMatchObject({
      triggered: true,
      deferToGenericEndurance: false,
      hp: 200,
      state: {
        deathOvercomeUsed: true,
        deathDamageReady: false,
        hpFloor: 200,
        guardUntil: "current_action_end",
        annihilationUsesRemaining: 1,
      },
    });
    expect(clampBerserkerGuardedHp(result.state, 25)).toBe(200);

    const ended = finishBerserkerCurrentActionGuard(result.state);
    expect(ended.guardUntil).toBe("none");
    expect(ended.hpFloor).toBe(0);
    expect(clampBerserkerGuardedHp(ended, 25)).toBe(25);
  });

  it("패황의 지배는 다음 플레이어 공격까지 보호하고 죽음의 공격과 멸왕일도 1회를 충전한다", () => {
    const result = applyBerserkerLethalDamage({
      state: initialBerserkerCombatState(),
      madnessRank: 4,
      hp: 0,
      maxHp: 1_000,
      source: "hostile",
    });

    expect(result.hp).toBe(400);
    expect(result.state).toMatchObject({
      deathDamageReady: true,
      hpFloor: 400,
      guardUntil: "player_attack_end",
      annihilationUsesRemaining: 2,
    });
    expect(finishBerserkerCurrentActionGuard(result.state)).toEqual(result.state);
    expect(clampBerserkerGuardedHp(result.state, 1)).toBe(400);

    const ended = finishBerserkerPlayerAttack(result.state);
    expect(ended).toMatchObject({
      deathDamageReady: false,
      hpFloor: 0,
      guardUntil: "none",
    });
  });

  it("멸왕일도는 재충전 뒤에도 전투당 최대 두 번만 실제 소비한다", () => {
    const recharged = applyBerserkerLethalDamage({
      state: initialBerserkerCombatState(),
      madnessRank: 4,
      hp: 0,
      maxHp: 1_000,
      source: "hostile",
    }).state;
    const consume = {
      grantFinisher: false,
      consumeFinisher: false,
      consumeDeathDamage: false,
      consumeAnnihilationUse: true,
      forceSkillCrit: false,
      bonusSkillCritDamagePct: 0,
    };
    const once = applyBerserkerCastTransition(recharged, consume);
    const twice = applyBerserkerCastTransition(once, consume);
    const third = applyBerserkerCastTransition(twice, consume);
    expect([once, twice, third].map((state) => state.annihilationUsesRemaining)).toEqual([1, 0, 0]);
  });

  it("혈전 준비 전이를 적용하고 시전 문맥으로 안전하게 투영한다", () => {
    const granted = applyBerserkerCastTransition(initialBerserkerCombatState(), {
      grantFinisher: true,
      consumeFinisher: false,
      consumeDeathDamage: false,
      consumeAnnihilationUse: false,
      forceSkillCrit: false,
      bonusSkillCritDamagePct: 0,
    });
    expect(granted.finisherReady).toBe(true);
    expect(berserkerCastContext(2, granted)).toEqual({
      madnessRank: 2,
      finisherReady: true,
      deathDamageReady: false,
      annihilationUsesRemaining: 1,
    });
  });

  it("첫 치명타는 사망 극복이 먼저 처리하고 두 번째 치명타만 일반 불굴로 넘긴다", () => {
    const first = applyBerserkerLethalDamage({
      state: initialBerserkerCombatState(),
      madnessRank: 3,
      hp: 0,
      maxHp: 1_000,
      source: "hostile",
    });
    expect(first.triggered).toBe(true);
    expect(first.deferToGenericEndurance).toBe(false);

    const second = applyBerserkerLethalDamage({
      state: finishBerserkerCurrentActionGuard(first.state),
      madnessRank: 3,
      hp: 0,
      maxHp: 1_000,
      source: "hostile",
    });
    expect(second.triggered).toBe(false);
    expect(second.deferToGenericEndurance).toBe(true);
  });
});
