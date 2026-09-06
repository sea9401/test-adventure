import { combatRandom } from "./combatRandom";
import { recordCombatDamage, recordCombatMetric } from "./combatDiagnostics";
import type { Monster } from "@/adventure/data/monsters";
import { computeMpRestoreAmount, type Potion } from "@/adventure/data/potions";
import {
  ANALYSIS_PENALTY_CAP_PCT,
  cappedDefReductionPct,
  HEAVEN_DECREE_HP_PCT,
  LUCKY_STAR_DAMAGE_MULT,
  RAMPAGE_START_TURN,
} from "@/adventure/data/v2/v2CombatConstants";
import { aggregateEquippedPassives } from "@/adventure/data/v2/v2Skills";
import {
  applyBerserkerLethalDamage,
  clampBerserkerGuardedHp,
  finishBerserkerCurrentActionGuard,
  initialBerserkerCombatState,
} from "./berserkerCombat";
import {
  applyPlayerPoisonDamageScaling,
  applyV2DotsToTarget,
  damageBetween,
  decrementTimedBuffs,
  defaultV2MaxMpFor,
  healingAfterReceivedMultiplier,
  makeBleedDot,
  makePoisonDot,
  potionHealAmount,
  rollAttackCount,
  v2AtkBuffMult,
  v2DefBuffMult,
  type V2SkillCastResult,
  type V2SkillDotApply,
} from "./combatShared";
import { reducedMagicDefense } from "./engine.damageHelpers";
import {
  BOSS_PCT_HP_DAMAGE_MULT,
  type BattleBuffs,
  type BattleLogEntry,
  type BattleStacks,
  type BattleState,
  type PlayerCombat,
} from "./engineState";
import { appendLog, applyHealShieldIfAny } from "./engineSupport";
import { emptyLawInscriptionState } from "./lawInscription";
import {
  battleStartShield,
  resolveTrackedShieldAbsorption,
  trackedBattleStartShield,
  trackedShieldBreakEffect,
} from "./signatureEffects";
import { hasTier6Unique, initialTier6UniqueRuntime } from "./tier6UniqueEffects";
import { initialTripleWardState } from "./tripleWard";
import { applyRegenIfAny, applyEnchantRegenIfAny, applyPassiveTurnHealIfAny } from "./engine.pveRecovery";
export { applyRegenIfAny, applyEnchantRegenIfAny, applyPassiveTurnHealIfAny } from "./engine.pveRecovery";

export function applyTrackedSetShieldAbsorptionPve(
  state: BattleState,
  player: PlayerCombat,
  shieldAbsorbed: number,
): BattleState {
  const effect = trackedShieldBreakEffect(player.equipSignatures);
  if (!effect) return state;
  const resolution = resolveTrackedShieldAbsorption({
    remaining: state.stacks.trackedSetShield ?? 0,
    totalShieldBefore: state.stacks.playerShield + shieldAbsorbed,
    shieldAbsorbed,
    alreadyTriggered: state.flags.trackedShieldBreakUsed ?? false,
  });
  if (!resolution.triggered) {
    return {
      ...state,
      stacks: { ...state.stacks, trackedSetShield: resolution.remaining },
    };
  }
  return {
    ...state,
    flags: { ...state.flags, trackedShieldBreakUsed: true },
    buffs: {
      ...state.buffs,
      playerDmgReductionPct: Math.max(
        state.buffs.playerDmgReductionTurnsLeft > 0
          ? state.buffs.playerDmgReductionPct
          : 0,
        effect.damageReductionPct,
      ),
      playerDmgReductionTurnsLeft: Math.max(
        state.buffs.playerDmgReductionTurnsLeft,
        effect.actions,
      ),
    },
    stacks: {
      ...state.stacks,
      trackedSetShield: 0,
      ...(effect.cleanse ? { chillStacks: 0, curseStacks: 0 } : {}),
    },
    ...(effect.cleanse ? { playerV2Dots: [], v2SelfDebuffs: {} } : {}),
    log: appendLog(state.log, {
      kind: "info",
      text: `[${effect.label}] 해로운 효과가 해제되고 받는 피해가 감소한다.`,
      turn: "enemy",
    }),
  };
}


// 플레이어 공격이 마주하는 적 DEF — 누적 페이즈 보너스 포함, 보스 취약(armorVulnerable)·
// 정확 스킬(armorPierceFraction) 비례 관통을 차례로 적용. 본타는 여기에 분쇄(고정 감산)/
// 암살(DEF 0)을 추가로 얹으므로 호출 측에서 따로 처리하고, 단순 추가타(분신/난무/반격)는 이 값 그대로.
export function playerFacingEnemyDef(
  state: BattleState,
  player: PlayerCombat,
  // 발동턴 AP 시한부 버프(약점 노출 등) 적용을 위해 buffs 를 별도 인자로 받을 수 있음.
  // 호출 측에서 시한부 버프가 반영된 buffs 를 전달(없으면 state.buffs).
  buffs: BattleBuffs = state.buffs,
): number {
  // 약점 분석(5티어)의 누적 페널티는 raw def 에 직접 적용 → 음수 클램프.
  const raw = Math.max(
    0,
    state.enemy.def + buffs.enemyDefBonus - buffs.enemyDefPenalty,
  );
  const afterVuln = Math.round(raw * (1 - (state.enemy.armorVulnerable ?? 0)));
  const frac = player.armorPierceFraction ?? 0;
  const afterPierce =
    frac > 0 ? Math.round(afterVuln * (1 - frac)) : afterVuln;
  // 별빛 관통(enchant pierce) — flat. 약점 노출 곱연산 직전에 직접 차감. 0 클램프.
  const enchantPierce = player.enchantPierceFlat ?? 0;
  const afterEnchantPierce =
    enchantPierce > 0 ? Math.max(0, afterPierce - enchantPierce) : afterPierce;
  const activeReductionPct =
    buffs.enemyDefDebuffTurnsLeft > 0 ? buffs.enemyDefDebuffPct : 0;
  const physicalReductionPct = cappedDefReductionPct(
    activeReductionPct,
    player.enemyPhysicalDefReductionPct ?? 0,
    isEnemyPoisoned(state) ? player.poisonedEnemyDefReductionPct ?? 0 : 0,
  );
  return physicalReductionPct > 0
    ? Math.max(
        0,
        Math.round(afterEnchantPierce * (1 - physicalReductionPct / 100)),
      )
    : afterEnchantPierce;
}


export function isEnemyBleeding(state: BattleState): boolean {
  return state.enemyV2Dots.some((d) => d.tag === "bleed" && d.stacks > 0 && d.turns > 0);
}


export function isEnemyPoisoned(state: BattleState): boolean {
  return state.enemyV2Dots.some((d) => d.tag === "poison" && d.stacks > 0 && d.turns > 0);
}


export function playerSkillTargetDef(state: BattleState, player: PlayerCombat): number {
  // 평타와 같은 고정·비율 관통, 전투 중 방어 디버프, 상시 감소와 부식을 순서대로 한 번만 적용한다.
  return playerFacingEnemyDef(state, player);
}


export function playerSkillTargetMagicDef(
  state: BattleState,
  player: PlayerCombat,
): number {
  const base = state.enemy.magicDef ?? state.enemy.def;
  const reductionPct = cappedDefReductionPct(
    (state.buffs.enemyMagicDefDebuffTurnsLeft ?? 0) > 0
      ? state.buffs.enemyMagicDefDebuffPct ?? 0
      : 0,
    player.enemyMagicDefReductionPct ?? 0,
  );
  return reducedMagicDefense(
    base,
    reductionPct,
  );
}


export function applyPoisonDamageToDots(
  dots: readonly V2SkillDotApply[],
  player: PlayerCombat,
): V2SkillDotApply[] {
  return applyPlayerPoisonDamageScaling(dots, player.poisonDamagePct);
}


export function applyPlayerOnHitDots(
  state: BattleState,
  player: PlayerCombat,
  add?: { bleedStacks?: number; poisonStacks?: number },
): BattleState {
  const dots: import("./combatShared").V2Dot[] = [];
  const bleedStacks =
    (add?.bleedStacks ?? 0) + (player.bleedOnHit ? 1 : 0);
  if (bleedStacks > 0) {
    dots.push(makeBleedDot({
      stacks: bleedStacks,
      flatPerStack: player.bleedOnHit?.flatPerStack ?? 0,
      atkCoefPerStack: player.bleedOnHit?.atkCoefPerStack,
      sourceAtk: player.atk,
    }));
  }
  const poisonStacks =
    (add?.poisonStacks ?? 0) + (player.poisonOnHit ? 1 : 0);
  if (player.poisonOnHit && poisonStacks > 0) {
    dots.push(
      ...applyPlayerPoisonDamageScaling(
        [
          makePoisonDot({
            stacks: poisonStacks,
            pctMaxHpPerStack: player.poisonOnHit.pctMaxHpPerStack,
            sourceAtk: player.atk,
          }),
        ],
        player.poisonDamagePct,
      ),
    );
  }
  if (dots.length === 0) return state;
  return {
    ...state,
    enemyV2Dots: applyV2DotsToTarget(state.enemyV2Dots, dots),
  };
}


// 다음 플레이어 턴의 공격 횟수. 로직(100% 초과 = 정수부 확정 추가타 + 나머지 확률)은
// combatShared.rollAttackCount 로 단일화 — PvP 엔진과 공유해 한쪽만 바뀌는 divergence 방지.
// export — offlineSim 의 시전 턴 종료가 resolveBattle 과 동일하게 다음 턴 공격수를 재굴림하도록.
export function rollPlayerAttackCount(player: PlayerCombat): number {
  return rollAttackCount(player);
}


// 혈광 (검투사 시그니처) — 적이 출혈 중이면 그 턴 공격 횟수 굴림에 추가 공격 확률 +%p.
// rollPlayerAttackCount 를 감싸 enemyBleeding 일 때만 extraAttackChancePct 를 부풀린다.
// 미보유(0/undefined)·출혈 없음이면 그대로 통과 → 라이브/비전문화 무변.
export function rollPlayerAttackCountWithBleed(
  state: BattleState,
  player: PlayerCombat,
): number {
  const bonus = player.extraAttackChancePctWhileEnemyBleeding ?? 0;
  if (bonus <= 0 || !isEnemyBleeding(state)) {
    return rollPlayerAttackCount(player);
  }
  return rollPlayerAttackCount({
    ...player,
    extraAttackChancePct: (player.extraAttackChancePct ?? 0) + bonus,
  });
}


// 한 번의 enemy phase 진입 시 결정되는 총 공격 횟수 — base 1 + bonusAttackChancePct 기반.
// rollPlayerAttackCount 와 같은 100%↑ 정수확정 규칙. 0/undefined = 1대.
export function rollEnemyAttackCount(enemy: Monster): number {
  const chance = enemy.bonusAttackChancePct ?? 0;
  if (chance <= 0) return 1;
  const guaranteed = Math.floor(chance / 100);
  const remainder = chance - guaranteed * 100;
  return 1 + guaranteed + (combatRandom() * 100 < remainder ? 1 : 0);
}


// enemy 공격 1회 종료 시 호출 — 남은 공격이 있으면 phase="enemy" 유지, 0 이면 "player".
// 그림자 보법처럼 모든 공격 무효인 경우 호출자가 enemyAttacksLeft 를 0 으로 강제하고 phase: "player" 직접 set.
export function finishEnemyAttack(state: BattleState): BattleState {
  const remaining = Math.max(0, state.turn.enemyAttacksLeft - 1);
  const berserker = state.berserker
    ? finishBerserkerCurrentActionGuard(state.berserker)
    : undefined;
  return {
    ...state,
    ...(berserker ? { berserker } : {}),
    turn: { ...state.turn, enemyAttacksLeft: remaining },
    phase: remaining > 0 ? "enemy" : "player",
  };
}


/** 보호막·경감 뒤 적대 피해를 사망 극복 → 일반 불굴 순으로 넘기기 위한 PvE 공통 관문. */
export function applyBerserkerHostileDamage(
  state: BattleState,
  player: PlayerCombat,
  hpAfterDamage: number,
  turn: "player" | "enemy" = "enemy",
): { state: BattleState; triggered: boolean } {
  if (!state.berserker) {
    return {
      state: { ...state, playerHp: Math.max(0, hpAfterDamage) },
      triggered: false,
    };
  }
  const guardedHp = clampBerserkerGuardedHp(
    state.berserker,
    hpAfterDamage,
  );
  const result = applyBerserkerLethalDamage({
    state: state.berserker,
    madnessRank: player.berserkerMadnessRank ?? 0,
    hp: guardedHp,
    maxHp: state.playerMaxHp,
    source: "hostile",
  });
  recordCombatMetric("survival_restoration", "berserker", "player", Math.max(0, result.hp) - Math.max(0, hpAfterDamage));
  let log = state.log;
  if (result.triggered) {
    log = appendLog(log, {
      kind: "info",
      text: `[사망 극복] 쓰러지지 않고 HP ${result.hp}로 돌아왔다.`,
      turn,
    });
    if ((player.berserkerMadnessRank ?? 0) >= 4) {
      log = appendLog(log, {
        kind: "info",
        text: `[패황의 지배] 다음 공격 강화 · 멸왕일도 1회 재충전.`,
        turn,
      });
    }
  }
  return {
    state: {
      ...state,
      playerHp: Math.max(0, result.hp),
      berserker: result.state,
      log,
    },
    triggered: result.triggered,
  };
}


// 페이즈 트리거 — 적 HP 가 phaseTrigger.hpFraction 미만으로 떨어진 순간 1회 발동.
// enemyDefBonus 누적 + 알림 로그. 이미 죽었거나 발동했으면 무시. 호출 측은 enemyHp 가
// 갱신된 state 를 넘겨야 한다.
export function applyPhaseTriggerIfAny(state: BattleState): BattleState {
  const trigger = state.enemy.phaseTrigger;
  if (!trigger || state.flags.phaseTriggered) return state;
  if (state.enemyHp <= 0) return state;
  const threshold = state.enemy.hp * trigger.hpFraction;
  if (state.enemyHp >= threshold) return state;
  return {
    ...state,
    flags: { ...state.flags, phaseTriggered: true },
    buffs: {
      ...state.buffs,
      enemyDefBonus: state.buffs.enemyDefBonus + trigger.defBonus,
    },
    log: appendLog(state.log, { kind: "phase_trigger", text: trigger.message }),
  };
}


// 반격 — 회피 직후 카운터 1회. 적이 죽으면 ended 로 종료.
// 크리티컬 / 강공격 등은 적용하지 않음 — 별도 단순 데미지.
export function applyCounterIfAny(
  state: BattleState,
  player: PlayerCombat,
): { state: BattleState; ended: boolean } {
  const bonus = player.counterAtkBonus ?? 0;
  if (bonus <= 0) return { state, ended: false };
  // PR-5a: v2 buff/debuff 격리 해제 — 반격 데미지도 일반 공격과 동일하게 v2 buff 곱셈.
  const v2AtkMult = v2AtkBuffMult(state.v2SelfBuffs, state.v2SelfDebuffs);
  const v2DefMult = v2DefBuffMult(state.enemyV2SelfBuffs, state.enemyV2Debuffs);
  const atk = v2AtkMult !== 1
    ? Math.floor((player.atk + bonus) * v2AtkMult)
    : player.atk + bonus;
  const def = playerFacingEnemyDef(state, player);
  const v2EffDef = v2DefMult !== 1 ? Math.floor(def * v2DefMult) : def;
  const dmg = damageBetween(atk, v2EffDef);
  const damagedState = applyEnemyDamage(state, dmg);
  const enemyHp = damagedState.enemyHp;
  let next: BattleState = {
    ...damagedState,
    enemyHp,
    log: appendLog(state.log, {
      kind: "player_attack",
      text: `[반격] ${dmg} 피해를 입혔다.`,
    }),
  };
  next = applyPhaseTriggerIfAny(next);
  if (enemyHp <= 0) {
    return {
      state: {
        ...next,
        log: appendLog(next.log, {
          kind: "info",
          text: `${state.enemy.name}을(를) 쓰러뜨렸다!`,
        }),
        phase: "ended",
        outcome: "win",
      },
      ended: true,
    };
  }
  return { state: next, ended: false };
}


// 피격 생존 반격 패시브 — enemyPhase 기본 공격뿐 아니라 몬스터 v2 스킬 피해에도 같은 조건으로 발동.
export function applyPassiveCounterOnHitIfAny(
  state: BattleState,
  player: PlayerCombat,
): BattleState {
  const pct = player.passiveCounterChancePct ?? 0;
  if (
    pct <= 0 ||
    state.playerHp <= 0 ||
    state.enemyHp <= 0 ||
    combatRandom() * 100 >= pct
  ) {
    return state;
  }

  const v2AtkMult = v2AtkBuffMult(state.v2SelfBuffs, state.v2SelfDebuffs);
  const v2DefMult = v2DefBuffMult(state.enemyV2SelfBuffs, state.enemyV2Debuffs);
  const counterDef = playerFacingEnemyDef(state, player);
  const counterBoostPct =
    player.passiveCounterDamageUsesReflectBoost &&
    state.stacks.skillReflectBoostTurns > 0
      ? state.stacks.skillReflectBoostPct
      : 0;
  const counterAtk =
    v2AtkMult !== 1 ? Math.floor(player.atk * v2AtkMult) : player.atk;
  const boostedCounterAtk =
    counterBoostPct > 0
      ? Math.floor(counterAtk * (1 + counterBoostPct / 100))
      : counterAtk;
  const dmg = damageBetween(
    boostedCounterAtk,
    v2DefMult !== 1 ? Math.floor(counterDef * v2DefMult) : counterDef,
  );
  const damagedState = applyEnemyDamage(state, dmg);
  const enemyHp = damagedState.enemyHp;
  let next: BattleState = {
    ...damagedState,
    enemyHp,
    log: appendLog(state.log, {
      kind: "player_attack",
      text: `[${counterBoostPct > 0 ? "반격 + 금강인" : "반격"}] ${state.enemy.name}에게 ${dmg} 반격 피해.`,
    }),
  };
  if (enemyHp <= 0) {
    next = {
      ...next,
      log: appendLog(next.log, {
        kind: "info",
        text: `${state.enemy.name}을(를) 쓰러뜨렸다!`,
      }),
      phase: "ended",
      outcome: "win",
    };
  }
  return next;
}




// 부가 공격(분신/난무 등) 1회 — 본인 빌드로 발동시킨 추가타라 "**모든 공격**" / "**매 공격마다**"
// 로 설명된 효과는 함께 적용한다:
//   - 출혈 +1 스택 (bleedDmgPerStack 보유 시)
//   - 행운의 별 (5티어) — 확률 × 데미지 배수
//   - 천명 (4티어) — 확률 × 적 현재 HP %
//   - 흡혈류 (행운의 흡혈 / 흡혈의 룬 / 흡령) — 비크리 기반만 적용 (extras 는 크리 안 굴림)
// 미적용: 본타 정체성에 묶인 것들 — 크리/강공격/충돌파/약점적중/연참/연쇄운명/암살/AP 스킬 발동,
//   AP +1 (행동 자원이라 분신 회복원 되면 AP 스킬 페이싱 망가짐).
// 자동 반사(반격/가시/반사 회피) 는 별도 경로 — 여기 안 옴.
export function dealExtraEnemyDamage(
  state: BattleState,
  baseDmg: number,
  label: string,
  player: PlayerCombat,
  playerName: string,
): BattleState {
  // 행운의 별 — 모든 공격 ×배수.
  const luckyStarPct = player.luckyStarChancePct ?? 0;
  const luckyStarFires =
    luckyStarPct > 0 && combatRandom() * 100 < luckyStarPct;
  const dmgAfterLuckyStar = luckyStarFires
    ? Math.floor(baseDmg * LUCKY_STAR_DAMAGE_MULT)
    : baseDmg;
  // 천명 — 적 현재 HP % (보스에는 BOSS_PCT_HP_DAMAGE_MULT 감산).
  const decreeFires =
    (player.heavenDecreeChancePct ?? 0) > 0 &&
    combatRandom() * 100 < player.heavenDecreeChancePct!;
  const decreeBaseDmg = decreeFires
    ? Math.floor((state.enemyHp * HEAVEN_DECREE_HP_PCT) / 100)
    : 0;
  const decreeDmg = state.isBoss
    ? Math.floor(decreeBaseDmg * BOSS_PCT_HP_DAMAGE_MULT)
    : decreeBaseDmg;
  const totalDmg = dmgAfterLuckyStar + decreeDmg;
  const damagedState = applyEnemyDamage(state, totalDmg);
  const enemyHp = damagedState.enemyHp;
  // 흡혈류 — 크리 흡혈(lifestealCritHealPct) 은 extras 가 크리 안 굴리므로 제외. 그 외 셋만.
  const luckyLifestealHeal =
    (player.luckyLifestealPct ?? 0) > 0
      ? Math.floor((totalDmg * player.luckyLifestealPct!) / 100)
      : 0;
  const runeLifestealHeal =
    (player.runeLifestealPct ?? 0) > 0
      ? Math.floor((totalDmg * player.runeLifestealPct!) / 100)
      : 0;
  const apLifestealHeal =
    state.buffs.playerLifestealTurnsLeft > 0 && state.buffs.playerLifestealPct > 0
      ? Math.floor((totalDmg * state.buffs.playerLifestealPct) / 100)
      : 0;
  const passiveLifestealHeal = Math.floor(
    (Math.max(0, state.enemyHp - enemyHp) * (player.passiveLifestealPct ?? 0)) / 100,
  );
  const totalHeal = healingAfterReceivedMultiplier(
    luckyLifestealHeal + runeLifestealHeal + apLifestealHeal + passiveLifestealHeal,
    player.receivedHealMult,
  );
  const newPlayerHp =
    totalHeal > 0
      ? Math.min(state.playerMaxHp, state.playerHp + totalHeal)
      : state.playerHp;
  const actualHeal = newPlayerHp - state.playerHp;
  recordCombatMetric("healing", "extra_lifesteal", "player", actualHeal);
  // 메인 데미지 라인 — 라벨에 행운의 별/천명 합쳐 박는다.
  const dmgLabels: string[] = [label];
  if (luckyStarFires) dmgLabels.push("행운의 별");
  if (decreeFires) dmgLabels.push("천명");
  let log = appendLog(state.log, {
    kind: "player_attack",
    text: `[${dmgLabels.join(" + ")}] ${totalDmg} 피해를 입혔다.`,
  });
  if (actualHeal > 0) {
    const healLabels: string[] = [];
    if (luckyLifestealHeal > 0) healLabels.push("행운의 흡혈");
    if (runeLifestealHeal > 0) healLabels.push("흡혈의 룬");
    if (apLifestealHeal > 0) healLabels.push("흡령");
    if (passiveLifestealHeal > 0) healLabels.push("패시브 흡혈");
    log = appendLog(log, {
      kind: "info",
      text: `[${healLabels.join(" + ")}] ${playerName}의 HP +${actualHeal}`,
    });
  }

  let healedState = {
    ...damagedState,
    enemyHp,
    playerHp: newPlayerHp,
    log,
  };
  healedState = applyHealShieldIfAny(
    healedState,
    player,
    actualHeal,
    totalHeal,
  );
  let next = applyPhaseTriggerIfAny(applyPlayerOnHitDots(healedState, player));
  if (enemyHp <= 0) {
    next = {
      ...next,
      log: appendLog(next.log, {
        kind: "info",
        text: `${state.enemy.name}을(를) 쓰러뜨렸다!`,
      }),
      phase: "ended",
      outcome: "win",
    };
  }
  return next;
}


// 플레이어 턴 종료 후 처리 — 그림자 분신 추가타 → 무피해 난무 추가타들 → 재생.
// 추가타로 적이 죽으면 즉시 종료(이후 단계 건너뜀). 종전 applyRegenIfAny 호출을 이 함수로 대체.
// export — offlineSim 의 시전 턴 종료가 resolveBattle 과 동일한 턴 종료 효과(재생·격노 등)를 거치도록.
// ⚠️ 선행조건: 호출 전에 state.turn.completedPlayerTurns 가 이미 +1 된 상태여야 한다
// (막다른 격노 발동 턴·재생 주기 modulo 판정이 이 값을 기준으로 한다).
// PR2-B-2c — 스킬 temp 버프(운기/연환집중/선풍각/속박)를 cast 결과로 갱신. tick 이 턴 종료
// (finishPlayerTurn)에 효과 적용 후 -1 하므로, 시드 = turns 그대로(시전 턴 포함 정확히 N턴).
// (구 +1 시드는 버그 — Codex 검토: 3턴 선언이 4번 발동했음.)
export function applySkillTempBuffs(
  prev: BattleStacks,
  result: V2SkillCastResult,
): BattleStacks {
  const crit = result.selfBuffPctToApply.find((b) => b.target === "crit");
  const eva = result.selfBuffPctToApply.find((b) => b.target === "evasion");
  const dr = result.selfBuffPctToApply.find((b) => b.target === "damageReduction");
  const reflect = result.selfBuffPctToApply.find((b) => b.target === "reflectDamage");
  return {
    ...prev,
    skillRegenPct: result.selfRegenToApply?.pctMaxHpPerTurn ?? prev.skillRegenPct,
    skillRegenTurns: result.selfRegenToApply ? result.selfRegenToApply.turns : prev.skillRegenTurns,
    skillCritPct: crit?.pct ?? prev.skillCritPct,
    skillCritTurns: crit ? crit.turns : prev.skillCritTurns,
    skillEvasionPct: eva?.pct ?? prev.skillEvasionPct,
    skillEvasionTurns: eva ? eva.turns : prev.skillEvasionTurns,
    skillDmgReducePct: dr?.pct ?? prev.skillDmgReducePct,
    skillDmgReduceTurns: dr ? dr.turns : prev.skillDmgReduceTurns,
    skillReflectBoostPct: reflect?.pct ?? prev.skillReflectBoostPct,
    skillReflectBoostTurns: reflect ? reflect.turns : prev.skillReflectBoostTurns,
    enemyVulnPct: result.enemyVulnToApply?.pct ?? prev.enemyVulnPct,
    enemyVulnTurns: result.enemyVulnToApply ? result.enemyVulnToApply.turns : prev.enemyVulnTurns,
    enemyMagicVulnPct:
      result.enemyMagicVulnToApply?.pct ?? prev.enemyMagicVulnPct ?? 0,
    enemyMagicVulnTurns: result.enemyMagicVulnToApply
      ? result.enemyMagicVulnToApply.turns
      : prev.enemyMagicVulnTurns ?? 0,
    enemyEvasionDownPct: result.enemyEvasionDownToApply?.pct ?? prev.enemyEvasionDownPct,
    enemyEvasionDownTurns: result.enemyEvasionDownToApply ? result.enemyEvasionDownToApply.turns : prev.enemyEvasionDownTurns,
    enemyAccuracyDownPct: result.enemyAccuracyDownToApply?.pct ?? prev.enemyAccuracyDownPct,
    enemyAccuracyDownTurns: result.enemyAccuracyDownToApply ? result.enemyAccuracyDownToApply.turns : prev.enemyAccuracyDownTurns,
    enemyHealReducePct: result.enemyHealReduceToApply?.pct ?? prev.enemyHealReducePct,
    enemyHealReduceTurns: result.enemyHealReduceToApply ? result.enemyHealReduceToApply.turns : prev.enemyHealReduceTurns,
    enemyDamageDownPct: result.enemyDamageDownToApply?.pct ?? prev.enemyDamageDownPct,
    enemyDamageDownTurns: result.enemyDamageDownToApply ? result.enemyDamageDownToApply.turns : prev.enemyDamageDownTurns,
    enemySkillProcDownPct: result.enemySkillProcDownToApply?.pct ?? prev.enemySkillProcDownPct,
    enemySkillProcDownTurns: result.enemySkillProcDownToApply ? result.enemySkillProcDownToApply.turns : prev.enemySkillProcDownTurns,
    enemyDotVulnPct: result.enemyDotVulnToApply?.pct ?? prev.enemyDotVulnPct,
    enemyDotVulnTurns: result.enemyDotVulnToApply ? result.enemyDotVulnToApply.turns : prev.enemyDotVulnTurns,
  };
}


export function finishPlayerTurn(
  state: BattleState,
  player: PlayerCombat,
  playerName: string,
): BattleState {
  let st = state;
  // PR2-B-2c — 운기 리젠(매턴 maxHP%) 적용 후 전 temp 버프 tick(turns -1).
  {
    const s = st.stacks;
    if (s.skillRegenTurns > 0 && s.skillRegenPct > 0 && st.playerHp > 0) {
      const heal = healingAfterReceivedMultiplier(
        Math.floor((st.playerMaxHp * s.skillRegenPct) / 100),
        player.receivedHealMult,
      );
      const before = st.playerHp;
      const nextHp = Math.min(st.playerMaxHp, before + heal);
      recordCombatMetric("healing", "skill_regen", "player", nextHp - before);
      if (nextHp > before) {
        st = {
          ...st,
          playerHp: nextHp,
          log: appendLog(st.log, {
            kind: "info",
            text: `[운기] ${playerName}의 HP +${nextHp - before}`,
            turn: "player",
          }),
        };
        st = applyHealShieldIfAny(st, player, nextHp - before, heal);
      }
    }
    const enemyTargetTurns = (turns: number) =>
      st.usesAtb ? turns : Math.max(0, turns - 1);
    st = {
      ...st,
      stacks: {
        ...st.stacks,
        skillRegenTurns: Math.max(0, s.skillRegenTurns - 1),
        skillCritTurns: Math.max(0, s.skillCritTurns - 1),
        // 반응형 방어 버프는 자기 행동이 아니라 실제 적 직접 공격에서 횟수를 소비한다.
        skillEvasionTurns: s.skillEvasionTurns,
        skillDmgReduceTurns: s.skillDmgReduceTurns,
        skillReflectBoostTurns: s.skillReflectBoostTurns,
        enemyVulnTurns: enemyTargetTurns(s.enemyVulnTurns),
        enemyMagicVulnTurns: enemyTargetTurns(
          s.enemyMagicVulnTurns ?? 0,
        ),
        enemyEvasionDownTurns: enemyTargetTurns(s.enemyEvasionDownTurns),
        enemyAccuracyDownTurns: enemyTargetTurns(s.enemyAccuracyDownTurns),
        enemyHealReduceTurns: enemyTargetTurns(s.enemyHealReduceTurns),
        enemyDamageDownTurns: enemyTargetTurns(s.enemyDamageDownTurns),
        enemySkillProcDownTurns: enemyTargetTurns(s.enemySkillProcDownTurns),
        enemyDotVulnTurns: enemyTargetTurns(s.enemyDotVulnTurns),
      },
    };
  }
  // 분신/난무 추가타 ATK — 메인 공격이 적용한 AP 시한부 ATK 버프(광기 등) 를 동일하게 반영.
  // state.buffs 는 이 시점에 이번 턴의 timed buff 가 박힌 상태.
  const buffedAtkPct =
    st.buffs.playerAtkBuffTurnsLeft > 0 ? st.buffs.playerAtkBuffPct : 0;
  const buffedAtk =
    buffedAtkPct > 0
      ? player.atk + Math.floor((player.atk * buffedAtkPct) / 100)
      : player.atk;
  // PR-5a: 그림자 분신·무피해 난무 모두 v2 buff/debuff 격리 해제 적용.
  const v2AtkMultExtra = v2AtkBuffMult(st.v2SelfBuffs, st.v2SelfDebuffs);
  const v2DefMultExtra = v2DefBuffMult(st.enemyV2SelfBuffs, st.enemyV2Debuffs);
  const applyV2Atk = (rawAtk: number): number =>
    v2AtkMultExtra !== 1 ? Math.floor(rawAtk * v2AtkMultExtra) : rawAtk;
  const applyV2Def = (rawDef: number): number =>
    v2DefMultExtra !== 1 ? Math.floor(rawDef * v2DefMultExtra) : rawDef;
  // 그림자 분신 — ATK 의 N% 로 1회. 6티어 그림자 군단 보유 시 추가 횟수만큼 더 발동.
  const clonePct = player.shadowCloneAtkPct ?? 0;
  const cloneExtra = player.shadowLegionExtraClones ?? 0;
  const cloneCount = clonePct > 0 ? 1 + cloneExtra : 0;
  if (st.phase !== "ended" && cloneCount > 0) {
    for (let i = 0; i < cloneCount; i += 1) {
      if (st.phase === "ended") break;
      const cloneDmg = damageBetween(
        applyV2Atk(Math.floor((buffedAtk * clonePct) / 100)),
        applyV2Def(playerFacingEnemyDef(st, player)),
      );
      st = dealExtraEnemyDamage(
        st,
        cloneDmg,
        cloneExtra > 0 ? "그림자 군단" : "그림자 분신",
        player,
        playerName,
      );
    }
  }
  // 무피해 난무 — 이 전투에서 받은 피해가 0이면 추가 공격 N회.
  const flurry = player.flurryAttacks ?? 0;
  if (st.phase !== "ended" && flurry > 0 && st.stacks.damageTakenThisCombat === 0) {
    for (let i = 0; i < flurry; i += 1) {
      if (st.phase === "ended") break;
      const fd = damageBetween(
        applyV2Atk(buffedAtk),
        applyV2Def(playerFacingEnemyDef(st, player)),
      );
      st = dealExtraEnemyDamage(st, fd, "무피해 난무", player, playerName);
    }
  }
  if (st.phase === "ended") return st;
  // 막다른 격노 (5티어) — RAMPAGE_START_TURN 턴 후부터 매 플레이어 턴 종료 시 ATK 영구 누적.
  // completedPlayerTurns 는 이 시점에 막 +1 된 상태 (ended state 진입 후) — 1턴 종료 시 1.
  const rampage = player.rampagePerTurn ?? 0;
  if (rampage > 0 && st.turn.completedPlayerTurns >= RAMPAGE_START_TURN) {
    const nextBonus = st.buffs.rampageAtkBonus + rampage;
    st = {
      ...st,
      buffs: { ...st.buffs, rampageAtkBonus: nextBonus },
      log: appendLog(st.log, {
        kind: "info",
        text: `[막다른 격노] ATK +${rampage} (누적 +${nextBonus})`,
      }),
    };
  }
  // 약점 분석 (5티어) — 매 플레이어 턴 종료 시 적 ATK·DEF 누적 페널티 +N, 단 raw stat 의
  // ANALYSIS_PENALTY_CAP_PCT 까지만. 캡 없는 무한 누적이 자동 사냥 부활 페널티와 결합해
  // DEX 빌드 wins 가 비선형 폭증하던 사고 차단. 캡 도달 후엔 누적 멈춤 — 로그도 갱신 시에만.
  const analysis = player.analysisPerTurn ?? 0;
  if (analysis > 0) {
    const atkCap = Math.floor(st.enemy.atk * ANALYSIS_PENALTY_CAP_PCT);
    const defCap = Math.floor(st.enemy.def * ANALYSIS_PENALTY_CAP_PCT);
    const nextAtkPen = Math.min(atkCap, st.buffs.enemyAtkPenalty + analysis);
    const nextDefPen = Math.min(defCap, st.buffs.enemyDefPenalty + analysis);
    if (
      nextAtkPen > st.buffs.enemyAtkPenalty ||
      nextDefPen > st.buffs.enemyDefPenalty
    ) {
      st = {
        ...st,
        buffs: {
          ...st.buffs,
          enemyAtkPenalty: nextAtkPen,
          enemyDefPenalty: nextDefPen,
        },
        log: appendLog(st.log, {
          kind: "info",
          text: `[약점 분석] ${st.enemy.name} ATK·DEF -${analysis} (누적 -${nextAtkPen}/-${nextDefPen})`,
        }),
      };
    }
  }
  st = applyRegenIfAny(st, player, playerName);
  st = applyEnchantRegenIfAny(st, player, playerName);
  st = applyPassiveTurnHealIfAny(st, player, playerName);
  return st;
}


// 선공 — SPD가 높은 쪽이 먼저 공격. 동점이면 플레이어 우선.
export function initialBattleState(
  player: PlayerCombat,
  enemy: Monster,
  playerName: string,
  v2Skills: import("@/adventure/data/v2/v2Skills").V2SkillsState = { learned: [], equipped: [] },
  initialEnemyHp?: number,
): BattleState {
  const playerFirst = player.spd >= enemy.spd;
  const initiator = playerFirst ? playerName : enemy.name;
  const vanguardBonus = player.vanguardFirstTurnBonus ?? 0;
  const log: BattleLogEntry[] = [
    {
      kind: "info",
      text: `${enemy.name}이(가) 나타났다!`,
    },
    {
      kind: "info",
      text: `${initiator}의 선공.`,
    },
  ];
  if (vanguardBonus > 0) {
    log.push({
      kind: "info",
      text: `[기습] 첫 턴 추가 공격 ${vanguardBonus}회!`,
    });
  }
  if (enemy.skill) {
    log.push({
      kind: "info",
      text: `${enemy.name} — 능력 [${enemy.skill.name}]`,
    });
  }
  const bulwarkStart = player.bulwarkShield ?? 0;
  // 별빛 보호막(barrier) — maxHp 의 %. 정수 floor. 철벽과 별개 라벨로 보여주되 같은 스택에 누적.
  const barrierPct = player.enchantBarrierPctMaxHp ?? 0;
  const barrierStart =
    barrierPct > 0 ? Math.floor((player.maxHp * barrierPct) / 100) : 0;
  const sigStartShield = battleStartShield(player.equipSignatures, player.maxHp);
  const trackedStartShield = trackedBattleStartShield(
    player.equipSignatures,
    player.maxHp,
  );
  const startShield =
    bulwarkStart + barrierStart + (sigStartShield?.amount ?? 0);
  if (bulwarkStart > 0) {
    log.push({ kind: "info", text: `[철벽] 보호막 ${bulwarkStart} 전개` });
  }
  if (barrierStart > 0) {
    log.push({ kind: "info", text: `[보호막] 별빛이 ${barrierStart} 둘렀다` });
  }
  if (sigStartShield) {
    log.push({
      kind: "info",
      text: `[${sigStartShield.label}] 보호막 ${sigStartShield.amount} 전개`,
    });
  }
  // 전투 시작 시 MP 시드 — character.v2.mp 가 있으면 그 값, 없으면 maxMp (옛 단판 모델 fallback).
  // PR-potion-auto-restore 이후 단판 풀충전 폐기 — mp 가 사냥 사이 보존되고 포션으로 회복.
  const playerMaxMp = Math.max(0, player.maxMp ?? 0);
  const playerMpStart = Math.min(
    playerMaxMp,
    Math.max(0, player.mp ?? playerMaxMp),
  );
  const playerMagicBarrierMax = Math.max(0, player.magicBarrierMax ?? 0);
  if (playerMagicBarrierMax > 0) {
    log.push({
      kind: "info",
      text: `[마나 실드] 내구도 ${playerMagicBarrierMax} 전개`,
    });
  }
  const berserkerLineageEquipped = v2Skills.equipped.some((skillId) =>
    skillId === "v2c_berserker_bloodslash" ||
    skillId === "v2c_warlord_bloodbath" ||
    skillId === "v2c_overlord_ruin" ||
    skillId === "v2c_hegemon_annihilation",
  );
  const tripleWardRank = aggregateEquippedPassives(v2Skills.equipped)
    .tripleWardRank;
  return {
    enemy,
    enemyHp:
      initialEnemyHp == null
        ? enemy.hp
        : Math.max(1, Math.min(enemy.hp, Math.floor(initialEnemyHp))),
    playerHp: player.hp,
    playerMaxHp: player.maxHp,
    ...((player.berserkerMadnessRank ?? 0) > 0 || berserkerLineageEquipped
      ? { berserker: initialBerserkerCombatState() }
      : {}),
    playerMp: playerMpStart,
    playerMaxMp,
    playerMagicBarrier: playerMagicBarrierMax,
    playerMagicBarrierMax,
    log,
    phase: playerFirst ? "player" : "enemy",
    outcome: null,
    playerAttacksLeft: rollPlayerAttackCount(player) + vanguardBonus,
    turn: {
      completedPlayerTurns: 0,
      enemyPhasesCompleted: 0,
      firstAttackPending: true,
      doubleStrikeUsedThisTurn: false,
      lightspeedUsedThisTurn: false,
      galeChainsThisTurn: 0,
      critThisTurn: false,
      riposteUsedThisTurn: false,
      weakpointUsedThisTurn: false,
      fatedChainTriggeredThisTurn: false,
      focusedBreathCritDmgBonusPct: 0,
      queuedExtraAttacks: 0,
      enemyAttacksLeft: 0,
    },
    flags: {
      phaseTriggered: false,
      enrageTriggered: false,
      enduranceTriggered: false,
      assassinateUsed: false,
      luckyBuffActive: false,
      fatedChainCritPending: false,
      skillCritAfterEvadePending: false,
      statusBlockUsed: false,
      ...(trackedStartShield ? { trackedShieldBreakUsed: false } : {}),
    },
    buffs: {
      enemyDefBonus: 0,
      enemyAtkBonus: 0,
      rampageAtkBonus: 0,
      enemyAtkPenalty: 0,
      enemyDefPenalty: 0,
      cyclingChiBonus: 0,
      potionHealPct: player.potionHealPct ?? 0,
      playerDmgReductionPct: 0,
      playerDmgReductionTurnsLeft: 0,
      playerAtkBuffPct: 0,
      playerAtkBuffTurnsLeft: 0,
      playerDefDebuffPct: 0,
      playerDefDebuffTurnsLeft: 0,
      playerSpdMult: 1,
      playerSpdTurnsLeft: 0,
      enemyDefDebuffPct: 0,
      enemyDefDebuffTurnsLeft: 0,
      enemySpdMult: 1,
      enemySpdTurnsLeft: 0,
      enemySilenceTurnsLeft: 0,
      enemyAttackBlockedCount: 0,
      playerLifestealPct: 0,
      playerLifestealTurnsLeft: 0,
    },
    stacks: {
      tripleWard: initialTripleWardState(tripleWardRank),
      fortressImpact: 0,
      ironWallReflectCharges: 0,
      mutationWeight: 0,
      ...(player.lawInscription
        ? { lawInscriptions: emptyLawInscriptionState() }
        : {}),
      chillStacks: 0,
      curseStacks: 0,
      playerShield: startShield,
      ...(trackedStartShield
        ? { trackedSetShield: trackedStartShield.amount }
        : {}),
      evadesRemaining: player.guaranteedEvades ?? 0,
      damageTakenThisCombat: 0,
      weakpointDefIgnoreLeft: 0,
      braceDefBonus: 0,
      comboAtkBonus: 0,
      comboHitCount: 0,
      signatureHitCount: 0,
      signatureBonusAttacksLeft: 0,
      ...(hasTier6Unique(player.equipSignatures)
        ? { tier6Uniques: initialTier6UniqueRuntime() }
        : {}),
      spellCastCount: 0,
      enemyMagicVulnStacks: 0,
      skillRegenPct: 0,
      skillRegenTurns: 0,
      skillCritPct: 0,
      skillCritTurns: 0,
      skillEvasionPct: 0,
      skillEvasionTurns: 0,
      skillDmgReducePct: 0,
      skillDmgReduceTurns: 0,
      skillReflectBoostPct: 0,
      skillReflectBoostTurns: 0,
      enemyVulnPct: 0,
      enemyVulnTurns: 0,
      enemyMagicVulnPct: 0,
      enemyMagicVulnTurns: 0,
      enemyEvasionDownPct: 0,
      enemyEvasionDownTurns: 0,
      enemyAccuracyDownPct: 0,
      enemyAccuracyDownTurns: 0,
      enemyHealReducePct: 0,
      enemyHealReduceTurns: 0,
      enemyDamageDownPct: 0,
      enemyDamageDownTurns: 0,
      enemySkillProcDownPct: 0,
      enemySkillProcDownTurns: 0,
      enemyDotVulnPct: 0,
      enemyDotVulnTurns: 0,
    },
    // 장착된 AP 스킬이 있을 때만 의미. 없으면 그냥 0 으로 두고 회복/소비 노옵.
    v2Skills,
    v2SkillCooldowns: {},
    v2SelfBuffs: {},
    v2SelfDebuffs: {},
    enemyV2SelfBuffs: {},
    enemyV2Debuffs: {},
    // PR-5b — monster.v2Skills 가 있으면 enemy v2 시드. 없으면 빈 배열로 무력화.
    // v2MaxMp 미지정 시 defaultV2MaxMpFor (equipped 의 max mpCost × 3) 로 자동 시드.
    enemyV2Skills: enemy.v2Skills ?? { learned: [], equipped: [] },
    enemyV2SkillCooldowns: {},
    enemyMp: enemy.v2MaxMp !== undefined
      ? Math.max(0, enemy.v2MaxMp)
      : defaultV2MaxMpFor(enemy.v2Skills ?? { learned: [], equipped: [] }),
    enemyMaxMp: enemy.v2MaxMp !== undefined
      ? Math.max(0, enemy.v2MaxMp)
      : defaultV2MaxMpFor(enemy.v2Skills ?? { learned: [], equipped: [] }),
    // PR-8 — DoT 시작 시 빈 배열. cast 결과로 박힘.
    playerV2Dots: [],
    enemyV2Dots: [],
  };
}


// AP 지속 효과 라운드 카운터 -1. 새 플레이어 턴 진입 시(직전 적 페이즈 종료 후)
// 호출되어 결의/광기/약점 노출/둔화/폭주 의 turnsLeft 를 1씩 깎고 0 으로 클램프.
// pct/mult 값은 그대로 두지만 turnsLeft 가 0 이면 적용 쪽에서 무시한다.
export function decrementTimedEffects(buffs: BattleBuffs): BattleBuffs {
  return decrementTimedBuffs(buffs);
}


export function applyEnemyDamage(
  state: BattleState,
  rawDamage: number,
  diagnosticSource: string | null = "extra",
): BattleState {
  const damage =
    Number.isFinite(rawDamage) && rawDamage > 0 ? Math.floor(rawDamage) : 0;
  if (damage <= 0) return state;
  if (diagnosticSource) recordCombatDamage(diagnosticSource, "enemy", state.enemyHp, damage);
  return {
    ...recordEnemyDamage(state, damage),
    enemyHp: Math.max(0, state.enemyHp - damage),
  };
}


export function recordEnemyDamage(
  state: BattleState,
  rawDamage: number,
): BattleState {
  const damage =
    Number.isFinite(rawDamage) && rawDamage > 0 ? Math.floor(rawDamage) : 0;
  if (damage <= 0 || state.enemyDamageDealtTotal == null) return state;
  return {
    ...state,
    enemyDamageDealtTotal: state.enemyDamageDealtTotal + damage,
  };
}


// 물약 효과 적용 — 순수 함수. 인벤토리 차감은 호출 측 책임.
export function applyPotionEffect(
  state: BattleState,
  potion: Potion,
  playerName: string,
  receivedHealMult?: number,
): BattleState {
  if (potion.effect.kind === "heal_hp") {
    const heal = healingAfterReceivedMultiplier(
      potionHealAmount(
        potion,
        state.playerMaxHp,
        state.buffs.potionHealPct ?? 0,
      ),
      receivedHealMult,
    );
    const newHp = Math.min(state.playerMaxHp, state.playerHp + heal);
    const actual = newHp - state.playerHp;
    recordCombatMetric("healing", "potion", "player", actual);
    return {
      ...state,
      playerHp: newHp,
      log: appendLog(state.log, {
        kind: "info",
        text: `${playerName}이(가) ${potion.name}을(를) 마셨다 — HP +${actual} (${state.playerHp} → ${newHp})`,
      }),
    };
  }
  if (potion.effect.kind === "heal_mp") {
    // PR-6 — MP 회복 포션. v2 스킬 자원 충전용. maxMp 0 (INT 없는 캐릭) 이면 회복 0 → 사실상 no-op.
    const restore = computeMpRestoreAmount(potion, state.playerMaxMp);
    const newMp = Math.min(state.playerMaxMp, state.playerMp + restore);
    const actual = newMp - state.playerMp;
    return {
      ...state,
      playerMp: newMp,
      log: appendLog(state.log, {
        kind: "info",
        text: `${playerName}이(가) ${potion.name}을(를) 마셨다 — MP +${actual} (${state.playerMp} → ${newMp})`,
      }),
    };
  }
  return state;
}
