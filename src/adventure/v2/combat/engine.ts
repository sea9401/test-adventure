import type { Monster } from "@/adventure/data/monsters";
import { statusNameForDebuffStat } from "@/adventure/data/v2/statusEffects";
import { smartDefaultPatternFromEquipped } from "@/adventure/data/v2/v2Skills";
import {
  computeMpRestoreAmount,
  type Potion,
  type PotionId,
} from "@/adventure/data/potions";
import {
  applyV2BuffsToMap,
  applyV2DotsToTarget,
  damageBetween,
  DAMAGE_FLOOR_FRACTION,
  defaultV2MaxMpFor,
  decrementTimedBuffs,
  makeBleedDot,
  makePoisonDot,
  potionHealAmount,
  applyComboFinisherToHits,
  resolveV2SkillCast,
  type V2SkillCastResult,
  type V2SkillDotApply,
  distributeBoostedHits,
  rollAttackCount,
  tickV2BuffMap,
  tickV2Dots,
  v2AtkBuffMult,
  v2DefBuffMult,
} from "./combatShared";
import {
  battleStartShield,
  healToShield,
  onSkillCastMpRefund,
  statusBlockOnce,
} from "./signatureEffects";
import { V2_COMBAT_PATTERN_ENABLED } from "./combatPattern";
import {
  CRIT_PCT_CAP,
} from "@/adventure/data/stats";
import {
  ANALYSIS_PENALTY_CAP_PCT,
  HEAVEN_DECREE_HP_PCT,
  LUCKY_STAR_DAMAGE_MULT,
  MAGIC_VULN_STACK_CAP,
  RAMPAGE_START_TURN,
  SKILL_CRIT_MULT,
  SPELL_STACK_CAP,
  attackMissPct,
} from "@/adventure/data/v2/v2CombatConstants";
import { resolvePlayerPhase } from "./engine.playerPhase";
import { resolveEnemyPhase } from "./engine.enemyPhase";
import { computeCritOverflowBonus } from "./engine.damageHelpers";
import {
  V2_CORE_LOOP_V2,
  V2_SKILL_PROC_IN_PATTERN,
} from "@/adventure/data/v2/coreLoopConfig";
import { resolveBattleAtb } from "./engine.atb";

import {
  BOSS_PCT_HP_DAMAGE_MULT,
  type BattleBuffs,
  type BattleLogEntry,
  type BattleOutcome,
  type BattleStacks,
  type BattleState,
  type PlayerAction,
  type PlayerCombat,
} from "./engineState";
export {
  BOSS_PCT_HP_DAMAGE_MULT,
  COMBO_FINISHER_PERIOD,
} from "./engineState";
export type {
  BattleBuffs,
  BattleFlags,
  BattleLogEntry,
  BattleOutcome,
  BattlePhase,
  BattleStacks,
  BattleState,
  BattleTurnState,
  EquippedAPSkill,
  PlayerAction,
  PlayerCombat,
} from "./engineState";

// 로그는 전체 보관 — 종료 후 알림에 첨부되는 battleLog 도 같은 배열을 사용한다.
// BattleScene 은 스크롤 컨테이너라 길이가 늘어도 UX 영향 없음.
//
// 자동사냥 시뮬(offlineSim)은 전투 로그를 전혀 안 읽는데, 수천 전투 × 수천 턴 동안 매
// appendLog 가 [...log] 로 점점 커지는 배열을 복사해 O(턴²) 의 순수 낭비가 쌓인다. 시뮬은
// setBattleLogCollection(false) 로 꺼서 appendLog 가 같은 배열 ref 를 그대로 반환(복사·증가
// 0)하게 한다. simulateOfflineHunt 는 완전 동기라 try/finally 로 감싸면 동시 요청과 간섭하지
// 않는다. 라이브/PvP 는 기본 on 이라 로그 동작이 byte-identical 하다.
let battleLogCollectionEnabled = true;
export function setBattleLogCollection(enabled: boolean): void {
  battleLogCollectionEnabled = enabled;
}

export function appendLog(
  log: BattleLogEntry[],
  entry: BattleLogEntry,
): BattleLogEntry[] {
  return battleLogCollectionEnabled ? [...log, entry] : log;
}

export function applyHealShieldIfAny(
  state: BattleState,
  player: PlayerCombat,
  actualHeal: number,
): BattleState {
  const sig = healToShield(player.equipSignatures, actualHeal);
  if (!sig) return state;
  return {
    ...state,
    stacks: {
      ...state.stacks,
      playerShield: state.stacks.playerShield + sig.amount,
    },
    log: appendLog(state.log, {
      kind: "info",
      text: `[${sig.label}] 보호막 +${sig.amount}`,
    }),
  };
}

// 데미지 최소 비율(DAMAGE_FLOOR_FRACTION)·평타 데미지(damageBetween)는 combatShared 로 이전
//   (패턴 "평타 바닥" 모델이 같은 공식을 써야 해서 더 하위 레이어로 내림). 여기선 재노출만.
export { DAMAGE_FLOOR_FRACTION, damageBetween };

// 방어 관통 비율 — 암살/약점 적중/DEF무시 AP 스킬이 무시하는 적 DEF 비율.
// 2026-05-23: 완전 무시(DEF 0)가 "선턴 이김"·방어 무력화의 주범이라, 0.3(30%)만 무시하도록
// 완화. 방어 투자가 70% 는 항상 유효. (정확 스킬의 비례 관통도 같은 0.3 캡 — skills.ts)
export const DEF_IGNORE_FRACTION = 0.3;

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
  // 약점 노출 (AP) — 적 DEF -pct%. 곱연산.
  const afterDebuff =
    buffs.enemyDefDebuffTurnsLeft > 0 && buffs.enemyDefDebuffPct > 0
      ? Math.round(afterEnchantPierce * (1 - buffs.enemyDefDebuffPct / 100))
      : afterEnchantPierce;
  // 부식 (독사 시그니처) — 중독된 적의 DEF -pct%. 곱연산으로 마지막에.
  const corrodePct = player.poisonedEnemyDefReductionPct ?? 0;
  return corrodePct > 0 && isEnemyPoisoned(state)
    ? Math.round(afterDebuff * (1 - corrodePct / 100))
    : afterDebuff;
}

function isEnemyBleeding(state: BattleState): boolean {
  return state.enemyV2Dots.some((d) => d.tag === "bleed" && d.stacks > 0 && d.turns > 0);
}

function isEnemyPoisoned(state: BattleState): boolean {
  return state.enemyV2Dots.some((d) => d.tag === "poison" && d.stacks > 0 && d.turns > 0);
}

function playerSkillTargetDef(state: BattleState, player: PlayerCombat): number {
  const corrodePct = player.poisonedEnemyDefReductionPct ?? 0;
  if (corrodePct <= 0 || !isEnemyPoisoned(state)) return state.enemy.def;
  return Math.max(0, Math.round(state.enemy.def * (1 - corrodePct / 100)));
}

const CORROSION_POISON_DAMAGE_SCALE = 3;

function corrosionPoisonDotMult(player: PlayerCombat): number {
  const corrodePct = player.poisonedEnemyDefReductionPct ?? 0;
  return corrodePct > 0 ? 1 + (corrodePct * CORROSION_POISON_DAMAGE_SCALE) / 100 : 1;
}

function applyCorrosionToPoisonDots(
  dots: readonly V2SkillDotApply[],
  player: PlayerCombat,
): V2SkillDotApply[] {
  const mult = corrosionPoisonDotMult(player);
  if (mult === 1) return [...dots];
  return dots.map((dot) =>
    dot.tag === "poison"
      ? {
          ...dot,
          flatPerStack: dot.flatPerStack * mult,
          atkCoefPerStack: dot.atkCoefPerStack * mult,
          pctMaxHpPerStack: dot.pctMaxHpPerStack * mult,
        }
      : dot,
  );
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
      sourceAtk: player.atk,
    }));
  }
  const poisonStacks =
    (add?.poisonStacks ?? 0) + (player.poisonOnHit ? 1 : 0);
  if (player.poisonOnHit && poisonStacks > 0) {
    const poisonMult = corrosionPoisonDotMult(player);
    dots.push(makePoisonDot({
      stacks: poisonStacks,
      pctMaxHpPerStack: player.poisonOnHit.pctMaxHpPerStack * poisonMult,
      sourceAtk: player.atk,
    }));
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
function rollEnemyAttackCount(enemy: Monster): number {
  const chance = enemy.bonusAttackChancePct ?? 0;
  if (chance <= 0) return 1;
  const guaranteed = Math.floor(chance / 100);
  const remainder = chance - guaranteed * 100;
  return 1 + guaranteed + (Math.random() * 100 < remainder ? 1 : 0);
}

// enemy 공격 1회 종료 시 호출 — 남은 공격이 있으면 phase="enemy" 유지, 0 이면 "player".
// 그림자 보법처럼 모든 공격 무효인 경우 호출자가 enemyAttacksLeft 를 0 으로 강제하고 phase: "player" 직접 set.
export function finishEnemyAttack(state: BattleState): BattleState {
  const remaining = Math.max(0, state.turn.enemyAttacksLeft - 1);
  return {
    ...state,
    turn: { ...state.turn, enemyAttacksLeft: remaining },
    phase: remaining > 0 ? "enemy" : "player",
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
  const enemyHp = Math.max(0, state.enemyHp - dmg);
  let next: BattleState = {
    ...state,
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
    Math.random() * 100 >= pct
  ) {
    return state;
  }

  const v2AtkMult = v2AtkBuffMult(state.v2SelfBuffs, state.v2SelfDebuffs);
  const v2DefMult = v2DefBuffMult(state.enemyV2SelfBuffs, state.enemyV2Debuffs);
  const counterDef = playerFacingEnemyDef(state, player);
  const dmg = damageBetween(
    v2AtkMult !== 1 ? Math.floor(player.atk * v2AtkMult) : player.atk,
    v2DefMult !== 1 ? Math.floor(counterDef * v2DefMult) : counterDef,
  );
  const enemyHp = Math.max(0, state.enemyHp - dmg);
  let next: BattleState = {
    ...state,
    enemyHp,
    log: appendLog(state.log, {
      kind: "player_attack",
      text: `[반격] ${state.enemy.name}에게 ${dmg} 반격 피해.`,
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

// 재생 — 플레이어 턴 종료 후 (completedPlayerTurns 증가 후) 호출.
// completedPlayerTurns 가 interval 의 배수일 때 HP +amount.
function applyRegenIfAny(
  state: BattleState,
  player: PlayerCombat,
  playerName: string,
): BattleState {
  const regen = player.regen;
  if (!regen || regen.interval <= 0 || regen.amount <= 0) return state;
  if (state.turn.completedPlayerTurns === 0) return state;
  if (state.turn.completedPlayerTurns % regen.interval !== 0) return state;
  if (state.playerHp >= state.playerMaxHp) return state;
  const newHp = Math.min(state.playerMaxHp, state.playerHp + regen.amount);
  const actual = newHp - state.playerHp;
  return applyHealShieldIfAny({
    ...state,
    playerHp: newHp,
    log: appendLog(state.log, {
      kind: "info",
      text: `[재생] ${playerName}의 HP +${actual}`,
    }),
  }, player, actual);
}

// 별빛 재생(regen) — 매 플레이어 턴 종료 시 maxHp 의 %만큼 회복.
// interval 없이 매 턴 발동. 이미 풀 HP 면 노옵. 회복량은 정수 floor.
function applyEnchantRegenIfAny(
  state: BattleState,
  player: PlayerCombat,
  playerName: string,
): BattleState {
  const pct = player.enchantRegenPctPerTurn ?? 0;
  if (pct <= 0) return state;
  if (state.turn.completedPlayerTurns === 0) return state;
  if (state.playerHp >= state.playerMaxHp) return state;
  const heal = Math.floor((state.playerMaxHp * pct) / 100);
  if (heal <= 0) return state;
  const newHp = Math.min(state.playerMaxHp, state.playerHp + heal);
  const actual = newHp - state.playerHp;
  return applyHealShieldIfAny({
    ...state,
    playerHp: newHp,
    log: appendLog(state.log, {
      kind: "info",
      text: `[재생] ${playerName}의 HP +${actual}`,
    }),
  }, player, actual);
}

// 매 플레이어 턴 종료 시 자가 회복 — 직업 패시브 가호(HP %) + 워메이지 마력 순환(MP flat).
function applyPassiveTurnHealIfAny(
  state: BattleState,
  player: PlayerCombat,
  playerName: string,
): BattleState {
  // 워메이지 마력 순환 — MP 회복(flat). HP 회복과 독립이라 HP 가 가득이어도 돈다.
  // MP 가 자원화된 v2 에서 시전 페이스를 받쳐 주는 시그니처.
  let s = state;
  const mpRegen = player.mpRegenPerTurn ?? 0;
  if (
    mpRegen > 0 &&
    s.turn.completedPlayerTurns > 0 &&
    s.playerMp < s.playerMaxMp
  ) {
    const newMp = Math.min(s.playerMaxMp, s.playerMp + mpRegen);
    const actualMp = newMp - s.playerMp;
    if (actualMp > 0) {
      s = {
        ...s,
        playerMp: newMp,
        log: appendLog(s.log, {
          kind: "info",
          text: `[마력 순환] ${playerName}의 MP +${actualMp}`,
        }),
      };
    }
  }

  const pct = player.passiveTurnHealPctMaxHp ?? 0;
  if (pct <= 0) return s;
  if (s.turn.completedPlayerTurns === 0) return s;
  if (s.playerHp >= s.playerMaxHp) return s;
  const heal = Math.floor((s.playerMaxHp * pct) / 100);
  if (heal <= 0) return s;
  const newHp = Math.min(s.playerMaxHp, s.playerHp + heal);
  const actual = newHp - s.playerHp;
  return applyHealShieldIfAny({
    ...s,
    playerHp: newHp,
    log: appendLog(s.log, {
      kind: "info",
      text: `[가호] ${playerName}의 HP +${actual}`,
    }),
  }, player, actual);
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
function dealExtraEnemyDamage(
  state: BattleState,
  baseDmg: number,
  label: string,
  player: PlayerCombat,
  playerName: string,
): BattleState {
  // 행운의 별 — 모든 공격 ×배수.
  const luckyStarPct = player.luckyStarChancePct ?? 0;
  const luckyStarFires =
    luckyStarPct > 0 && Math.random() * 100 < luckyStarPct;
  const dmgAfterLuckyStar = luckyStarFires
    ? Math.floor(baseDmg * LUCKY_STAR_DAMAGE_MULT)
    : baseDmg;
  // 천명 — 적 현재 HP % (보스에는 BOSS_PCT_HP_DAMAGE_MULT 감산).
  const decreeFires =
    (player.heavenDecreeChancePct ?? 0) > 0 &&
    Math.random() * 100 < player.heavenDecreeChancePct!;
  const decreeBaseDmg = decreeFires
    ? Math.floor((state.enemyHp * HEAVEN_DECREE_HP_PCT) / 100)
    : 0;
  const decreeDmg = state.isBoss
    ? Math.floor(decreeBaseDmg * BOSS_PCT_HP_DAMAGE_MULT)
    : decreeBaseDmg;
  const totalDmg = dmgAfterLuckyStar + decreeDmg;
  const enemyHp = Math.max(0, state.enemyHp - totalDmg);
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
  const totalHeal = luckyLifestealHeal + runeLifestealHeal + apLifestealHeal;
  const newPlayerHp =
    totalHeal > 0
      ? Math.min(state.playerMaxHp, state.playerHp + totalHeal)
      : state.playerHp;
  const actualHeal = newPlayerHp - state.playerHp;
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
    log = appendLog(log, {
      kind: "info",
      text: `[${healLabels.join(" + ")}] ${playerName}의 HP +${actualHeal}`,
    });
  }

  let healedState = {
    ...state,
    enemyHp,
    playerHp: newPlayerHp,
    log,
  };
  healedState = applyHealShieldIfAny(healedState, player, actualHeal);
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
function applySkillTempBuffs(
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
    enemyEvasionDownPct: result.enemyEvasionDownToApply?.pct ?? prev.enemyEvasionDownPct,
    enemyEvasionDownTurns: result.enemyEvasionDownToApply ? result.enemyEvasionDownToApply.turns : prev.enemyEvasionDownTurns,
    enemyAccuracyDownPct: result.enemyAccuracyDownToApply?.pct ?? prev.enemyAccuracyDownPct,
    enemyAccuracyDownTurns: result.enemyAccuracyDownToApply ? result.enemyAccuracyDownToApply.turns : prev.enemyAccuracyDownTurns,
    enemyHealReducePct: result.enemyHealReduceToApply?.pct ?? prev.enemyHealReducePct,
    enemyHealReduceTurns: result.enemyHealReduceToApply ? result.enemyHealReduceToApply.turns : prev.enemyHealReduceTurns,
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
      const heal = Math.floor((st.playerMaxHp * s.skillRegenPct) / 100);
      const before = st.playerHp;
      const nextHp = Math.min(st.playerMaxHp, before + heal);
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
        st = applyHealShieldIfAny(st, player, nextHp - before);
      }
    }
    st = {
      ...st,
      stacks: {
        ...st.stacks,
        skillRegenTurns: Math.max(0, s.skillRegenTurns - 1),
        skillCritTurns: Math.max(0, s.skillCritTurns - 1),
        skillEvasionTurns: Math.max(0, s.skillEvasionTurns - 1),
        skillDmgReduceTurns: Math.max(0, s.skillDmgReduceTurns - 1),
        skillReflectBoostTurns: Math.max(0, s.skillReflectBoostTurns - 1),
        enemyVulnTurns: Math.max(0, s.enemyVulnTurns - 1),
        enemyEvasionDownTurns: Math.max(0, s.enemyEvasionDownTurns - 1),
        enemyAccuracyDownTurns: Math.max(0, s.enemyAccuracyDownTurns - 1),
        enemyHealReduceTurns: Math.max(0, s.enemyHealReduceTurns - 1),
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
  return {
    enemy,
    enemyHp:
      initialEnemyHp == null
        ? enemy.hp
        : Math.max(1, Math.min(enemy.hp, Math.floor(initialEnemyHp))),
    playerHp: player.hp,
    playerMaxHp: player.maxHp,
    playerMp: playerMpStart,
    playerMaxMp,
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
      statusBlockUsed: false,
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
      chillStacks: 0,
      curseStacks: 0,
      playerShield: startShield,
      evadesRemaining: player.guaranteedEvades ?? 0,
      damageTakenThisCombat: 0,
      weakpointDefIgnoreLeft: 0,
      braceDefBonus: 0,
      comboAtkBonus: 0,
      comboHitCount: 0,
      signatureHitCount: 0,
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
      enemyEvasionDownPct: 0,
      enemyEvasionDownTurns: 0,
      enemyAccuracyDownPct: 0,
      enemyAccuracyDownTurns: 0,
      enemyHealReducePct: 0,
      enemyHealReduceTurns: 0,
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
function decrementTimedEffects(buffs: BattleBuffs): BattleBuffs {
  return decrementTimedBuffs(buffs);
}

// 한 턴 진행 — 현재 phase 측이 행동하고 결과를 다음 BattleState로 반환.
// player phase는 action(공격 또는 물약)으로 분기. attack이면 attackCount 만큼 연속 공격.
// phase === "ended" 이면 그대로 반환.
export function advanceTurn(
  state: BattleState,
  player: PlayerCombat,
  playerName: string,
  action: PlayerAction = { kind: "attack" },
  // 몹이 이 enemy 페이즈에 스킬을 시전했으면 평타 생략(스킬이 평타 대체). 적 분기에서만 의미.
  skipEnemyBasicAttack: boolean = false,
): BattleState {
  if (state.phase === "ended") return state;

  // 새 enemy phase 진입 시 다대시 횟수 초기화 — 첫 공격 진입 시점에만 굴림.
  // 다대시 중간(enemyAttacksLeft>0)에는 통과. 이 한 곳에서 잡으면 player→enemy 전환 지점들에서
  // 별도 초기화 코드 안 둬도 됨.
  const enteringEnemyPhase =
    state.phase === "enemy" && state.turn.enemyAttacksLeft <= 0;
  if (enteringEnemyPhase) {
    state = {
      ...state,
      turn: {
        ...state.turn,
        enemyAttacksLeft: rollEnemyAttackCount(state.enemy),
      },
    };
    const enemyDotTick = tickV2Dots(state.enemyV2Dots, state.enemy.hp);
    if (enemyDotTick.totalDmg > 0) {
      const newHp = Math.max(0, state.enemyHp - enemyDotTick.totalDmg);
      state = applyPhaseTriggerIfAny({
        ...state,
        enemyHp: newHp,
        enemyV2Dots: enemyDotTick.nextDots,
        log: appendLog(state.log, {
          kind: "player_attack",
          text: `[${state.enemyV2Dots
            .filter((d) => d.turns > 0)
            .map((d) => d.label)
            .join(" + ")}] ${enemyDotTick.totalDmg} 피해를 입혔다.`,
        }),
      });
      if (state.enemyHp <= 0) {
        return {
          ...state,
          log: appendLog(state.log, {
            kind: "info",
            text: `${state.enemy.name}을(를) 쓰러뜨렸다!`,
          }),
          phase: "ended",
          outcome: "win",
        };
      }
    } else {
      state = { ...state, enemyV2Dots: enemyDotTick.nextDots };
    }
  }

  // 새 플레이어 턴 진입 시 지속 효과 turnsLeft -1 (직전 enemy 페이즈 완료 후).
  // turn 1 (completedPlayerTurns=0) 은 가드 — 발동도 안 된 상태에서 깎을 게 없음.
  // 빛의 활공 큐도 같이 소비 — queuedExtraAttacks 를 playerAttacksLeft 에 가산하고 0 으로 리셋.
  if (
    state.phase === "player" &&
    state.turn.firstAttackPending &&
    state.turn.completedPlayerTurns > 0
  ) {
    const consumeQueued = state.turn.queuedExtraAttacks;
    state = {
      ...state,
      buffs: decrementTimedEffects(state.buffs),
      playerAttacksLeft: state.playerAttacksLeft + consumeQueued,
      turn: { ...state.turn, queuedExtraAttacks: 0 },
    };
  }

  if (state.phase === "player") {
    return resolvePlayerPhase(state, player, playerName, action);
  }

  return resolveEnemyPhase(
    state,
    player,
    playerName,
    enteringEnemyPhase,
    skipEnemyBasicAttack,
  );
}

// 한 전투를 시작부터 끝까지 한 번에 시뮬한다. 결과(최종 상태 + 로그 + 턴 수 + 소비된 포션)만
// 반환하므로 실시간 UI/오프라인 시뮬 양쪽에서 동일하게 사용 가능.
//
// `pickAction`은 player phase에서 호출. 포션 사용 결정 시 호출 측에서 보유량 체크 X —
// 함수 내부에서 잔량을 추적하고 부족하면 attack으로 폴백한다.
export type ResolveContext = {
  pickAction: (state: BattleState) => PlayerAction;
  potions: Partial<Record<PotionId, number>>;
  // 보스 전투면 BOSS_TURN_CAP 턴 경과 시 패배로 타임아웃. 일반 전투에는 영향 없음.
  isBoss?: boolean;
  // 전투 시작 로그에 박을 안내 한 줄(전술 등). 호출부가 문자열로 빌드해 넘긴다
  // (엔진은 stance 를 모름 — 순환 의존 회피). 미지정이면 추가 안 함.
  openingNote?: string;
  // v2 스킬 상태 (PR-4a) — saves_kv "skills.v2" 의 learned/equipped. 미지정/빈 배열이면
  // v2 스킬 cast no-op. 라우트가 saves_kv 에서 읽어 넘긴다.
  v2Skills?: import("@/adventure/data/v2/v2Skills").V2SkillsState;
  // 무한 루프 가드 턴 상한(플레이어 턴 기준). 미지정이면 500(기본 안전캡). 스파링처럼
  // "안 죽는 샌드백을 N턴만 두들기는" 용도면 낮춰 넘긴다(예: 50) — 도달 시 lose 로 종료.
  maxTurns?: number;
  // 던전 깊이 — ATB(코어루프) 전용. 몬스터 SPD 깊이 보정(depthSpdCorrection)에 쓴다. 미지정/
  // 비-던전 전투(토벌·협동보스 등)면 보정 0. 레거시 엔진은 무시(flag-off byte-identical).
  depth?: number;
  // 공유 HP 보스처럼 최대 HP(enemy.hp)와 전투 시작 현재 HP가 다른 경우 사용.
  // 미지정이면 enemy.hp에서 시작한다.
  initialEnemyHp?: number;
};

// 보스 전투 타임아웃 — 플레이어 턴 기준. 정상 빌드는 10~30턴 안에 끝나므로
// 50턴 도달은 데미지 부족 / 무한 회피 스톨로 간주, 패배 처리.
export const BOSS_TURN_CAP = 50;
export const NORMAL_MONSTER_EXECUTION_HP_FRACTION = 0.35;
export const NORMAL_MONSTER_EXECUTION_HP_PCT = 35;

export type BattleResolution = {
  outcome: BattleOutcome;
  finalState: BattleState;
  potionsConsumed: Partial<Record<PotionId, number>>;
  turns: number;
};

// v2 적(몬스터) 스킬 시전 — applyPlayerV2SkillCast 의 적 대칭판(ATB 라이브 경로용).
//   ⚠️ ATB 전용: 버프/디버프 tick 은 tickEnemyBundleEntry/tickPlayerBundleEntry(번들)가 이미 했으므로
//   여기선 tick 없이 cast 결정 + 효과 적용만 한다(player cast 헬퍼와 동일 소유권 모델 — 이중 tick 방지).
//   레거시 advanceTurn 의 인라인 적 cast 는 자체 tick 을 가지므로 별개(그쪽은 미수정 — 골든 byte-identical).
//   🔑 v2Skills 미장착 몹은 즉시 no-op → 기존 전투 전부 byte-identical(골든 불변). MP·쿨다운(소모) +
//   데미지/힐/HP비용/자버프/적디버프/도트 + lethal 까지. "시전=평타 XOR"(skipBasic)은 호출부가 처리.
export function applyEnemyV2SkillCast(
  state: BattleState,
  player: PlayerCombat,
): { state: BattleState; castFired: boolean } {
  if (state.enemyV2Skills.equipped.length === 0) {
    return { state, castFired: false };
  }
  const result = resolveV2SkillCast({
    skills: state.enemyV2Skills,
    cooldowns: state.enemyV2SkillCooldowns,
    procRoll: Math.random() * 100,
    attacker: {
      mp: state.enemyMp,
      atk: state.enemy.atk,
      maxHp: state.enemy.hp,
      def: state.enemy.def,
      currentHp: state.enemyHp,
      maxMp: state.enemyMaxMp,
      selfBuffs: state.enemyV2SelfBuffs,
      selfDebuffs: state.enemyV2Debuffs,
      // 몬스터 평타·스킬 모두 자기 속성(atk 에 baked) — 보정 1(이중계산 방지).
      attackElement: state.enemy.element,
      characterElement: state.enemy.element,
    },
    target: {
      def: player.def,
      magicDef: player.magicDef,
      selfBuffs: state.v2SelfBuffs,
      selfDebuffs: state.v2SelfDebuffs,
      element: player.characterElement,
      currentHp: state.playerHp,
      maxHp: state.playerMaxHp,
      bleedStacks: state.playerV2Dots
        .filter((d) => d.tag === "bleed")
        .reduce((s, d) => s + d.stacks, 0),
      poisonStacks: state.playerV2Dots
        .filter((d) => d.tag === "poison")
        .reduce((s, d) => s + d.stacks, 0),
    },
  });
  // 미발동 — 쿨다운 tick(resolveV2SkillCast 내부) + MP(불변)만 반영, 평타로 폴백.
  if (!result.castSkillId) {
    return {
      state: {
        ...state,
        enemyMp: result.nextMp,
        enemyV2SkillCooldowns: result.nextCooldowns,
      },
      castFired: false,
    };
  }
  let nextPlayerHp = state.playerHp;
  let nextEnemyHp = state.enemyHp;
  let nextLog = state.log;
  if (result.enemyDamage > 0 && result.castSkillName) {
    nextPlayerHp = Math.max(0, nextPlayerHp - result.enemyDamage);
    nextLog = appendLog(nextLog, {
      kind: "enemy_attack",
      text: `${result.castSkillName}! ${result.enemyDamage} 피해를 입혔다.`,
    });
  }
  if (result.selfHeal > 0 && result.castSkillName) {
    const healReduce =
      state.stacks.enemyHealReduceTurns > 0 ? state.stacks.enemyHealReducePct : 0;
    const effHeal =
      healReduce > 0
        ? Math.floor(result.selfHeal * (1 - healReduce / 100))
        : result.selfHeal;
    const before = nextEnemyHp;
    nextEnemyHp = Math.min(state.enemy.hp, nextEnemyHp + effHeal);
    const actual = nextEnemyHp - before;
    if (actual > 0) {
      nextLog = appendLog(nextLog, {
        kind: "enemy_attack",
        text: `${result.castSkillName}! ${state.enemy.name} HP ${actual} 회복했다.`,
      });
    }
  }
  if (result.selfHpCost > 0) {
    nextEnemyHp = Math.max(1, nextEnemyHp - result.selfHpCost);
  }
  const nextEnemySelfBuffs = applyV2BuffsToMap(
    state.enemyV2SelfBuffs,
    result.selfBuffsToApply,
  );
  const nextPlayerDebuffs = applyV2BuffsToMap(
    state.v2SelfDebuffs,
    result.enemyDebuffsToApply,
  );
  const sigStatusBlock = statusBlockOnce(player.equipSignatures);
  const statusBlockDots =
    result.dotsToApplyToTarget.length > 0 &&
    !!sigStatusBlock &&
    !state.flags.statusBlockUsed;
  const nextPlayerDots = statusBlockDots
    ? state.playerV2Dots
    : applyV2DotsToTarget(state.playerV2Dots, result.dotsToApplyToTarget);
  for (const b of result.selfBuffsToApply) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${result.castSkillName ?? "강화"}] ${b.stat.toUpperCase()} +${b.pct}% (${b.turns}턴)`,
      turn: "enemy",
    });
  }
  for (const d of result.enemyDebuffsToApply) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${[result.castSkillName, statusNameForDebuffStat(d.stat)].filter(Boolean).join(" + ") || "약화"}] ${d.stat.toUpperCase()} -${d.pct}% (${d.turns}턴)`,
      turn: "enemy",
    });
  }
  if (statusBlockDots && sigStatusBlock) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${sigStatusBlock.label}] 상태이상을 막았다.`,
      turn: "enemy",
    });
  }
  for (const dot of statusBlockDots ? [] : result.dotsToApplyToTarget) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${[result.castSkillName, dot.label].filter(Boolean).join(" + ")}] +${dot.stacks}스택 (${dot.turns}회)`,
      turn: "enemy",
    });
  }
  const countered =
    result.enemyDamage > 0 && result.castSkillName
      ? applyPassiveCounterOnHitIfAny(
          {
            ...state,
            playerHp: nextPlayerHp,
            enemyHp: nextEnemyHp,
            log: nextLog,
          },
          player,
        )
      : null;
  if (countered) {
    nextPlayerHp = countered.playerHp;
    nextEnemyHp = countered.enemyHp;
    nextLog = countered.log;
  }
  let nextState: BattleState = {
    ...state,
    playerHp: nextPlayerHp,
    enemyHp: nextEnemyHp,
    enemyMp: result.nextMp,
    enemyV2SkillCooldowns: result.nextCooldowns,
    enemyV2SelfBuffs: nextEnemySelfBuffs,
    v2SelfDebuffs: nextPlayerDebuffs,
    playerV2Dots: nextPlayerDots,
    flags: {
      ...state.flags,
      statusBlockUsed: state.flags.statusBlockUsed || statusBlockDots,
    },
    log: nextLog,
  };
  if (countered?.phase === "ended") {
    nextState = {
      ...nextState,
      phase: "ended",
      outcome: countered.outcome,
    };
  } else if (nextState.playerHp <= 0) {
    nextState = {
      ...nextState,
      log: appendLog(nextState.log, {
        kind: "info",
        text: `플레이어가 쓰러졌다.`,
        turn: "enemy",
      }),
      outcome: "lose",
      phase: "ended",
    };
  }
  return { state: nextState, castFired: true };
}

// v2 플레이어 스킬 시전 + 효과 적용 — resolveBattleLegacy 에서 추출(ATB 경로 공유용).
// buff/debuff tick 은 호출부 책임(legacy=인라인 tick, ATB=tickPlayerBundleEntry). lethal 체크와
// "시전=완료 턴"(평타 XOR) 처리도 호출부가 루프 모델에 맞게 한다. 이 함수는 cast 결정 + 데미지/힐/
// 마나/HP비용/버프/디버프/도트/취약·실명·암흑 + state 업데이트(로그 포함)까지만 한다(byte-identical).
export function applyPlayerV2SkillCast(
  state: BattleState,
  player: PlayerCombat,
  ticked: {
    selfBuffs: import("./combatShared").V2BuffMap;
    selfDebuffs: import("./combatShared").V2BuffMap;
    enemyDebuffs: import("./combatShared").V2BuffMap;
  },
): {
  state: BattleState;
  castFired: boolean;
  // 바람/대지 ATB 템포(원소술사) — 비-ATB(legacy) 호출부는 무시. ATB 루프가 틱 계산에 반영.
  selfHastePct: number;
  enemyDelayPct: number;
} {
  const tickedSelfBuffs = ticked.selfBuffs;
  const tickedSelfDebuffs = ticked.selfDebuffs;
  const tickedEnemyDebuffs = ticked.enemyDebuffs;
  let result = resolveV2SkillCast({
    skills: state.v2Skills,
    cooldowns: state.v2SkillCooldowns,
    procRoll: Math.random() * 100,
    procChanceBonus: player.skillProcChanceAdd ?? 0,
    // 패턴 경로에서도 procChance 굴림(부활) — 플래그 on 이면 패턴이 고른 스킬도 확률 게이트 통과 필요.
    applyProcInPattern: V2_SKILL_PROC_IN_PATTERN,
    // 전투 패턴(갬빗) — 플래그 on 일 때만 주입(플레이어 cast). off 면 옛 슬롯순서+proc.
    // 저장된 커스텀 패턴(C2) 우선, 없으면 장착 스킬 종류별 스마트 기본 패턴(유틸 스팸 방지).
    turn: state.turn.completedPlayerTurns + 1,
    combatPattern: V2_COMBAT_PATTERN_ENABLED
      ? (state.v2Skills.pattern ??
        smartDefaultPatternFromEquipped(state.v2Skills.equipped))
      : undefined,
    attacker: {
      mp: state.playerMp,
      atk: player.atk,
      attackCount: player.attackCount,
      magicAtk: player.magicAtk ?? player.atk,
      minDamage: player.minDamage,
      healMult: player.healMult,
      maxHp: state.playerMaxHp,
      // PR2-B — def/vit 비례 딜·현재HP(사혈격/기공순환)·maxMp(보호막/명상)·차수 flat.
      def: player.def,
      vit: player.vitStat,
      dex: player.dexStat,
      luk: player.lukStat,
      allStatTotal: player.allStatTotal,
      currentHp: state.playerHp,
      maxMp: state.playerMaxMp,
      classTier: player.classTier,
      // 활성 파생버프(회피/치명/받피감) — self_buff_pct 조건 평가용(만료 시 재시전 선풍각·철포).
      selfBuffPctActive: {
        evasion: state.stacks.skillEvasionTurns > 0,
        crit: state.stacks.skillCritTurns > 0,
        damageReduction: state.stacks.skillDmgReduceTurns > 0,
        reflectDamage: state.stacks.skillReflectBoostTurns > 0,
      },
      selfBuffs: tickedSelfBuffs,
      selfDebuffs: tickedSelfDebuffs,
      // PR-5b — 플레이어 평타 속성(baked) + 캐릭 속성(스킬 기본).
      attackElement: player.attackElement,
      characterElement: player.characterElement,
    },
    target: {
      def: playerSkillTargetDef(state, player),
      // PR-5b: monster 측 v2 self buff 도 def 곱셈에 반영 (격리 해제 일관).
      selfBuffs: state.enemyV2SelfBuffs,
      selfDebuffs: tickedEnemyDebuffs,
      // PR-5b — 피격 몬스터 속성(상성).
      element: state.enemy.element,
      // PR2-B — 처단(처형 임계)·스택 payoff(참절/중독폭발/비전작렬).
      currentHp: state.enemyHp,
      maxHp: state.enemy.hp,
      executeHpThresholdFloorPct:
        state.isBoss === true ? 0 : NORMAL_MONSTER_EXECUTION_HP_PCT,
      bleedStacks: state.enemyV2Dots.filter((d) => d.tag === "bleed").reduce((s, d) => s + d.stacks, 0),
      poisonStacks: state.enemyV2Dots.filter((d) => d.tag === "poison").reduce((s, d) => s + d.stacks, 0),
      magicVulnStacks: state.stacks.enemyMagicVulnStacks,
    },
  });
  // 스킬도 명중 영향(2026-06-06) — 데미지 스킬은 발동 후 미스 판정(평타와 같은 공식). 미스면 적
  //   효과(데미지·DoT·디버프)만 무효, MP·쿨다운은 발동 시점에 소모됨·자버프/자힐은 유지. 데미지>0
  //   일 때만 롤(스킬 안 터졌거나 자버프 스킬엔 롤 안 함 → RNG 드리프트 방지).
  let skillMissed = false;
  if (result.castSkillId && result.enemyDamage > 0) {
    // 회피 대결형 Slice 2(B안) — 평타와 같은 공식. 몹 회피레이팅(정밀 반영) vs 플레이어 명중레이팅.
    const sEnemyEvaR =
      Math.max(0, state.enemy.evasionPct ?? 0) * (player.precisionEvasionMult ?? 1);
    const sMissPct = attackMissPct(sEnemyEvaR, player.accRating ?? player.accuracyPct ?? 0);
    if (Math.random() * 100 < sMissPct) {
      skillMissed = true;
      result = {
        ...result,
        enemyDamage: 0,
        dotsToApplyToTarget: [],
        enemyDebuffsToApply: [],
      };
    }
  }
  // 주문 중첩(워메이지)·약점 노출(마도사) — 스킬 데미지 배수(현재 누적 스택 기준, 적용은 이번 시전부터).
  //   주문중첩: 누적 시전 횟수 × skillDmgPctPerCast.  약점노출: 적 마법취약 스택 × enemyMagicVulnPctPerStack.
  // 둘 다 미보유면 스택 0 → 배수 1 → 무변. 적중 후 아래에서 스택 증가.
  const spellStackMult =
    1 +
    (state.stacks.spellCastCount * (player.skillDmgPctPerCast ?? 0)) / 100;
  const magicVulnMult =
    1 +
    (state.stacks.enemyMagicVulnStacks *
      (player.enemyMagicVulnPctPerStack ?? 0)) /
      100;
  // PR2-B-2c 속박 — 적 취약(받는 피해 +%) 가산.
  const vulnMult =
    state.stacks.enemyVulnTurns > 0
      ? 1 + state.stacks.enemyVulnPct / 100
      : 1;
  // 스킬 치명타 — 평타와 같은 크리 확률(min(critChancePct, 75%)) 공유, 배수만 SKILL_CRIT_MULT 로
  //   분리(평타 critMult 비연동 → 비폭주). 오버플로(캡 초과분 크리뎀)는 평타 전용, 스킬은 flat.
  //   데미지>0 일 때만 롤(자버프·무피해 스킬엔 롤 안 함 → 기존 RNG 스트림 보존).
  const skillCritFired =
    result.enemyDamage > 0 &&
    (player.critChancePct ?? 0) > 0 &&
    Math.random() * 100 < Math.min(CRIT_PCT_CAP, player.critChancePct ?? 0);
  // 스킬 다단히트 — 이 턴 추가 공격 확률로 굴려둔 공격 횟수(playerAttacksLeft)만큼 데미지
  //   스킬을 반복 타격한다. 평타 빌드가 누리는 SPD(추가 공격) 가치를 스킬 빌드에도 부여.
  //   데미지 스킬에만 적용(버프/힐/마나/DoT 부여는 1회 — 다중 적용 X). 새 RNG 미소비(이미
  //   굴린 값 재사용) → 추가 공격 0(평타 1타) 빌드는 skillHitCount=1 로 기존과 byte-동일.
  const skillHitCount =
    result.castSkillId && result.enemyDamage > 0
      ? Math.max(1, state.playerAttacksLeft)
      : 1;
  const singleSkillDamage = Math.floor(
    result.enemyDamage *
      spellStackMult *
      magicVulnMult *
      vulnMult *
      // 밤그림자(skillCritOverflow) — 스킬 크리에도 크리 오버플로(75% 초과분 크리뎀) 가산. 전역=flat.
      (skillCritFired
        ? player.skillCritOverflow
          ? SKILL_CRIT_MULT + computeCritOverflowBonus(player.critChancePct ?? 0)
          : SKILL_CRIT_MULT
        : 1),
  );
  let nextComboHitCount = state.stacks.comboHitCount;
  // 시전이 발동(castSkillId)했으면 누적 증가. 주문중첩=매 시전, 약점노출=적중(데미지>0) 시. 상한 클램프.
  const nextSpellCastCount =
    (player.skillDmgPctPerCast ?? 0) > 0 && result.castSkillId
      ? Math.min(SPELL_STACK_CAP, state.stacks.spellCastCount + 1)
      : state.stacks.spellCastCount;
  const nextMagicVulnStacks =
    (player.enemyMagicVulnPctPerStack ?? 0) > 0 &&
    result.castSkillId &&
    result.enemyDamage > 0
      ? Math.min(
          MAGIC_VULN_STACK_CAP,
          state.stacks.enemyMagicVulnStacks + 1,
        )
      : state.stacks.enemyMagicVulnStacks;
  // 절제(워메이지 특성) — 스킬 마나 소모 -%. resolveV2SkillCast 가 이미 풀 코스트를 깐
  // result.nextMp 에, 소모분(costPaid)의 pct% 를 환급. 미시전이면 costPaid 0 → 무변.
  const mpCostReduction = player.mpCostReductionPct ?? 0;
  const costPaid = state.playerMp - result.nextMp;
  const mpRefund =
    mpCostReduction > 0 && costPaid > 0
      ? Math.floor((costPaid * mpCostReduction) / 100)
      : 0;
  const sigMpRefund = onSkillCastMpRefund(player.equipSignatures);
  const sigMpRefundAmount =
    sigMpRefund && costPaid > 0
      ? Math.floor((costPaid * sigMpRefund.pct) / 100)
      : 0;
  const adjustedNextMp = Math.min(
    state.playerMaxMp,
    result.nextMp + mpRefund + sigMpRefundAmount,
  );
  // 3) state 업데이트 — MP, cooldown, buff/debuff map, HP delta, log.
  let nextEnemyHp = state.enemyHp;
  let nextPlayerHp = state.playerHp;
  let nextLog = state.log;
  let healShieldAmount = 0;
  // 시전 별도 로그 폐기 — damage/heal 로그에 prefix 로 스킬명 포함.
  // damage 효과: 일반 공격과 같은 player_attack kind. 스킬명을 평타 "공격!" 자리의 액션
  //   라벨로 표기("강타! N 피해를 입혔다."). 브라켓 태그 대신 발동 스킬을 앞세운다.
  if (result.enemyDamage > 0 && result.castSkillName) {
    // 다단 스킬은 타마다 한 줄. 부스트는 타당 raw 비율로 분배(합 = 1회분 singleSkillDamage).
    // 다단히트(추가 공격)면 1회분 타격 묶음을 skillHitCount 번 반복해 보여준다.
    const singleHits =
      result.hitDamages.length > 1
        ? distributeBoostedHits(result.hitDamages, singleSkillDamage)
        : [singleSkillDamage];
    const repeatedHits: number[] = [];
    for (let h = 0; h < skillHitCount; h++) repeatedHits.push(...singleHits);
    const comboResult = applyComboFinisherToHits(
      repeatedHits,
      state.stacks.comboHitCount,
      player.comboFinisherBonusPct,
    );
    const perHit = comboResult.hitDamages;
    nextComboHitCount = comboResult.nextComboHitCount;
    const boostedSkillDamage = perHit.reduce((sum, hit) => sum + hit, 0);
    nextEnemyHp = Math.max(0, nextEnemyHp - boostedSkillDamage);
    for (const hit of perHit) {
      if (hit <= 0) continue; // 분배 반올림으로 0 이 된 타는 줄 생략(합은 이미 차감됨).
      nextLog = appendLog(nextLog, {
        kind: "player_attack",
        text: `${result.castSkillName}!${skillCritFired ? " [크리티컬]" : ""} ${hit} 피해를 입혔다.`,
      });
    }
  } else if (skillMissed && result.castSkillName) {
    nextLog = appendLog(nextLog, {
      kind: "player_attack",
      text: `${result.castSkillName}! 빗나갔다.`,
    });
  }
  // heal 효과: damage 없는 회복형 스킬 (회복/강화회복) — player_attack kind 로 통일.
  if (result.selfHeal > 0 && result.castSkillName) {
    const before = nextPlayerHp;
    nextPlayerHp = Math.min(state.playerMaxHp, nextPlayerHp + result.selfHeal);
    const actual = nextPlayerHp - before;
    if (actual > 0) {
      nextLog = appendLog(nextLog, {
        kind: "player_attack",
        text: `${result.castSkillName}! HP ${actual} 회복했다.`,
      });
      const sigHealShield = healToShield(player.equipSignatures, actual);
      if (sigHealShield) {
        healShieldAmount += sigHealShield.amount;
        nextLog = appendLog(nextLog, {
          kind: "info",
          text: `[${sigHealShield.label}] 보호막 +${sigHealShield.amount}`,
          turn: "player",
        });
      }
    }
  }
  // 마나 회복(명상 등) — 로그 한 줄(없으면 빈 턴처럼 보이는 갭 방지). 1턴 1행동이라
  //   이 턴은 공격 대신 마나를 채운 것. HP 회복 로그와 동형.
  if (result.manaRestored > 0 && result.castSkillName) {
    nextLog = appendLog(nextLog, {
      kind: "player_attack",
      text: `${result.castSkillName}! 마나 ${result.manaRestored} 회복했다.`,
    });
  }
  if (sigMpRefund && sigMpRefundAmount > 0 && result.castSkillName) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${sigMpRefund.label}] 마나 ${sigMpRefundAmount} 환급`,
      turn: "player",
    });
  }
  // PR2-B 사혈격 — 현재 HP 소모(자살 방지 최소 1).
  if (result.selfHpCost > 0) {
    const cost = Math.min(Math.max(0, nextPlayerHp - 1), result.selfHpCost);
    if (cost > 0) {
      nextPlayerHp -= cost;
      nextLog = appendLog(nextLog, {
        kind: "info",
        text: `${result.castSkillName ?? "사혈"}! 생명력 ${cost} 소모`,
        turn: "player",
      });
    }
  }
  const nextSelfBuffs = applyV2BuffsToMap(tickedSelfBuffs, result.selfBuffsToApply);
  const nextEnemyDebuffs = applyV2BuffsToMap(tickedEnemyDebuffs, result.enemyDebuffsToApply);
  const dotsToApplyToTarget = applyCorrosionToPoisonDots(
    result.dotsToApplyToTarget,
    player,
  );
  // PR-8 — dot effect 결과를 적 측 v2Dots 에 박음. 같은 label refresh.
  const nextEnemyDots = applyV2DotsToTarget(state.enemyV2Dots, dotsToApplyToTarget);
  for (const b of result.selfBuffsToApply) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${result.castSkillName ?? "강화"}] ${b.stat.toUpperCase()} +${b.pct}% (${b.turns}턴)`,
      turn: "player",
    });
  }
  for (const d of result.enemyDebuffsToApply) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${[result.castSkillName, statusNameForDebuffStat(d.stat)].filter(Boolean).join(" + ") || "약화"}] ${d.stat.toUpperCase()} -${d.pct}% (${d.turns}턴)`,
      turn: "player",
    });
  }
  for (const dot of dotsToApplyToTarget) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${[result.castSkillName, dot.label].filter(Boolean).join(" + ")}] +${dot.stacks}스택 (${dot.turns}회)`,
      turn: "player",
    });
  }
  // PR2-B temp 버프 적용 로그 — PvP(engine-pvp) 와 동일하게 시전 시점에 표기(보호막·운기·
  //   연환집중·선풍각·속박). 미보유 스킬은 전부 undefined/빈 배열 → 무로그(골든 불변).
  const shieldGainForLog = result.shieldToApply
    ? result.shieldToApply.hp + result.shieldToApply.mp
    : 0;
  if (shieldGainForLog > 0) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${result.castSkillName ?? "보호막"}] 보호막 +${shieldGainForLog}`,
      turn: "player",
    });
  }
  if (result.selfRegenToApply) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${result.castSkillName ?? "운기"}] 매 턴 HP +${result.selfRegenToApply.pctMaxHpPerTurn}% (${result.selfRegenToApply.turns}턴)`,
      turn: "player",
    });
  }
  const critBuffForLog = result.selfBuffPctToApply.find((b) => b.target === "crit");
  if (critBuffForLog) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${result.castSkillName ?? "집중"}] 치명 +${critBuffForLog.pct}%p (${critBuffForLog.turns}턴)`,
      turn: "player",
    });
  }
  const evaBuffForLog = result.selfBuffPctToApply.find((b) => b.target === "evasion");
  if (evaBuffForLog) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${result.castSkillName ?? "회피"}] 회피 +${evaBuffForLog.pct}%p (${evaBuffForLog.turns}턴)`,
      turn: "player",
    });
  }
  if (result.enemyVulnToApply) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${result.castSkillName ?? "속박"}] 가하는 피해 +${result.enemyVulnToApply.pct}% (${result.enemyVulnToApply.turns}턴)`,
      turn: "player",
    });
  }
  if (result.enemyEvasionDownToApply) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${result.castSkillName ?? "실명"}] 적 회피 −${result.enemyEvasionDownToApply.pct}% (${result.enemyEvasionDownToApply.turns}턴)`,
      turn: "player",
    });
  }
  if (result.enemyAccuracyDownToApply) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${result.castSkillName ?? "암흑"}] 적 명중 −${result.enemyAccuracyDownToApply.pct}% (${result.enemyAccuracyDownToApply.turns}턴)`,
      turn: "player",
    });
  }
  if (result.enemyHealReduceToApply) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${result.castSkillName ?? "화상"}] 적 회복 −${result.enemyHealReduceToApply.pct}% (${result.enemyHealReduceToApply.turns}턴)`,
      turn: "player",
    });
  }
  state = {
    ...state,
    playerHp: nextPlayerHp,
    enemyHp: nextEnemyHp,
    playerMp: adjustedNextMp,
    v2SkillCooldowns: result.nextCooldowns,
    v2SelfBuffs: nextSelfBuffs,
    v2SelfDebuffs: tickedSelfDebuffs, // (PvE 는 적이 enemyDebuff 안 박아서 갱신 X — tick 만 반영)
    enemyV2Debuffs: nextEnemyDebuffs,
    enemyV2Dots: nextEnemyDots,
    stacks: {
      // PR2-B-2c — 운기/연환집중/선풍각/속박 temp 버프 갱신.
      ...applySkillTempBuffs(state.stacks, result),
      comboHitCount: nextComboHitCount,
      spellCastCount: nextSpellCastCount,
      enemyMagicVulnStacks: nextMagicVulnStacks,
      // PR2-B 마나 보호막 — 흡수량(maxHP%+maxMP%)을 playerShield 풀에 누적.
      playerShield:
        state.stacks.playerShield +
        healShieldAmount +
        (result.shieldToApply
          ? result.shieldToApply.hp + result.shieldToApply.mp
          : 0),
    },
    log: nextLog,
  };
  return {
    state,
    castFired: result.castSkillId != null,
    selfHastePct: result.selfHasteToApply?.pct ?? 0,
    enemyDelayPct: result.enemyDelayToApply?.pct ?? 0,
  };
}

function resolveBattleLegacy(
  player: PlayerCombat,
  enemy: import("@/adventure/data/monsters").Monster,
  playerName: string,
  ctx: ResolveContext,
): BattleResolution {
  const potions: Partial<Record<PotionId, number>> = { ...ctx.potions };
  const consumed: Partial<Record<PotionId, number>> = {};
  let state = initialBattleState(
    player,
    enemy,
    playerName,
    ctx.v2Skills,
    ctx.initialEnemyHp,
  );
  // 보스 전투 여부 — 충돌파/천명 같은 %HP 효과 감산 (BOSS_PCT_HP_DAMAGE_MULT) 에 사용.
  if (ctx.isBoss) state = { ...state, isBoss: true };
  // v2 마법 (PR-7b) — 매 player turn 시작 시 cast. 전투 시작 시 sweep 폐기.
  // INT 0(라이브) 캐릭은 자동 미발동. cast hook 은 main loop 안.
  // 선공자 캐시 — 사이클(1턴) 정의가 선공자에 따라 달라진다.
  //   - 플레이어 선공: 사이클 = [player phase → enemy phase] — enemy→player 전환이 사이클 끝.
  //   - 적 선공:      사이클 = [enemy phase → player phase]  — player→enemy 전환이 사이클 끝.
  // 마커는 사이클 끝 시점에 다음 사이클 번호를 박는다 (단, 첫 사이클의 "1턴" 마커는 루프 진입 전 이미 박힘).
  const playerFirstStrike = state.phase === "player";
  // 턴 마커 — 그 턴 시작 시점 AP 동봉. 미장착 캐릭터도 그대로 노출 (시스템 발견용).
  const turnMarkerText = (turnNo: number): string => `${turnNo}턴`;
  // 그 시점 HP 스냅샷 — 매 턴 종료 시 + 전투 종료 시 로그 마지막에 박는다.
  const hpBarEntry = (s: BattleState): BattleLogEntry => ({
    kind: "hp_bar",
    text: "",
    turn: "player",
    playerHp: s.playerHp,
    playerMaxHp: s.playerMaxHp,
    enemyHp: s.enemyHp,
    enemyMaxHp: s.enemy.hp,
    playerMp: s.playerMp,
    playerMaxMp: s.playerMaxMp,
    enemyMp: s.enemyMp,
    enemyMaxMp: s.enemyMaxMp,
  });
  // 초기 entry (적 등장 / 선공 / 능력 안내 등) 는 player 턴으로 태깅. 첫 턴 marker 도 박는다.
  // openingNote(전술 안내 등)가 있으면 적 등장 다음·첫 턴 marker 앞에 info 로 끼운다.
  const openingExtra: BattleLogEntry[] = ctx.openingNote
    ? [{ kind: "info", text: ctx.openingNote, turn: "player" as const }]
    : [];
  state = {
    ...state,
    log: [
      ...state.log.map((e) => ({ ...e, turn: "player" as const })),
      ...openingExtra,
      {
        kind: "turn_marker",
        text: turnMarkerText(1),
        turn: "player" as const,
      },
    ],
  };
  let turns = 0;
  // v2 스킬 (v2_skill_*) — PR-4a framework. phase-entry flag 로 dedupe — player phase 가
  // enemy 로 빠졌다가 돌아올 때마다 정확히 1회 cast. (포션-only 턴 종료가 completedPlayerTurns
  // 를 증가시키지 않아 옛 counter 기반 dedupe 는 한 turn 미시전 케이스가 있어 채택.)
  let v2CastedThisPlayerPhase = false;
  // PR-5b — enemy phase 진입 시 1회 cast. phase 가 enemy 가 아니게 되면 reset.
  let v2CastedThisEnemyPhase = false;

  while (state.phase !== "ended") {
    let action: PlayerAction = { kind: "attack" };
    // 이 iteration 의 enemy 페이즈에서 몹이 스킬을 실제 발동했는지 — true 면 평타 생략(더블어택 fix).
    let enemySkillFiredThisTurn = false;
    // PR-5b 회귀: enemy phase 가 player 로 전환되면 enemy cast flag reset (offlineSim 과 동작 일치).
    if (state.phase === "player") {
      v2CastedThisEnemyPhase = false;
    }
    if (state.phase === "player") {
      // v2 스킬 cast (PR-4b) — MP 차감 + cooldown set + 효과 적용 (damage/heal/buff/debuff).
      // 매 player phase 진입 시 1회 — buff/debuff turn -1 tick + cast.
      if (!v2CastedThisPlayerPhase) {
        v2CastedThisPlayerPhase = true;
        // 0) PR-8 — player 가 받는 DoT tick (적이 박은 dot). DEF 무시. lethal 처리.
        // 적이 박은 dot 이므로 enemy_attack 로그 (오른쪽 적 레인).
        const playerDotTick = tickV2Dots(state.playerV2Dots, state.playerMaxHp);
        if (playerDotTick.totalDmg > 0) {
          const before = state.playerHp;
          const newHp = Math.max(0, before - playerDotTick.totalDmg);
          const dotLabels = state.playerV2Dots
            .filter((d) => d.turns > 0)
            .map((d) => d.label)
            .join(" + ");
          state = {
            ...state,
            playerHp: newHp,
            playerV2Dots: playerDotTick.nextDots,
            log: appendLog(state.log, {
              kind: "enemy_attack",
              // "입혔다" 로 통일 — 가한 쪽 관점(ATB tickPlayerBundleEntry 와 동일).
              text: `[${dotLabels}] ${playerDotTick.totalDmg} 피해를 입혔다.`,
            }),
          };
          if (state.playerHp <= 0) {
            state = {
              ...state,
              log: appendLog(state.log, {
                kind: "info",
                text: `플레이어가 쓰러졌다.`,
                turn: "player",
              }),
              outcome: "lose",
              phase: "ended",
            };
            continue;
          }
        } else {
          // 누적 데미지 0 (dot 비어있음) 라도 tick 결과 next 로 갱신.
          state = { ...state, playerV2Dots: playerDotTick.nextDots };
        }
        // 1) buff/debuff tick (cast 전에 — 새 buff 는 발동턴부터 turns 만큼 유지).
        const tickedSelfBuffs = tickV2BuffMap(state.v2SelfBuffs);
        const tickedSelfDebuffs = tickV2BuffMap(state.v2SelfDebuffs);
        const tickedEnemyDebuffs = tickV2BuffMap(state.enemyV2Debuffs);
        // 2) cast 결정 + 효과 적용 (applyPlayerV2SkillCast — ATB/legacy 공유 추출).
        const cast = applyPlayerV2SkillCast(state, player, {
          selfBuffs: tickedSelfBuffs,
          selfDebuffs: tickedSelfDebuffs,
          enemyDebuffs: tickedEnemyDebuffs,
        });
        state = cast.state;
        // lethal 체크 — v2 damage 로 적 사망 시 정상 종료 처리 (옛 spell cast 분기와 일관).
        if (state.enemyHp <= 0) {
          state = {
            ...state,
            log: appendLog(state.log, {
              kind: "info",
              text: `${state.enemy.name}을(를) 쓰러뜨렸다!`,
              turn: "player",
            }),
            outcome: "win",
            phase: "ended",
            turn: {
              ...state.turn,
              completedPlayerTurns: state.turn.completedPlayerTurns + 1,
            },
          };
          continue;
        }
        // cast 발동 시 그 턴 전체 소진 → phase=enemy 직행. 다대시(attacksLeft>1) 캐릭도
        // 강타 1번으로 그 턴 종료. 의도: 1턴 1행동 (강타 OR 일반공격, 양립 X).
        //
        // ⚠️ 시전도 "완료한 플레이어 턴" 이다 — 평타 종료 경로(아래 일반 공격 분기)와 똑같이
        // completedPlayerTurns 를 +1 하고 턴 플래그를 리셋한 뒤 finishPlayerTurn(턴 종료 효과:
        // 재생·막다른 격노·약점 분석 등)을 거쳐야 한다. 예전엔 여기서 증가를 빠뜨려서, 매 턴
        // 마법을 시전하는 캐릭터(MP 충분한 버스트 마법사)는 completedPlayerTurns 가 0 에
        // 고정됐다. 그 결과 사이클 종료 마커("N턴")·턴별 HP 스냅샷이 completedPlayerTurns>0
        // 게이트(아래 cycleEnded 블록)에 걸려 영영 안 찍히고, 전투 전체 행동이 첫 "1턴" 그룹에
        // 쌓이는 버그가 났다. 턴 기반 효과(재생/강공격 주기/버프 감소/보스 턴 캡)도 같이 멈췄다.
        if (cast.castFired) {
          const ended: BattleState = {
            ...state,
            phase: "enemy",
            playerAttacksLeft: rollPlayerAttackCountWithBleed(state, player),
            turn: {
              ...state.turn,
              completedPlayerTurns: state.turn.completedPlayerTurns + 1,
              doubleStrikeUsedThisTurn: false,
              lightspeedUsedThisTurn: false,
              critThisTurn: false,
              riposteUsedThisTurn: false,
              firstAttackPending: true,
              galeChainsThisTurn: 0,
              weakpointUsedThisTurn: false,
              fatedChainTriggeredThisTurn: false,
            },
          };
          state = finishPlayerTurn(ended, player, playerName);
          continue;
        }
      }
    } else if (state.phase === "enemy") {
      // PR-5b — enemy 의 v2 스킬 cast (player cast hook 미러). monster.v2Skills 미지정이면 no-op.
      v2CastedThisPlayerPhase = false;
      if (!v2CastedThisEnemyPhase) {
        v2CastedThisEnemyPhase = true;
        const tickedEnemySelfBuffs = tickV2BuffMap(state.enemyV2SelfBuffs);
        const tickedEnemyDebuffsLocal = tickV2BuffMap(state.enemyV2Debuffs);
        const tickedPlayerDebuffs = tickV2BuffMap(state.v2SelfDebuffs);
        const result = resolveV2SkillCast({
          skills: state.enemyV2Skills,
          cooldowns: state.enemyV2SkillCooldowns,
          procRoll: Math.random() * 100,
          // 속성 양방향(2026-06-20): 몹→플레이어 스킬도 방어 상성 적용. adv/dis 생략 = elementDamageMult
          //   기본값(전역 V2_ELEMENT_ADV/DIS_PCT=25/15) 사용 — 몹 평타(enemyPhase enemyElemMult)와 일관.
          //   내가 몹 속성에 강하면 몹 스킬 피해 감소, 약하면 증가. 🔑 #881 로 몹 더블어택(스킬+평타) 수정
          //   완료(스킬 시전 턴엔 평타 생략) → 한 턴 1회 공격이라 스킬+평타 이중 곱 없음(옛 0/0 제약 해소).
          //   무속성 매치업=×1(기존 전투 byte-identical).
          attacker: {
            mp: state.enemyMp,
            atk: state.enemy.atk,
            maxHp: state.enemy.hp, // monster.hp = max hp (정적)
            // PR2-B — 상대 caster(Monster 타입)는 def/현재HP/maxMp 만(vit/차수 없음 → 기본값 안전).
            def: state.enemy.def,
            currentHp: state.enemyHp,
            maxMp: state.enemyMaxMp,
            selfBuffs: tickedEnemySelfBuffs,
            selfDebuffs: tickedEnemyDebuffsLocal,
            // PR-5b — 몬스터 평타·스킬 모두 자기 속성(atk 에 baked). 보정=1(이중계산 방지).
            attackElement: state.enemy.element,
            characterElement: state.enemy.element,
          },
          target: {
            def: player.def,
            magicDef: player.magicDef,
            selfBuffs: state.v2SelfBuffs,
            selfDebuffs: tickedPlayerDebuffs,
            // PR-5b — 피격 플레이어의 방어 속성(캐릭 속성).
            element: player.characterElement,
            // PR2-B — 상대(플레이어)의 처단/스택 payoff 대상 = 시전자 player.
            currentHp: state.playerHp,
            maxHp: state.playerMaxHp,
            magicSkillDamageReductionPct:
              state.turn.enemyPhasesCompleted <
              (player.passiveOpeningMagicDamageReductionPhases ?? 0)
                ? (player.passiveOpeningMagicDamageReductionPct ?? 0)
                : 0,
            bleedStacks: state.playerV2Dots.filter((d) => d.tag === "bleed").reduce((s, d) => s + d.stacks, 0),
            poisonStacks: state.playerV2Dots.filter((d) => d.tag === "poison").reduce((s, d) => s + d.stacks, 0),
          },
        });
        let nextPlayerHp = state.playerHp;
        let nextEnemyHp = state.enemyHp;
        let nextLog = state.log;
        // 스킬이 실제 발동(castSkillId)했으면 이 enemy 페이즈 평타 생략 — 스킬이 평타를 대체(플레이어
        //   대칭). resolveEnemyPhase 가 skipEnemyBasicAttack 으로 받아 데미지/회피/반사 스킵. 더블어택 fix.
        enemySkillFiredThisTurn = result.castSkillId != null;
        // 시전 별도 로그 폐기 — damage/heal 로그에 prefix 로 스킬명 포함.
        // 적의 v2 damage 는 일반 적 공격과 같은 enemy_attack kind 로 통일.
        if (result.enemyDamage > 0 && result.castSkillName) {
          nextPlayerHp = Math.max(0, nextPlayerHp - result.enemyDamage);
          nextLog = appendLog(nextLog, {
            kind: "enemy_attack",
            text: `${result.castSkillName}! ${result.enemyDamage} 피해를 입혔다.`,
          });
        }
        // 적의 self heal — enemy_attack kind (적 측 행동). 화상(enemyHealReduce)이 있으면 회복 감소.
        //   디버프 없으면(0) Math.floor 미적용 → byte-identical. (라이브 ATB 는 적 cast 미발동이라 inert)
        if (result.selfHeal > 0 && result.castSkillName) {
          const healReduce =
            state.stacks.enemyHealReduceTurns > 0 ? state.stacks.enemyHealReducePct : 0;
          const effHeal =
            healReduce > 0
              ? Math.floor(result.selfHeal * (1 - healReduce / 100))
              : result.selfHeal;
          const before = nextEnemyHp;
          nextEnemyHp = Math.min(state.enemy.hp, nextEnemyHp + effHeal);
          const actual = nextEnemyHp - before;
          if (actual > 0) {
            nextLog = appendLog(nextLog, {
              kind: "enemy_attack",
              text: `${result.castSkillName}! ${state.enemy.name} HP ${actual} 회복했다.`,
            });
          }
        }
        // PR2-B 사혈격(상대 시전) — 상대 HP 소모(자살 방지 최소 1).
        if (result.selfHpCost > 0) {
          nextEnemyHp = Math.max(1, nextEnemyHp - result.selfHpCost);
        }
        const nextEnemySelfBuffs = applyV2BuffsToMap(tickedEnemySelfBuffs, result.selfBuffsToApply);
        // enemyDebuff effect (적이 player 에 거는 약화) → state.v2SelfDebuffs 갱신.
        const nextPlayerDebuffs = applyV2BuffsToMap(tickedPlayerDebuffs, result.enemyDebuffsToApply);
        // PR-8 — enemy cast 의 dot 결과 → state.playerV2Dots 박힘 (target=player).
        const sigStatusBlock = statusBlockOnce(player.equipSignatures);
        const statusBlockDots =
          result.dotsToApplyToTarget.length > 0 &&
          !!sigStatusBlock &&
          !state.flags.statusBlockUsed;
        const nextPlayerDots = statusBlockDots
          ? state.playerV2Dots
          : applyV2DotsToTarget(state.playerV2Dots, result.dotsToApplyToTarget);
        for (const b of result.selfBuffsToApply) {
          nextLog = appendLog(nextLog, {
            kind: "info",
            text: `[${result.castSkillName ?? "강화"}] ${b.stat.toUpperCase()} +${b.pct}% (${b.turns}턴)`,
            turn: "enemy",
          });
        }
        for (const d of result.enemyDebuffsToApply) {
          nextLog = appendLog(nextLog, {
            kind: "info",
            text: `[${[result.castSkillName, statusNameForDebuffStat(d.stat)].filter(Boolean).join(" + ") || "약화"}] ${d.stat.toUpperCase()} -${d.pct}% (${d.turns}턴)`,
            turn: "enemy",
          });
        }
        if (statusBlockDots && sigStatusBlock) {
          nextLog = appendLog(nextLog, {
            kind: "info",
            text: `[${sigStatusBlock.label}] 상태이상을 막았다.`,
            turn: "enemy",
          });
        }
        for (const dot of statusBlockDots ? [] : result.dotsToApplyToTarget) {
          nextLog = appendLog(nextLog, {
            kind: "info",
            text: `[${[result.castSkillName, dot.label].filter(Boolean).join(" + ")}] +${dot.stacks}스택 (${dot.turns}회)`,
            turn: "enemy",
          });
        }
        const countered =
          result.enemyDamage > 0 && result.castSkillName
            ? applyPassiveCounterOnHitIfAny(
                {
                  ...state,
                  playerHp: nextPlayerHp,
                  enemyHp: nextEnemyHp,
                  log: nextLog,
                },
                player,
              )
            : null;
        if (countered) {
          nextPlayerHp = countered.playerHp;
          nextEnemyHp = countered.enemyHp;
          nextLog = countered.log;
        }
        state = {
          ...state,
          playerHp: nextPlayerHp,
          enemyHp: nextEnemyHp,
          enemyMp: result.nextMp,
          enemyV2SkillCooldowns: result.nextCooldowns,
          enemyV2SelfBuffs: nextEnemySelfBuffs,
          enemyV2Debuffs: tickedEnemyDebuffsLocal,
          v2SelfDebuffs: nextPlayerDebuffs,
          playerV2Dots: nextPlayerDots,
          flags: {
            ...state.flags,
            statusBlockUsed: state.flags.statusBlockUsed || statusBlockDots,
          },
          log: nextLog,
        };
        // lethal — enemy v2 damage 로 player 사망 시 outcome=lose.
        if (countered?.phase === "ended") {
          state = {
            ...state,
            phase: "ended",
            outcome: countered.outcome,
          };
          continue;
        }
        if (state.playerHp <= 0) {
          state = {
            ...state,
            log: appendLog(state.log, {
              kind: "info",
              text: `플레이어가 쓰러졌다.`,
              turn: "enemy",
            }),
            outcome: "lose",
            phase: "ended",
          };
          continue;
        }
      }
    } else {
      // ended 등 — 둘 다 reset.
      v2CastedThisPlayerPhase = false;
      v2CastedThisEnemyPhase = false;
    }
    if (state.phase === "player") {
      const picked = ctx.pickAction(state);
      if (picked.kind === "use_potion") {
        const have = potions[picked.potionId] ?? 0;
        if (have > 0) {
          potions[picked.potionId] = have - 1;
          consumed[picked.potionId] = (consumed[picked.potionId] ?? 0) + 1;
          action = picked;
        }
      } else {
        action = picked;
      }
    }
    // advanceTurn 호출 직전의 phase 가 이번 step 의 turn — 호출 안에서 phase 가 다음으로
    // 전환되더라도, 그 사이 push 된 entry 들은 모두 이 turn 의 것이다.
    // PR-7b cast hook 으로 ended 가 박힐 수 있어 안전 가드 — 도달 시 다음 iter 종료.
    if (state.phase === "ended") continue;
    const turnContext: "player" | "enemy" = state.phase;
    const prevLogLen = state.log.length;
    const prevPhase = state.phase;
    state = advanceTurn(
      state,
      player,
      playerName,
      action,
      enemySkillFiredThisTurn,
    );
    // 새로 추가된 entry 에만 turn 을 부여. (이미 turn 이 있는 entry — 만약 직접 박은
    // 곳이 있어도 — 는 보존.)
    if (state.log.length > prevLogLen) {
      const tagged = state.log.map((e, idx) =>
        idx < prevLogLen || e.turn ? e : { ...e, turn: turnContext },
      );
      state = { ...state, log: tagged };
    }
    // 사이클 종료 시점 — 다음 사이클 시작 직전에 턴 marker 박기 (방금 끝난 턴의
    // HP 스냅샷도 함께). completedPlayerTurns 는 player phase 종료마다 +1 되므로
    // 두 케이스 모두 turnNo = completedPlayerTurns + 1 로 일관.
    //   - 플레이어 선공: enemy→player 전환 (사이클 = 내+적)
    //   - 적 선공:      player→enemy 전환 (사이클 = 적+내)
    // 첫 사이클의 "1턴" 마커는 루프 진입 전 이미 박혔으므로 completedPlayerTurns > 0 으로 건너뛴다.
    const cycleEnded = playerFirstStrike
      ? prevPhase === "enemy" && state.phase === "player"
      : prevPhase === "player" && state.phase === "enemy";
    if (cycleEnded && state.turn.completedPlayerTurns > 0) {
      const turnNo = state.turn.completedPlayerTurns + 1;
      state = {
        ...state,
        log: appendLog(
          appendLog(state.log, hpBarEntry(state)),
          {
            kind: "turn_marker",
            text: turnMarkerText(turnNo),
            turn: "player",
          },
        ),
      };
    }
    turns += 1;

    // 보스 타임아웃 — completedPlayerTurns 가 BOSS_TURN_CAP 도달하면 패배로 종료.
    // 일반 전투는 영향 없음 (ctx.isBoss === false).
    if (
      ctx.isBoss &&
      state.phase !== "ended" &&
      state.turn.completedPlayerTurns >= BOSS_TURN_CAP
    ) {
      const timeoutLog = appendLog(
        appendLog(state.log, {
          kind: "info",
          text: `${BOSS_TURN_CAP}턴 경과 — 보스를 쓰러뜨리지 못했다.`,
        }),
        hpBarEntry(state),
      );
      return {
        outcome: "lose",
        finalState: {
          ...state,
          log: timeoutLog,
          phase: "ended",
          outcome: "lose",
        },
        potionsConsumed: consumed,
        turns,
      };
    }

    // 무한 루프 가드 — 정상 전투는 보통 수십 턴 안에 끝난다. 만약 데미지 0/회피 100% 같은
    // 병리적 조합이면 적의 타임아웃 패배로 강제 종료. ctx.maxTurns 로 상한을 낮출 수 있다
    // (스파링 = 안 죽는 샌드백을 maxTurns 턴까지 두들기고 lose 로 종료). turns 도달 시 그 턴에
    // 멈추므로(>=) maxTurns 가 곧 표기 턴 수와 일치한다.
    if (turns >= (ctx.maxTurns ?? 500)) {
      return {
        outcome: "lose",
        finalState: {
          ...state,
          log: appendLog(state.log, hpBarEntry(state)),
          phase: "ended",
          outcome: "lose",
        },
        potionsConsumed: consumed,
        turns,
      };
    }
  }

  return {
    outcome: state.outcome!,
    finalState: { ...state, log: appendLog(state.log, hpBarEntry(state)) },
    potionsConsumed: consumed,
    turns,
  };
}

export function resolveBattle(
  player: PlayerCombat,
  enemy: import("@/adventure/data/monsters").Monster,
  playerName: string,
  ctx: ResolveContext,
): BattleResolution {
  if (V2_CORE_LOOP_V2) return resolveBattleAtb(player, enemy, playerName, ctx);
  return resolveBattleLegacy(player, enemy, playerName, ctx);
}

// 물약 효과 적용 — 순수 함수. 인벤토리 차감은 호출 측 책임.
export function applyPotionEffect(
  state: BattleState,
  potion: Potion,
  playerName: string,
): BattleState {
  if (potion.effect.kind === "heal_hp") {
    const heal = potionHealAmount(
      potion,
      state.playerMaxHp,
      state.buffs.potionHealPct ?? 0,
    );
    const newHp = Math.min(state.playerMaxHp, state.playerHp + heal);
    const actual = newHp - state.playerHp;
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
