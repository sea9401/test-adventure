// PvP 전투 엔진 — engine.ts (PvE) 의 대칭 미러. 양쪽 모두 PlayerCombat.
// 공격자/방어자 양측 능력 전부 대칭 구현 (#282 풀-스코프, 능력 32종 + AP 시스템 미러).
//
// 차이점 (engine.ts 와):
//   - 양쪽 모두 PlayerCombat (Monster 없음). 두 사이드를 p1/p2 로 보관.
//   - Monster 전용 개념(phaseTrigger / 잡몹 skill heavy_blow|enrage|brace|pierce /
//     armorVulnerable / playerDefVulnerable) 은 제거. 두 플레이어의 특기·룬·AP스킬은
//     양쪽 모두에 대칭으로 적용. (포션은 PvP 디자인상 사용 불가 — 라우트가 미전달.)
//   - state.enemy.X → defender.player.X (현재 페이즈에서 방어자 측)
//   - state.buffs/flags/stacks/turn → attacker.buffs/flags/stacks/turn (현재 페이즈에서 공격자 측)
//   - 출혈/중독/연소는 defender.v2Dots 에 tagged DoT 로 보관된다.
//   - 승패: 양쪽 모두 HP 0 → 무승부(draw). 100턴(PVP_TURN_CAP) 초과 시 잔여 HP 비율 높은
//     쪽 승, 동률이면 draw. resolveBattlePvP 가 처리.
//
// 능력 범위 (대칭 — 양쪽에 동일 적용):
//   공격 측: 강공격, 분쇄, 암살, 약점적중, 광전사, 질풍검, 불굴의일격, 회전운기, 크리(천칭·
//     이중행운·만물행운), 처형, 행운의별, 천명, 충돌파, 연쇄운명, 연타, 광속, 풍사슬(5)/
//     무한풍사슬(6), 연참, 그림자 분신/군단, 무피해 난무, 막다른 격노, 약점 분석,
//     흡혈/행운의 흡혈/흡혈의 룬, 출혈 dot (방어자 턴 시작 시 적용).
//   방어 측: 그림자 보법, 회피 강화(보장 회피), 행운의 방패, 곡예(회피 시 힐), 반사 회피,
//     유격, 반격(counterAtkBonus), 가드, 굳건한 의지, 철벽 보호막 흡수, 불굴(HP 0 방어),
//     흡혈 갑옷, 반사 갑주, 가시 갑옷, 무한 가시 반사, 반격의 룬.
//
// 재사용:
//   - PlayerCombat / PlayerAction / BattleLogEntry / damageBetween / BattleTurnState 는
//     engine.ts 에서 import (단일 진실 공급원).

import {
  type PlayerCombat,
  type PlayerAction,
  type BattleLogEntry,
  type BattleTurnState,
  appendLog,
  damageBetween,
} from "./engine";
import {
  CRIT_PCT_CAP,
  STAT_LABELS,
} from "@/adventure/data/stats";
import {
  V2_CORE_LOOP_V2,
  V2_SKILL_PROC_IN_PATTERN,
} from "@/adventure/data/v2/coreLoopConfig";
import {
  computeMpRestoreAmount,
  type Potion,
  type PotionId,
} from "@/adventure/data/potions";
import {
  applyV2BuffsToMap,
  applyV2DotsToTarget,
  applyPlayerPoisonDamageScaling,
  decrementTimedBuffs,
  distributeV2DotTicks,
  makeBleedDot,
  makePoisonDot,
  potionHealAmount,
  applyComboFinisherToHits,
  removeMissedV2SkillTargetEffects,
  resolveV2SkillCast,
  type V2SkillDotApply,
  distributeBoostedHits,
  rollAttackCount,
  statusDamageAfterReduction,
  tickV2BuffMap,
  tickV2Dots,
  v2AtkBuffMult,
  v2DefBuffMult,
  v2DotLogCause,
} from "./combatShared";
import {
  battleStartShield,
  everyNHitsEffect,
  formatChillSlowLog,
  formatDefDebuffLog,
  formatShockAppliedLog,
  healToShield,
  lowHpDamageReductionPct,
  onDodgeSpeedBuff,
  onSkillCastMpRefund,
  resolveOffensiveSignatureTriggers,
  rollEvasionActionRecovery,
  SIGNATURE_CRIT_POISON_PCT_MAX_HP_PER_STACK,
  SIGNATURE_HIT_POISON_PCT_MAX_HP_PER_STACK,
  statusBlockOnce,
} from "./signatureEffects";
import { canApplyShock, enterShockAction } from "./shockAction";
import { V2_COMBAT_PATTERN_ENABLED } from "./combatPattern";
import {
  effectiveCombatPatternFromEquipped,
  aggregateEquippedPassives,
  isLimitedRecoverySkillId,
  smartDefaultPatternFromEquipped,
  V2_SKILLS,
} from "@/adventure/data/v2/v2Skills";
import {
  consumePurificationWard,
  initialTripleWardState,
  mergeTripleWardResourceSnapshot,
  refreshTripleWardState,
  resolveTripleWardDamage,
  TRIPLE_WARD_LABELS,
  tripleWardStabilityReductionPct,
  type TripleWardState,
} from "./tripleWard";
import {
  composeDuelistDeclaration,
  duelistDeclarationSummary,
  interruptDuelistRamp,
} from "./duelistCombat";
import {
  HEAVEN_DECREE_HP_PCT,
  LUCKY_STAR_DAMAGE_MULT,
  MAGIC_VULN_STACK_CAP,
  RAMPAGE_START_TURN,
  SKILL_CRIT_MULT,
  SPELL_STACK_CAP,
  applyEvasionDamageReduction,
  cappedDefReductionPct,
  pvpEvasionDamageReductionPct,
} from "@/adventure/data/v2/v2CombatConstants";
import {
  magicBarrierCombatLogEntries,
  resolveMagicBarrierDamage,
} from "./magicBarrier";
import { advanceTurnPvP } from "./engine.pvpPhase";
import { resolveBattlePvPAtb } from "./engine.pvp-atb";
import {
  pickPvpInitiative,
  type PvPInitiativeActor,
} from "./pvpInitiative";
import {
  computeCritOverflowBonus,
  computeDirectSkillDamage,
  reducedMagicDefense,
} from "./engine.damageHelpers";
import {
  hasTier6Unique,
  initialTier6UniqueRuntime,
  activeTier6ResourceSnapshot,
  type Tier6UniqueRuntimeState,
} from "./tier6UniqueEffects";
import {
  addLawInscriptionGain,
  emptyLawInscriptionState,
  lawInscriptionConsumeLog,
  lawInscriptionGainLog,
  mergeLawInscriptionSnapshot,
  type LawInscriptionState,
} from "./lawInscription";
import {
  effectiveMutationDef,
  mutationTransitionLogLines,
} from "./mutationCombat";
import {
  applyTier6UniquePvpEvent,
  tier6PvpDotContext,
  tier6PvpStatusKindCount,
} from "./tier6UniquePvpAdapter";
import {
  consumeReactiveDefenseCharges,
  ironWallDamageReductionPct,
  resolveFortressReaction,
} from "./fortressKnight";
import {
  applyBerserkerCastTransition,
  applyBerserkerLethalDamage,
  berserkerCastContext,
  clampBerserkerGuardedHp,
  finishBerserkerCurrentActionGuard,
  finishBerserkerPlayerAttack,
  initialBerserkerCombatState,
  type BerserkerCombatState,
} from "./berserkerCombat";
export { advanceTurnPvP }; // 공개 API 보존 (resolveBattlePvP 가 로컬 호출도 함 → import+export 둘 다)

// ── 타입 정의 ───────────────────────────────────────────────────────────────

export type PvPPhase = "p1" | "p2" | "ended";

export type PvPOutcome = "p1_win" | "p2_win" | "draw";

export type PvPPhaseEndOptions = {
  tickDefenderDots?: boolean;
  /** 감전 등으로 본 행동이 취소됐을 때 분신·난무 같은 공격 후속타만 생략한다. */
  skipOffensiveFollowups?: boolean;
};

// 각 사이드별 1회성 토글. PvE 의 BattleFlags 와 비교해 Monster 전용(phaseTriggered, enrageTriggered) 제거.
export type PvPSideFlags = {
  enduranceTriggered: boolean;
  assassinateUsed: boolean;
  luckyBuffActive: boolean;
  fatedChainCritPending: boolean;
  skillCritAfterEvadePending: boolean;
  statusBlockUsed: boolean;
};

// 각 사이드별 누적 보너스/페널티. PvE 의 BattleBuffs 와 비교해 enemyDefBonus(phase trigger),
// enemyAtkBonus(enrage) 제거. enemyAtkPenalty/enemyDefPenalty 는 opponentAtkPenalty/opponentDefPenalty
// 로 의미 일관화 (이 사이드가 상대에게 적용한 페널티).
// AP 스킬 지속 효과 — 모두 "이 사이드 자신에게 걸린/이 사이드가 상대에게 건" 효과로 정의:
//   playerXxx     → 자기-효과 (결의/광기/폭주). 자기 공격/방어 시 사용.
//   enemyXxx      → 외향 효과 (약점노출/둔화). 자기 공격 시 사용.
//   enemyAttackBlockedCount → 방어용 카운터 (잔상). 상대가 공격해 올 때 소비.
//   enemySilenceTurnsLeft → 호환용 (PvP 는 몬스터 skill 없어 무효).
export type PvPSideBuffs = {
  rampageAtkBonus: number;
  opponentAtkPenalty: number;
  opponentDefPenalty: number;
  cyclingChiBonus: number;
  potionHealPct: number;
  // 결의 — 자기가 받는 피해 -pct% (defender 일 때 적용).
  playerDmgReductionPct: number;
  playerDmgReductionTurnsLeft: number;
  // 광기 — 자기 ATK +atkPct% / 자기 DEF -defPct%.
  playerAtkBuffPct: number;
  playerAtkBuffTurnsLeft: number;
  playerDefDebuffPct: number;
  playerDefDebuffTurnsLeft: number;
  // 폭주 — 자기 SPD ×mult.
  playerSpdMult: number;
  playerSpdTurnsLeft: number;
  // 약점 노출 — 공격 시 상대 DEF -pct%.
  enemyDefDebuffPct: number;
  enemyDefDebuffTurnsLeft: number;
  enemyMagicDefDebuffPct?: number;
  enemyMagicDefDebuffTurnsLeft?: number;
  // 둔화 — SPD 비교에서 상대 SPD ×mult.
  enemySpdMult: number;
  enemySpdTurnsLeft: number;
  // 천뢰 — PvP 에선 무효 (몬스터 skill 없음) 하지만 호환용 보관.
  enemySilenceTurnsLeft: number;
  // 잔상 — 상대 공격 N회 무효 (defender 일 때 소비).
  enemyAttackBlockedCount: number;
  // 흡령 — 시한부 흡혈. 가한 데미지의 pct% 만큼 자가 회복. turnsLeft 0 이면 비활성.
  playerLifestealPct: number;
  playerLifestealTurnsLeft: number;
  tier6UnityHealPct?: number;
  tier6UnityTurnsLeft?: number;
};

export type PvPSideStacks = {
  tripleWard: TripleWardState;
  fortressImpact: number;
  ironWallReflectCharges: number;
  /** 골렘 변이 — 전투 한정 중량(0..3). */
  mutationWeight: number;
  lawInscriptions?: LawInscriptionState;
  playerShield: number;
  evadesRemaining: number;
  damageTakenThisCombat: number;
  weakpointDefIgnoreLeft: number;
  // 강체/장비 시그니처 — 받은 HP 피해 비례로 누적된 DEF 보너스(전투 내, 상한 = 기본 DEF).
  braceDefBonus: number;
  // PR2-B 전문화 스킬 temp 버프 — PvE BattleStacks 미러. 전부 0/turns=0 이면 inert(골든 불변).
  skillRegenPct: number; // 운기 — 매 자기 턴 maxHp %
  skillRegenTurns: number;
  skillCritPct: number; // 연환집중 — 치명률 +%p
  skillCritTurns: number;
  skillEvasionPct: number; // 선풍각 — 회피도 +%
  skillEvasionTurns: number;
  accuracyDownPct: number; // 암흑 — 이 side 의 적중도 -%.
  accuracyDownTurns: number;
  skillDmgReducePct: number; // 진홍 심판·철포 — 받는 피해 -%
  skillDmgReduceTurns: number;
  skillReflectBoostPct: number; // 활성 반사 증폭 — 모든 반사 피해 +%
  skillReflectBoostTurns: number;
  enemyVulnPct: number; // 속박 — 시전자가 가하는 피해 +% (받는 쪽 취약)
  enemyVulnTurns: number;
  enemyMagicVulnPct?: number;
  enemyMagicVulnTurns?: number;
  // 화상(원소술사 불) — 이 side 에 걸린 회복 감소 디버프(상대가 부착). 이 side 의 회복(회복 스킬·재생)
  //   −healReducePct%. 흡혈/공격파생 회복은 제외. 자기 턴(cast hook)에 turns 감소.
  healReducePct: number;
  healReduceTurns: number;
  damageDownPct: number; // 쇠약 — 이 side 가 주는 직접 피해 -%.
  damageDownTurns: number;
  skillProcDownPct: number; // 금제 — 이 side 의 스킬 발동률 -%p.
  skillProcDownTurns: number;
  dotVulnPct: number; // 침식 — 이 side 가 받는 DoT/마법취약 피해 +%.
  dotVulnTurns: number;
  // 약점 노출(마도사) — 이 side 에 누적된 마법취약 스택(상대가 부착). 스택당 받는 스킬피해 +%
  // (상대 enemyMagicVulnPctPerStack), 비전 작렬 payoff 가 소비. 감쇠 없음·MAGIC_VULN_STACK_CAP 상한.
  magicVulnStacks: number;
  // 주문 중첩(워메이지) — 이 side(시전자)의 누적 스킬 시전 횟수. 스택당 스킬피해 +skillDmgPctPerCast%.
  // 감쇠 없음·SPELL_STACK_CAP 상한.
  spellCastCount: number;
  // 절초 — 누적 적중 4타째마다 피해 증폭. PvE BattleStacks.comboHitCount 미러.
  comboHitCount: number;
  // 고유 시그니처 — 이 side 의 평타·스킬 누적 적중 횟수(N회마다 추가 기본 공격). 미장착=0 고정.
  signatureHitCount: number;
  // every_n_hits 로 예약된 추가 기본 공격 잔량. 이 공격은 자기 자신의 다음 주기 적중에는 포함하지 않는다.
  signatureBonusAttacksLeft: number;
  /** 이 side에 걸린 감전 행동 상태. */
  shockAction?: import("./shockAction").ShockActionState;
  /** 6T 시그니처를 하나라도 장착했을 때만 생성하는 전투 한정 자원. */
  tier6Uniques?: Tier6UniqueRuntimeState;
};

export type PvPSide = {
  player: PlayerCombat;
  name: string;
  hp: number;
  maxHp: number;
  duelistBuff?: import("./duelistCombat").DuelistBuff | null;
  duelistCritHastePending?: boolean;
  // v2 마법 풀 — 일기토/토너먼트 매치 시작 시 풀충전 (PR-3·4). INT 0 = 둘 다 0.
  mp: number;
  maxMp: number;
  magicBarrier?: number;
  maxMagicBarrier?: number;
  attacksLeft: number;
  // 유격 (skirmishNextTurnBonus) — 이 사이드가 회피 성공 시 누적, 다음 자기 공격 페이즈
  // 시작 시 attacksLeft 에 더해지고 0 으로 리셋. PvE 의 enemy phase 내 직접 가산을
  // PvP 에선 페이즈 분리 때문에 별도 슬롯이 필요.
  nextTurnAttackBonus: number;
  turn: BattleTurnState;
  flags: PvPSideFlags;
  buffs: PvPSideBuffs;
  stacks: PvPSideStacks;
  // v2 스킬 (v2_skill_*) — PR-4a framework. 라이브 spells.ts 와 별개. equipped 빈 배열이면 no-op.
  v2Skills: import("@/adventure/data/v2/v2Skills").V2SkillsState;
  v2SkillCooldowns: import("./combatShared").V2SkillCooldowns;
  // v2 스킬 buff slot (PR-4b). pct 정수, turns 매 attacker turn 진입 시 -1.
  // v2SelfBuffs: 이 side 가 자기에게 건 강화. v2SelfDebuffs: 상대가 이 side 에 건 약화.
  v2SelfBuffs: import("./combatShared").V2BuffMap;
  v2SelfDebuffs: import("./combatShared").V2BuffMap;
  // PR-8 — DoT (지속 피해). 상대가 이 side 에 박은 dot. 매 자기 turn 진입 시 tick → hp 차감.
  v2Dots: import("./combatShared").V2Dot[];
  berserker?: BerserkerCombatState;
};

export type PvPBattleState = {
  p1: PvPSide;
  p2: PvPSide;
  phase: PvPPhase;
  outcome: PvPOutcome | null;
  log: BattleLogEntry[];
  // 호출 표면별 최종 피해 배율. 미지정(일반 PvP)은 1, 아레나는 라우트에서 0.65를 주입한다.
  // HP 비용·자해·회복에는 사용하지 않고 상대에게 가하는 피해 경로에서만 읽는다.
  damageMultiplier?: number;
  // 호출 표면별 회복·보호막 생성 배율. 미지정(일반 PvP)은 1, 아레나는 0.65를 주입한다.
  // 직접 보호막은 이 값을 적용하고, 회복 전환 보호막은 보정된 실제 회복량을 기준으로 계산한다.
  sustainMultiplier?: number;
};

// ── 유틸 ────────────────────────────────────────────────────────────────────

export function scalePvPDamage(
  state: PvPBattleState,
  damage: number,
): number {
  if (damage <= 0) return damage;
  const multiplier = state.damageMultiplier ?? 1;
  if (multiplier === 1) return damage;
  return Math.max(1, Math.floor(damage * multiplier));
}

function scalePositivePvPValue(value: number, multiplier = 1): number {
  if (value <= 0 || multiplier === 1) return value;
  return Math.max(1, Math.floor(value * multiplier));
}

export function scalePvPHealing(
  state: PvPBattleState,
  healing: number,
): number {
  return scalePositivePvPValue(healing, state.sustainMultiplier);
}

export function scalePvPShield(
  state: PvPBattleState,
  shield: number,
): number {
  return scalePositivePvPValue(shield, state.sustainMultiplier);
}

export function effectivePvPAccuracyRating(side: PvPSide): number {
  const baseAccuracy = side.player.accRating ?? side.player.accuracyPct ?? 0;
  const accuracyDownPct =
    side.stacks.accuracyDownTurns > 0 ? side.stacks.accuracyDownPct : 0;
  return Math.max(
    0,
    baseAccuracy *
      (1 - Math.min(100, Math.max(0, accuracyDownPct)) / 100),
  );
}

export function playerPvpEvasionReductionPct(
  state: PvPBattleState,
  who: "p1" | "p2",
): number {
  const actor = state[who];
  const opponent = state[who === "p1" ? "p2" : "p1"];
  const luckEvadeBonus = actor.flags.luckyBuffActive
    ? actor.player.doubleLuck?.evade ?? 0
    : 0;
  const temporaryEvasionIncreasePct =
    luckEvadeBonus +
    (actor.player.universalLuckBonusPct ?? 0) +
    actor.buffs.cyclingChiBonus +
    (actor.stacks.skillEvasionTurns > 0 ? actor.stacks.skillEvasionPct : 0);
  const precisionMult = opponent.player.precisionEvasionMult ?? 1;
  const evasionRating = Math.max(
    0,
    (actor.player.evaRating ?? actor.player.evasionPct ?? 0) *
      precisionMult *
      (1 + Math.max(0, temporaryEvasionIncreasePct) / 100),
  );
  return pvpEvasionDamageReductionPct(
    evasionRating,
    effectivePvPAccuracyRating(opponent),
  );
}

export function mitigatePvPReflectDamage(
  state: PvPBattleState,
  recipientKey: "p1" | "p2",
  reflectorKey: "p1" | "p2",
  rawDamage: number,
): number {
  if (rawDamage <= 0) return 0;
  const recipient = state[recipientKey];
  const reflector = state[reflectorKey];
  const defMult = v2DefBuffMult(
    recipient.v2SelfBuffs,
    recipient.v2SelfDebuffs,
  );
  const effectiveDef = attackerFacingDef(reflector, recipient);
  const defenseDamage = damageBetween(
    rawDamage,
    defMult !== 1 ? Math.floor(effectiveDef * defMult) : effectiveDef,
  );
  const evasionDamage = applyEvasionDamageReduction(
    rawDamage,
    playerPvpEvasionReductionPct(state, recipientKey),
  );
  return Math.min(defenseDamage, evasionDamage);
}

// PvP 소유자 행동 시작 회복. 회복량에는 해당 전투 표면의 sustain 배율을 적용한다.
export function applyEvasionActionRecoveryPvP(
  state: PvPBattleState,
  who: "p1" | "p2",
  roll: () => number = Math.random,
): PvPBattleState {
  const actor = state[who];
  const recovery = rollEvasionActionRecovery(
    actor.player.equipSignatures,
    actor.hp,
    actor.maxHp,
    playerPvpEvasionReductionPct(state, who),
    roll,
  );
  if (!recovery) return state;
  const scaled = scalePvPHealing(state, recovery.amount);
  const nextHp = Math.min(actor.maxHp, actor.hp + scaled);
  const actual = nextHp - actor.hp;
  if (actual <= 0) return state;
  const shield = healToShield(actor.player.equipSignatures, {
    actualHeal: actual,
    calculatedHeal: scaled,
    maxHp: actor.maxHp,
  });
  let next = setSide(state, who, {
    ...actor,
    hp: nextHp,
    stacks: shield
      ? {
          ...actor.stacks,
          playerShield: actor.stacks.playerShield + shield.amount,
        }
      : actor.stacks,
  });
  next = {
    ...next,
    log: appendLog(next.log, {
      kind: "info",
      text: `[${recovery.label}] ${actor.name}의 HP +${actual}`,
      side: who,
    }),
  };
  if (shield) {
    next = {
      ...next,
      log: appendLog(next.log, {
        kind: "info",
        text: `[${shield.label}] ${actor.name} 보호막 +${shield.amount}`,
        side: who,
      }),
    };
  }
  return next;
}

// 공격자가 마주하는 방어자의 effective DEF — analysis 누적 페널티(자기 측 buffs 에 기록) 차감.
// armorPierceFraction 비례 관통 적용. 분쇄/암살/약점은 호출 측에서 별도 처리.
// 약점 노출 (attacker 측 enemyDefDebuffPct) 활성 시 위 모든 감산 후 비례 차감.
// 광기 (defender 측 playerDefDebuffPct) 활성 시 방어자 자신의 effective DEF 더 깎임.
export function attackerFacingDef(
  attacker: PvPSide,
  defender: PvPSide,
  // 발동턴 AP 시한부 버프(약점 노출 등) 적용을 위해 attacker buffs 를 별도 인자로 받을 수 있음.
  // 호출 측에서 시한부 버프가 반영된 buffs 를 전달(없으면 attacker.buffs).
  attackerBuffs: PvPSideBuffs = attacker.buffs,
): number {
  const braceDefBonus = defender.stacks.braceDefBonus ?? 0;
  const raw = Math.max(
    0,
    effectiveMutationDef(
      defender.player.def + braceDefBonus,
      defender.stacks.mutationWeight,
      defender.player.stoneskinDefPctPerWeight ?? 0,
    ) - attackerBuffs.opponentDefPenalty,
  );
  const frac = attacker.player.armorPierceFraction ?? 0;
  let afterPierce = frac > 0 ? Math.round(raw * (1 - frac)) : raw;
  const physicalReductionPct = cappedDefReductionPct(
    defender.buffs.playerDefDebuffTurnsLeft > 0
      ? defender.buffs.playerDefDebuffPct
      : 0,
    attackerBuffs.enemyDefDebuffTurnsLeft > 0
      ? attackerBuffs.enemyDefDebuffPct
      : 0,
    attacker.player.enemyPhysicalDefReductionPct ?? 0,
    sideHasDot(defender, "poison")
      ? attacker.player.poisonedEnemyDefReductionPct ?? 0
      : 0,
  );
  if (physicalReductionPct > 0) {
    afterPierce = Math.round(
      afterPierce * (1 - physicalReductionPct / 100),
    );
  }
  return Math.max(0, afterPierce);
}

// AP 지속 효과 라운드 카운터 -1. 새 attacker 페이즈 진입 시 호출.
// pct/mult 값은 그대로 두지만 turnsLeft 가 0 이면 적용 쪽에서 무시.
export function decrementTimedEffects(buffs: PvPSideBuffs): PvPSideBuffs {
  return decrementTimedBuffs(buffs);
}

// 공격자가 가하는 effective ATK — analysis 페널티는 방어자 측 buffs 에 기록 (이 사이드의 적이 나에게
// 적용한 페널티). 그래서 effectiveAtk = attacker.atk - defender.buffs.opponentAtkPenalty.
// 자신 ATK + 광기(AP 시한부 ATK 버프) — 분신·난무·반사회피 raw 추정용 헬퍼.
function attackerAtkWithMadness(attacker: PvPSide): number {
  const buffPct =
    attacker.buffs.playerAtkBuffTurnsLeft > 0 ? attacker.buffs.playerAtkBuffPct : 0;
  const bonus = buffPct > 0 ? Math.floor((attacker.player.atk * buffPct) / 100) : 0;
  return attacker.player.atk + bonus;
}

function effectiveAttackerAtk(attacker: PvPSide, defender: PvPSide): number {
  return Math.max(
    0,
    attackerAtkWithMadness(attacker) +
      attacker.buffs.rampageAtkBonus -
      defender.buffs.opponentAtkPenalty,
  );
}

function sideHasDot(side: PvPSide, tag: import("./combatShared").V2DotTag): boolean {
  return side.v2Dots.some((d) => d.tag === tag && d.stacks > 0 && d.turns > 0);
}

function skillTargetDef(attacker: PvPSide, defender: PvPSide): number {
  // 평타와 같은 방어 관통·전투 중 페널티·상시 감소·부식을 그대로 사용한다.
  // attackerFacingDef 가 부식을 이미 적용하므로 이 경로에서 다시 감산하지 않는다.
  return attackerFacingDef(attacker, defender);
}

function skillTargetMagicDef(attacker: PvPSide, defender: PvPSide): number {
  const base = defender.player.magicDef ?? defender.player.def;
  const reductionPct = cappedDefReductionPct(
    (attacker.buffs.enemyMagicDefDebuffTurnsLeft ?? 0) > 0
      ? attacker.buffs.enemyMagicDefDebuffPct ?? 0
      : 0,
    attacker.player.enemyMagicDefReductionPct ?? 0,
  );
  return reducedMagicDefense(
    base,
    reductionPct,
  );
}

function applyPoisonDamageToDots(
  dots: readonly V2SkillDotApply[],
  player: PlayerCombat,
): V2SkillDotApply[] {
  return applyPlayerPoisonDamageScaling(dots, player.poisonDamagePct);
}

export function rollPvPAttackCount(attacker: PvPSide, defender: PvPSide): number {
  const bonus = attacker.player.extraAttackChancePctWhileEnemyBleeding ?? 0;
  if (bonus <= 0 || !sideHasDot(defender, "bleed")) {
    return rollAttackCount(attacker.player);
  }
  return rollAttackCount({
    ...attacker.player,
    extraAttackChancePct: (attacker.player.extraAttackChancePct ?? 0) + bonus,
  });
}

export function applyPvPOnHitDots(
  defender: PvPSide,
  attacker: PvPSide,
  add?: {
    bleedStacks?: number;
    poisonStacks?: number;
    /** 같은 행동에서 장비 효과나 정화결계가 이미 모든 상태이상을 막은 경우. */
    blockStatus?: boolean;
  },
): PvPSide {
  if (add?.blockStatus) return defender;
  const dots: import("./combatShared").V2Dot[] = [];
  const bleedStacks =
    (add?.bleedStacks ?? 0) + (attacker.player.bleedOnHit ? 1 : 0);
  if (bleedStacks > 0) {
    dots.push(makeBleedDot({
      stacks: bleedStacks,
      flatPerStack: attacker.player.bleedOnHit?.flatPerStack ?? 0,
      sourceAtk: attacker.player.atk,
    }));
  }
  const poisonStacks =
    (add?.poisonStacks ?? 0) + (attacker.player.poisonOnHit ? 1 : 0);
  if (attacker.player.poisonOnHit && poisonStacks > 0) {
    dots.push(
      ...applyPlayerPoisonDamageScaling(
        [
          makePoisonDot({
            stacks: poisonStacks,
            pctMaxHpPerStack: attacker.player.poisonOnHit.pctMaxHpPerStack,
            sourceAtk: attacker.player.atk,
          }),
        ],
        attacker.player.poisonDamagePct,
      ),
    );
  }
  if (dots.length === 0) return defender;
  const sigStatusBlock = statusBlockOnce(defender.player.equipSignatures);
  if (sigStatusBlock && !defender.flags.statusBlockUsed) {
    return {
      ...defender,
      flags: {
        ...defender.flags,
        statusBlockUsed: true,
      },
    };
  }
  if (defender.stacks.tripleWard.purification > 0) {
    return {
      ...defender,
      stacks: {
        ...defender.stacks,
        tripleWard: consumePurificationWard(defender.stacks.tripleWard).state,
      },
    };
  }
  return {
    ...defender,
    v2Dots: applyV2DotsToTarget(defender.v2Dots, dots),
  };
}

// 사이드 갱신 헬퍼 — p1 또는 p2 슬롯에 새 사이드 객체 박기.
export function setSide(
  state: PvPBattleState,
  which: "p1" | "p2",
  next: PvPSide,
): PvPBattleState {
  return which === "p1" ? { ...state, p1: next } : { ...state, p2: next };
}

export function pvpSideDamageTakenReductionPct(side: PvPSide): number {
  const activePct =
    side.stacks.skillDmgReduceTurns > 0
      ? side.stacks.skillDmgReducePct
      : 0;
  const signaturePct = lowHpDamageReductionPct(
    side.player.equipSignatures,
    side.hp,
    side.maxHp,
  );
  return Math.max(
    0,
    (side.player.passiveDamageTakenReductionPct ?? 0) +
      activePct +
      ironWallDamageReductionPct(side.stacks.ironWallReflectCharges) +
      signaturePct,
  );
}

// 현 phase 에서 (attacker, defender) 키 결정.
export function actorKeys(phase: PvPPhase): { atkKey: "p1" | "p2"; defKey: "p1" | "p2" } {
  if (phase === "p1") return { atkKey: "p1", defKey: "p2" };
  return { atkKey: "p2", defKey: "p1" };
}

// ── 초기화 ──────────────────────────────────────────────────────────────────

function buildSide(
  player: PlayerCombat,
  name: string,
  v2Skills: import("@/adventure/data/v2/v2Skills").V2SkillsState = { learned: [], equipped: [] },
  sustainMultiplier = 1,
): PvPSide {
  const sigStartShield = battleStartShield(player.equipSignatures, player.maxHp);
  const rawStartShield =
    (player.bulwarkShield ?? 0) + (sigStartShield?.amount ?? 0);
  const startShield = scalePositivePvPValue(
    rawStartShield,
    sustainMultiplier,
  );
  const sideMaxMp = Math.max(0, player.maxMp ?? 0);
  const maxMagicBarrier = Math.max(0, player.magicBarrierMax ?? 0);
  const berserkerLineageEquipped = v2Skills.equipped.some((skillId) =>
    skillId === "v2c_berserker_bloodslash" ||
    skillId === "v2c_warlord_bloodbath" ||
    skillId === "v2c_overlord_ruin" ||
    skillId === "v2c_hegemon_annihilation",
  );
  const tripleWardRank = aggregateEquippedPassives(v2Skills.equipped)
    .tripleWardRank;
  return {
    player,
    name,
    v2Skills,
    v2SkillCooldowns: {},
    v2SelfBuffs: {},
    v2SelfDebuffs: {},
    v2Dots: [],
    hp: player.hp,
    maxHp: player.maxHp,
    mp: sideMaxMp, // 매치 시작 풀충전 (단판 모델). 토너먼트는 매치마다 다시 풀충전.
    maxMp: sideMaxMp,
    magicBarrier: maxMagicBarrier,
    maxMagicBarrier,
    ...((player.berserkerMadnessRank ?? 0) > 0 || berserkerLineageEquipped
      ? { berserker: initialBerserkerCombatState() }
      : {}),
    attacksLeft: 0, // initialBattleStatePvP 에서 선공 측만 채움
    nextTurnAttackBonus: 0,
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
      // PvP 엔진은 양쪽 player 라 enemy phase 자체가 없음 — 필드만 채워 BattleTurnState 형식 만족.
      enemyAttacksLeft: 0,
    },
    flags: {
      enduranceTriggered: false,
      assassinateUsed: false,
      luckyBuffActive: false,
      fatedChainCritPending: false,
      skillCritAfterEvadePending: false,
      statusBlockUsed: false,
    },
    buffs: {
      rampageAtkBonus: 0,
      opponentAtkPenalty: 0,
      opponentDefPenalty: 0,
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
      playerShield: startShield,
      evadesRemaining: player.guaranteedEvades ?? 0,
      damageTakenThisCombat: 0,
      weakpointDefIgnoreLeft: 0,
      braceDefBonus: 0,
      skillRegenPct: 0,
      skillRegenTurns: 0,
      skillCritPct: 0,
      skillCritTurns: 0,
      skillEvasionPct: 0,
      skillEvasionTurns: 0,
      accuracyDownPct: 0,
      accuracyDownTurns: 0,
      skillDmgReducePct: 0,
      skillDmgReduceTurns: 0,
      skillReflectBoostPct: 0,
      skillReflectBoostTurns: 0,
      enemyVulnPct: 0,
      enemyVulnTurns: 0,
      enemyMagicVulnPct: 0,
      enemyMagicVulnTurns: 0,
      healReducePct: 0,
      healReduceTurns: 0,
      damageDownPct: 0,
      damageDownTurns: 0,
      skillProcDownPct: 0,
      skillProcDownTurns: 0,
      dotVulnPct: 0,
      dotVulnTurns: 0,
      magicVulnStacks: 0,
      spellCastCount: 0,
      comboHitCount: 0,
      signatureHitCount: 0,
      signatureBonusAttacksLeft: 0,
      ...(hasTier6Unique(player.equipSignatures)
        ? { tier6Uniques: initialTier6UniqueRuntime() }
        : {}),
    },
  };
}

/** PvP의 모든 적대 피해가 공유하는 사망 극복 관문. 일반 불굴은 호출자가 뒤에서 처리한다. */
export function applyBerserkerHostileDamagePvP(
  side: PvPSide,
  hpAfterDamage: number,
): { side: PvPSide; triggered: boolean } {
  if (!side.berserker) {
    return {
      side: { ...side, hp: Math.max(0, hpAfterDamage) },
      triggered: false,
    };
  }
  const guardedHp = clampBerserkerGuardedHp(
    side.berserker,
    hpAfterDamage,
  );
  const result = applyBerserkerLethalDamage({
    state: side.berserker,
    madnessRank: side.player.berserkerMadnessRank ?? 0,
    hp: guardedHp,
    maxHp: side.maxHp,
    source: "hostile",
  });
  return {
    side: {
      ...side,
      hp: Math.max(0, result.hp),
      berserker: result.state,
    },
    triggered: result.triggered,
  };
}

function resolvePvPHostileDamageSurvival(
  side: PvPSide,
  hpAfterDamage: number,
): {
  side: PvPSide;
  berserkerTriggered: boolean;
  enduranceTriggered: boolean;
} {
  const survival = applyBerserkerHostileDamagePvP(side, hpAfterDamage);
  let nextSide = survival.side;
  const enduranceTriggered =
    nextSide.hp <= 0 &&
    !!side.player.enduranceActive &&
    !side.flags.enduranceTriggered;
  if (enduranceTriggered) {
    nextSide = {
      ...nextSide,
      hp: 1,
      flags: { ...nextSide.flags, enduranceTriggered: true },
    };
  }
  return {
    side: nextSide,
    berserkerTriggered: survival.triggered,
    enduranceTriggered,
  };
}

function appendPvPSurvivalLogs(
  state: PvPBattleState,
  key: "p1" | "p2",
  name: string,
  result: ReturnType<typeof resolvePvPHostileDamageSurvival>,
): PvPBattleState {
  let next = state;
  if (result.berserkerTriggered) {
    next = {
      ...next,
      log: appendLog(next.log, {
        kind: "info",
        text: `[사망 극복] ${name}이(가) 쓰러지지 않고 HP ${result.side.hp}로 돌아왔다.`,
        side: key,
      }),
    };
    if ((result.side.player.berserkerMadnessRank ?? 0) >= 4) {
      next = {
        ...next,
        log: appendLog(next.log, {
          kind: "info",
          text: `[패황의 지배] 다음 공격 강화 · 멸왕일도 1회 재충전.`,
          side: key,
        }),
      };
    }
  }
  if (result.enduranceTriggered) {
    next = {
      ...next,
      log: appendLog(next.log, {
        kind: "info",
        text: `[불굴] ${name} 마지막 한 숨 — HP 1 로 버텼다!`,
        side: key,
      }),
    };
  }
  return next;
}

/** 공격 시작 시점의 패황 보호만 소비하고, 반사로 새로 얻은 다음 공격 준비는 보존한다. */
export function finishPvPBerserkerAttackAction(
  state: PvPBattleState,
  key: "p1" | "p2",
  started: BerserkerCombatState | undefined,
): PvPBattleState {
  const current = state[key];
  if (!current.berserker) return state;
  let berserker = finishBerserkerCurrentActionGuard(current.berserker);
  if (
    started?.deathDamageReady ||
    started?.guardUntil === "player_attack_end"
  ) {
    berserker = finishBerserkerPlayerAttack(berserker);
  }
  return setSide(state, key, { ...current, berserker });
}

// 저수준 상태 빌더. 실제 결판은 속도 가중 추첨 결과를 initiative 로 넘긴다.
// initiative 생략 시의 SPD 비교는 직접 상태를 만드는 기존 전투 메커닉 테스트 호환용이다.
export function initialBattleStatePvP(
  p1Player: PlayerCombat,
  p2Player: PlayerCombat,
  p1Name: string,
  p2Name: string,
  p1Skills: import("@/adventure/data/v2/v2Skills").V2SkillsState = { learned: [], equipped: [] },
  p2Skills: import("@/adventure/data/v2/v2Skills").V2SkillsState = { learned: [], equipped: [] },
  damageMultiplier?: number,
  sustainMultiplier?: number,
  initiative?: PvPInitiativeActor,
): PvPBattleState {
  const normalizedDamageMultiplier =
    typeof damageMultiplier === "number" &&
    Number.isFinite(damageMultiplier) &&
    damageMultiplier > 0
      ? damageMultiplier
      : 1;
  const normalizedSustainMultiplier =
    typeof sustainMultiplier === "number" &&
    Number.isFinite(sustainMultiplier) &&
    sustainMultiplier > 0
      ? sustainMultiplier
      : 1;
  const p1Side = buildSide(
    p1Player,
    p1Name,
    p1Skills,
    normalizedSustainMultiplier,
  );
  const p2Side = buildSide(
    p2Player,
    p2Name,
    p2Skills,
    normalizedSustainMultiplier,
  );
  const resolvedInitiative =
    initiative ?? (p1Player.spd >= p2Player.spd ? "p1" : "p2");
  const p1First = resolvedInitiative === "p1";
  const phase: PvPPhase = p1First ? "p1" : "p2";
  const initiator = p1First ? p1Name : p2Name;
  const log: BattleLogEntry[] = [
    { kind: "info", text: `${p1Name} 와(과) ${p2Name} 가 마주섰다.` },
    {
      kind: "info",
      text: initiative
        ? `속도 가중 추첨 결과 — ${initiator}의 선공.`
        : `${initiator}의 선공.`,
    },
  ];
  // 선공자 첫 턴 공격 횟수 세팅 + 기습 보너스.
  const firstAttacker = p1First ? p1Side : p2Side;
  const otherSide = p1First ? p2Side : p1Side;
  const vanguardBonus = firstAttacker.player.vanguardFirstTurnBonus ?? 0;
  if (vanguardBonus > 0) {
    log.push({
      kind: "info",
      text: `[기습] ${firstAttacker.name} 첫 턴 추가 공격 ${vanguardBonus}회!`,
    });
  }
  const attackerWithCount: PvPSide = {
    ...firstAttacker,
    attacksLeft: rollPvPAttackCount(firstAttacker, otherSide) + vanguardBonus,
  };
  // 철벽 보호막 알림 — 양쪽 다 표기.
  if (p1Side.stacks.playerShield > 0) {
    log.push({
      kind: "info",
      text: `[철벽] ${p1Side.name} 보호막 ${p1Side.stacks.playerShield} 전개`,
    });
  }
  if (p2Side.stacks.playerShield > 0) {
    log.push({
      kind: "info",
      text: `[철벽] ${p2Side.name} 보호막 ${p2Side.stacks.playerShield} 전개`,
    });
  }
  if ((p1Side.maxMagicBarrier ?? 0) > 0) {
    log.push({
      kind: "info",
      text: `[마나 실드] ${p1Side.name} 내구도 ${p1Side.maxMagicBarrier ?? 0} 전개`,
    });
  }
  if ((p2Side.maxMagicBarrier ?? 0) > 0) {
    log.push({
      kind: "info",
      text: `[마나 실드] ${p2Side.name} 내구도 ${p2Side.maxMagicBarrier ?? 0} 전개`,
    });
  }
  const state: PvPBattleState = {
    p1: p1First ? attackerWithCount : otherSide,
    p2: p1First ? otherSide : attackerWithCount,
    phase,
    outcome: null,
    log,
  };
  return {
    ...state,
    ...(normalizedDamageMultiplier !== 1
      ? { damageMultiplier: normalizedDamageMultiplier }
      : {}),
    ...(normalizedSustainMultiplier !== 1
      ? { sustainMultiplier: normalizedSustainMultiplier }
      : {}),
  };
}

// ── 헬퍼 — 사이드 mutate 패턴들 ────────────────────────────────────────────

// 재생 (regen) — completedPlayerTurns 가 interval 배수일 때 HP +amount.
function applyRegen(state: PvPBattleState, key: "p1" | "p2"): PvPBattleState {
  const side = state[key];
  const r = side.player.regen;
  if (!r || r.interval <= 0 || r.amount <= 0) return state;
  if (side.turn.completedPlayerTurns === 0) return state;
  if (side.turn.completedPlayerTurns % r.interval !== 0) return state;
  if (side.hp >= side.maxHp) return state;
  // 화상(healReduce) — 재생도 회복이므로 감소. 디버프 없으면(0) byte-identical.
  const hr = side.stacks.healReduceTurns > 0 ? side.stacks.healReducePct : 0;
  const reducedAmount =
    hr > 0 ? Math.floor(r.amount * (1 - hr / 100)) : r.amount;
  const amount = scalePvPHealing(state, reducedAmount);
  const newHp = Math.min(side.maxHp, side.hp + amount);
  const actual = newHp - side.hp;
  const sigShield = healToShield(side.player.equipSignatures, {
    actualHeal: actual,
    calculatedHeal: amount,
    maxHp: side.maxHp,
  });
  let next = setSide(state, key, {
    ...side,
    hp: newHp,
    stacks: sigShield
      ? {
          ...side.stacks,
          playerShield: side.stacks.playerShield + sigShield.amount,
        }
      : side.stacks,
  });
  next = {
    ...next,
    log: appendLog(next.log, {
      kind: "info",
      text: `[재생] ${side.name}의 HP +${actual}`,
    }),
  };
  if (sigShield) {
    next = {
      ...next,
      log: appendLog(next.log, {
        kind: "info",
        text: `[${sigShield.label}] ${side.name} 보호막 +${sigShield.amount}`,
      }),
    };
  }
  return next;
}

// 부가 공격 1회 (분신/난무) — 본인 빌드로 발동시킨 추가타라 "**모든 공격**" / "**매 공격마다**"
// 효과는 함께 적용: 출혈 +1, 행운의 별 ×배수, 천명 %HP, 흡혈류 (비크리 기반만).
// 미적용: 크리/강공격/충돌파/약점적중/연참/연쇄운명/암살/AP 스킬 발동, AP +1 (페이싱 보호).
// 자동 반사(반격/가시/반사 회피) 는 별도 경로. 본 헬퍼는 engine.ts 의 dealExtraEnemyDamage 미러.
function dealExtraDamage(
  state: PvPBattleState,
  atkKey: "p1" | "p2",
  defKey: "p1" | "p2",
  baseDmg: number,
  label: string,
): PvPBattleState {
  const attacker = state[atkKey];
  const defender = state[defKey];
  const player = attacker.player;
  // 행운의 별.
  const luckyStarPct = player.luckyStarChancePct ?? 0;
  const luckyStarFires =
    luckyStarPct > 0 && Math.random() * 100 < luckyStarPct;
  const dmgAfterLuckyStar = luckyStarFires
    ? Math.floor(baseDmg * LUCKY_STAR_DAMAGE_MULT)
    : baseDmg;
  // 천명 — defender 현재 HP %. PvP 에는 boss 감산 없음.
  const decreeFires =
    (player.heavenDecreeChancePct ?? 0) > 0 &&
    Math.random() * 100 < player.heavenDecreeChancePct!;
  const decreeDmg = decreeFires
    ? Math.floor((defender.hp * HEAVEN_DECREE_HP_PCT) / 100)
    : 0;
  const rawTotalDmg = dmgAfterLuckyStar + decreeDmg;
  const barrier = resolveMagicBarrierDamage({
    rawDamage: rawTotalDmg,
    durability: defender.magicBarrier ?? 0,
    absorbPct: defender.player.magicBarrierPvpAbsorbPct,
    efficiencyPct: defender.player.magicBarrierPvpEfficiencyPct,
    eligible: true,
    mitigateBody: (bodyRawDamage) => scalePvPDamage(state, bodyRawDamage),
  });
  const totalDmg = barrier.hpBoundDamage;
  const survival = applyBerserkerHostileDamagePvP(
    { ...defender, magicBarrier: barrier.durabilityLeft },
    defender.hp - totalDmg,
  );
  let defenderAfterDamage = survival.side;
  const enduranceFires =
    defenderAfterDamage.hp <= 0 &&
    !!defender.player.enduranceActive &&
    !defender.flags.enduranceTriggered;
  if (enduranceFires) {
    defenderAfterDamage = {
      ...defenderAfterDamage,
      hp: 1,
      flags: { ...defenderAfterDamage.flags, enduranceTriggered: true },
    };
  }
  if (defenderAfterDamage.berserker) {
    defenderAfterDamage = {
      ...defenderAfterDamage,
      berserker: finishBerserkerCurrentActionGuard(
        defenderAfterDamage.berserker,
      ),
    };
  }
  let nextLog = state.log;
  for (const entry of magicBarrierCombatLogEntries(barrier)) {
    nextLog = appendLog(nextLog, { ...entry, side: defKey });
  }
  state = { ...state, log: nextLog };
  // 흡혈류 — 비크리 기반만 (luckyLifesteal / runeLifesteal / 흡령).
  const luckyLifestealHeal =
    (player.luckyLifestealPct ?? 0) > 0
      ? Math.floor((rawTotalDmg * player.luckyLifestealPct!) / 100)
      : 0;
  const runeLifestealHeal =
    (player.runeLifestealPct ?? 0) > 0
      ? Math.floor((rawTotalDmg * player.runeLifestealPct!) / 100)
      : 0;
  const apLifestealHeal =
    attacker.buffs.playerLifestealTurnsLeft > 0 &&
    attacker.buffs.playerLifestealPct > 0
      ? Math.floor((rawTotalDmg * attacker.buffs.playerLifestealPct) / 100)
      : 0;
  const totalHeal = scalePvPHealing(
    state,
    luckyLifestealHeal + runeLifestealHeal + apLifestealHeal,
  );
  const newAtkHp =
    totalHeal > 0 ? Math.min(attacker.maxHp, attacker.hp + totalHeal) : attacker.hp;
  const actualHeal = newAtkHp - attacker.hp;
  const dmgLabels: string[] = [label];
  if (luckyStarFires) dmgLabels.push("행운의 별");
  if (decreeFires) dmgLabels.push("천명");

  let next = setSide(
    state,
    defKey,
    applyPvPOnHitDots(defenderAfterDamage, attacker),
  );
  next = setSide(next, atkKey, {
    ...next[atkKey],
    hp: newAtkHp,
  });
  next = {
    ...next,
    log: appendLog(next.log, {
      kind: "player_attack",
      text: `[${dmgLabels.join(" + ")}] ${totalDmg} 피해를 입혔다.`,
    }),
  };
  if (survival.triggered) {
    next = {
      ...next,
      log: appendLog(next.log, {
        kind: "info",
        text: `[사망 극복] ${defender.name}이(가) 쓰러지지 않고 HP ${defenderAfterDamage.hp}로 돌아왔다.`,
        side: defKey,
      }),
    };
    if ((defender.player.berserkerMadnessRank ?? 0) >= 4) {
      next = {
        ...next,
        log: appendLog(next.log, {
          kind: "info",
          text: `[패황의 지배] 다음 공격 강화 · 멸왕일도 1회 재충전.`,
          side: defKey,
        }),
      };
    }
  }
  if (enduranceFires) {
    next = {
      ...next,
      log: appendLog(next.log, {
        kind: "info",
        text: `[불굴] ${defender.name} 마지막 한 숨 — HP 1 로 버텼다!`,
        side: defKey,
      }),
    };
  }
  if (actualHeal > 0) {
    const healLabels: string[] = [];
    if (luckyLifestealHeal > 0) healLabels.push("행운의 흡혈");
    if (runeLifestealHeal > 0) healLabels.push("흡혈의 룬");
    if (apLifestealHeal > 0) healLabels.push("흡령");
    next = {
      ...next,
      log: appendLog(next.log, {
        kind: "info",
        text: `[${healLabels.join(" + ")}] ${attacker.name}의 HP +${actualHeal}`,
      }),
    };
  }
  if (defenderAfterDamage.hp <= 0) {
    next = {
      ...next,
      log: appendLog(next.log, {
        kind: "info",
        text: `${defender.name}이(가) 쓰러졌다.`,
      }),
      phase: "ended",
      outcome: atkKey === "p1" ? "p1_win" : "p2_win",
    };
  }
  return next;
}

// ── 방어자 측 dodge 헬퍼 ────────────────────────────────────────────────────

// dodge 한 번에 발생하는 효과들 — 곡예(힐) → 보장 회피 소비(옵션) → 무한 가시 + 반사 회피
// → 반격(counterAtkBonus) → 유격(skirmishNextTurnBonus 누적). 어느 단계에서 공격자가 죽으면
// phase=ended 로 종료. 호출 측은 ended 여부 확인 후 attacksLeft 차감 또는 phase 종료를 결정.
function applyDodgeEffects(
  state: PvPBattleState,
  atkKey: "p1" | "p2",
  defKey: "p1" | "p2",
  dodgeLogText: string,
  consumeEvade: boolean,
  triggersSkillCritAfterEvade: boolean,
): PvPBattleState {
  const berserkerAtAttackStart = state[atkKey].berserker;
  let st: PvPBattleState = {
    ...state,
    log: appendLog(state.log, { kind: "info", text: dodgeLogText }),
  };
  if (st[defKey].stacks.tier6Uniques) {
    st = applyTier6UniquePvpEvent(st, defKey, atkKey, {
      kind: "dodge",
      origin: {
        actionId: st[defKey].turn.completedPlayerTurns + 1,
        eventId: st.log.length,
      },
    });
  }
  if (st.phase === "ended") return st;
  const defenderAfterDodge = st[defKey];
  if (
    triggersSkillCritAfterEvade &&
    defenderAfterDodge.player.skillCritAfterEvade &&
    !defenderAfterDodge.flags.skillCritAfterEvadePending
  ) {
    st = setSide(st, defKey, {
      ...defenderAfterDodge,
      flags: {
        ...defenderAfterDodge.flags,
        skillCritAfterEvadePending: true,
      },
    });
    st = {
      ...st,
      log: appendLog(st.log, {
        kind: "info",
        text: `[흑월지배] ${defenderAfterDodge.name}의 다음 직접 피해 스킬 치명타 준비.`,
        side: defKey,
      }),
    };
  }
  // 곡예 — 회피 성공 시 HP +amount. 장비의 회피 경감 연동 회복은 소유자 행동 시작에 판정한다.
  const defForHeal = st[defKey];
  const evadeHeal = scalePvPHealing(
    st,
    defForHeal.player.evadeHealAmount ?? 0,
  );
  if (evadeHeal > 0 && defForHeal.hp < defForHeal.maxHp) {
    const newHp = Math.min(defForHeal.maxHp, defForHeal.hp + evadeHeal);
    const actual = newHp - defForHeal.hp;
    const sigShield = healToShield(defForHeal.player.equipSignatures, {
      actualHeal: actual,
      calculatedHeal: evadeHeal,
      maxHp: defForHeal.maxHp,
    });
    st = setSide(st, defKey, {
      ...defForHeal,
      hp: newHp,
      stacks: sigShield
        ? {
            ...defForHeal.stacks,
            playerShield: defForHeal.stacks.playerShield + sigShield.amount,
          }
        : defForHeal.stacks,
    });
    st = {
      ...st,
      log: appendLog(st.log, {
        kind: "info",
        text: `[곡예] ${defForHeal.name}의 HP +${actual}`,
      }),
    };
    if (sigShield) {
      st = {
        ...st,
        log: appendLog(st.log, {
          kind: "info",
          text: `[${sigShield.label}] ${defForHeal.name} 보호막 +${sigShield.amount}`,
        }),
      };
    }
  }
  // on-dodge 속도 버프(Phase 2) — 회피 성공 시 방어자 속도↑(Math.max 로 기존 버프 미감소).
  //   미발동=불변 → byte-identical.
  const sigDodgeSpd = onDodgeSpeedBuff(st[defKey].player.equipSignatures);
  if (sigDodgeSpd) {
    const d = st[defKey];
    const activeMult =
      d.buffs.playerSpdTurnsLeft > 0 ? d.buffs.playerSpdMult : 1;
    st = setSide(st, defKey, {
      ...d,
      buffs: {
        ...d.buffs,
        playerSpdMult: Math.max(activeMult, sigDodgeSpd.mult),
        playerSpdTurnsLeft: Math.max(
          d.buffs.playerSpdTurnsLeft,
          sigDodgeSpd.turns,
        ),
      },
    });
    st = {
      ...st,
      log: appendLog(st.log, {
        kind: "info",
        text: `[${sigDodgeSpd.label}] ${d.name}의 속도 +${Math.round((sigDodgeSpd.mult - 1) * 100)}% (${sigDodgeSpd.turns}행동)`,
        side: defKey,
      }),
    };
  }
  // 보장 회피 소비 (회피 강화 분기에서만).
  if (consumeEvade) {
    const d = st[defKey];
    if (d.stacks.evadesRemaining > 0) {
      st = setSide(st, defKey, {
        ...d,
        stacks: {
          ...d.stacks,
          evadesRemaining: d.stacks.evadesRemaining - 1,
        },
      });
    }
  }
  // 무한 가시 + 반사 회피 — 적 ATK 기반 / 추정 raw 데미지 기반 원량을 구한 뒤
  // 공격자의 방어력을 적용한다.
  const attackerNow = st[atkKey];
  const defenderNow = st[defKey];
  const infiniteThornsPct = defenderNow.player.infiniteThornsAtkPct ?? 0;
  const infiniteThornsDmg =
    infiniteThornsPct > 0
      ? Math.floor((attackerNow.player.atk * infiniteThornsPct) / 100)
      : 0;
  const reflexEvadeMult = defenderNow.player.reflexEvadeMult ?? 0;
  // PR-5a: v2 buff/debuff 격리 해제 — 반사 회피 추정도 일관 적용.
  // attackerNow 가 공격자, defenderNow 가 방어자.
  const v2AtkMultR = v2AtkBuffMult(attackerNow.v2SelfBuffs, attackerNow.v2SelfDebuffs);
  const v2DefMultR = v2DefBuffMult(defenderNow.v2SelfBuffs, defenderNow.v2SelfDebuffs);
  const estimatedRawDmg =
    reflexEvadeMult > 0
      ? damageBetween(
          v2AtkMultR !== 1
            ? Math.floor(effectiveAttackerAtk(attackerNow, defenderNow) * v2AtkMultR)
            : effectiveAttackerAtk(attackerNow, defenderNow),
          v2DefMultR !== 1
            ? Math.floor(defenderNow.player.def * v2DefMultR)
            : defenderNow.player.def,
        )
      : 0;
  const reflexEvadeDmg =
    reflexEvadeMult > 0 ? Math.floor(estimatedRawDmg * reflexEvadeMult) : 0;
  const rawReflect = infiniteThornsDmg + reflexEvadeDmg;
  if (rawReflect > 0) {
    const barrier = resolveMagicBarrierDamage({
      rawDamage: rawReflect,
      durability: attackerNow.magicBarrier ?? 0,
      absorbPct: attackerNow.player.magicBarrierPvpAbsorbPct,
      efficiencyPct: attackerNow.player.magicBarrierPvpEfficiencyPct,
      eligible: true,
      mitigateBody: (bodyRawDamage) =>
        scalePvPDamage(
          st,
          mitigatePvPReflectDamage(st, atkKey, defKey, bodyRawDamage),
        ),
    });
    const totalReflect = barrier.hpBoundDamage;
    const survival = resolvePvPHostileDamageSurvival(
      { ...attackerNow, magicBarrier: barrier.durabilityLeft },
      attackerNow.hp - totalReflect,
    );
    st = setSide(st, atkKey, survival.side);
    for (const entry of magicBarrierCombatLogEntries(barrier)) {
      st = {
        ...st,
        log: appendLog(st.log, { ...entry, side: atkKey }),
      };
    }
    const labels: string[] = [];
    if (infiniteThornsDmg > 0) labels.push("무한 가시");
    if (reflexEvadeDmg > 0) labels.push("반사 회피");
    st = {
      ...st,
      log: appendLog(st.log, {
        kind: "player_attack",
        text: `[${labels.join(" + ")}] ${attackerNow.name}에게 ${totalReflect} 반사 피해.`,
      }),
    };
    st = appendPvPSurvivalLogs(st, atkKey, attackerNow.name, survival);
    if (survival.side.hp <= 0) {
      return {
        ...st,
        log: appendLog(st.log, {
          kind: "info",
          text: `${attackerNow.name}이(가) 쓰러졌다.`,
        }),
        phase: "ended",
        outcome: defKey === "p1" ? "p1_win" : "p2_win",
      };
    }
  }
  // 반격 (counterAtkBonus) — 회피 성공 시 ATK + bonus 데미지로 카운터 1회.
  const attackerAfterReflect = st[atkKey];
  const counterBonus = defenderNow.player.counterAtkBonus ?? 0;
  if (counterBonus > 0) {
    // PR-5a: 반격도 v2 buff/debuff 격리 해제. defender 가 공격자, attacker 가 방어자 (반격 방향).
    const v2AtkMultCt = v2AtkBuffMult(defenderNow.v2SelfBuffs, defenderNow.v2SelfDebuffs);
    const v2DefMultCt = v2DefBuffMult(
      attackerAfterReflect.v2SelfBuffs,
      attackerAfterReflect.v2SelfDebuffs,
    );
    const counterRawAtk = defenderNow.player.atk + counterBonus;
    const counterAttack =
      v2AtkMultCt !== 1
        ? Math.floor(counterRawAtk * v2AtkMultCt)
        : counterRawAtk;
    const counterDefense =
      v2DefMultCt !== 1
        ? Math.floor(attackerAfterReflect.player.def * v2DefMultCt)
        : attackerAfterReflect.player.def;
    const barrier = resolveMagicBarrierDamage({
      rawDamage: counterAttack,
      durability: attackerAfterReflect.magicBarrier ?? 0,
      absorbPct: attackerAfterReflect.player.magicBarrierPvpAbsorbPct,
      efficiencyPct: attackerAfterReflect.player.magicBarrierPvpEfficiencyPct,
      eligible: true,
      mitigateBody: (bodyRawDamage) =>
        scalePvPDamage(st, damageBetween(bodyRawDamage, counterDefense)),
    });
    const counterDmg = barrier.hpBoundDamage;
    const survival = resolvePvPHostileDamageSurvival(
      {
        ...attackerAfterReflect,
        magicBarrier: barrier.durabilityLeft,
      },
      attackerAfterReflect.hp - counterDmg,
    );
    st = setSide(st, atkKey, survival.side);
    for (const entry of magicBarrierCombatLogEntries(barrier)) {
      st = {
        ...st,
        log: appendLog(st.log, { ...entry, side: atkKey }),
      };
    }
    st = {
      ...st,
      log: appendLog(st.log, {
        kind: "player_attack",
        text: `[반격] ${attackerAfterReflect.name}에게 ${counterDmg} 피해.`,
      }),
    };
    st = appendPvPSurvivalLogs(
      st,
      atkKey,
      attackerAfterReflect.name,
      survival,
    );
    if (survival.side.hp <= 0) {
      return {
        ...st,
        log: appendLog(st.log, {
          kind: "info",
          text: `${attackerAfterReflect.name}이(가) 쓰러졌다.`,
        }),
        phase: "ended",
        outcome: defKey === "p1" ? "p1_win" : "p2_win",
      };
    }
  }
  // 유격 — 회피 성공 시 다음 자기 페이즈 공격 횟수 +N (nextTurnAttackBonus 에 누적).
  const skirmishBonus = defenderNow.player.skirmishNextTurnBonus ?? 0;
  if (skirmishBonus > 0) {
    const d = st[defKey];
    st = setSide(st, defKey, {
      ...d,
      nextTurnAttackBonus: d.nextTurnAttackBonus + skirmishBonus,
    });
  }
  return finishPvPBerserkerAttackAction(
    st,
    atkKey,
    berserkerAtAttackStart,
  );
}

// shadowStep dodge — 한 페이즈 통째로 회피 + dodge 효과 + 페이즈 종료.
export function applyShadowStepDodge(
  state: PvPBattleState,
  atkKey: "p1" | "p2",
  defKey: "p1" | "p2",
  phaseEndOptions: PvPPhaseEndOptions = {},
): PvPBattleState {
  const defender = state[defKey];
  const dodged = applyDodgeEffects(
    state,
    atkKey,
    defKey,
    `[그림자 보법] ${defender.name}이(가) 모든 공격을 그림자처럼 흘려보냈다!`,
    false,
    true,
  );
  if (dodged.phase === "ended") return dodged;
  return endAttackerPhase(dodged, atkKey, defKey, phaseEndOptions);
}

// per-attack dodge — dodge 효과 + 공격 횟수 1 차감. attacksLeft 0 이면 페이즈 종료.
export function applyPerAttackDodge(
  state: PvPBattleState,
  atkKey: "p1" | "p2",
  defKey: "p1" | "p2",
  logText: string,
  consumeEvade: boolean,
  triggersSkillCritAfterEvade = true,
  phaseEndOptions: PvPPhaseEndOptions = {},
): PvPBattleState {
  const dodged = applyDodgeEffects(
    state,
    atkKey,
    defKey,
    logText,
    consumeEvade,
    triggersSkillCritAfterEvade,
  );
  if (dodged.phase === "ended") return dodged;
  const attacker = dodged[atkKey];
  const newAttacksLeft = attacker.attacksLeft - 1;
  if (newAttacksLeft > 0) {
    return setSide(dodged, atkKey, {
      ...attacker,
      attacksLeft: newAttacksLeft,
      turn: { ...attacker.turn, firstAttackPending: false },
    });
  }
  return endAttackerPhase(dodged, atkKey, defKey, phaseEndOptions);
}

// 데미지 적중 시 반사 (반사 갑주 + 가시 갑옷 + 무한 가시). 공격자가 죽으면 attackerKilled=true.
// 반사 갑주/가시 갑옷 베이스는 공격자가 넣은 피해(결의/가드/굳건/철벽 감산 전, 모든 공격 보너스 후) —
// 탱커 빌드가 막으면서 동시에 반사할 수 있도록. 산정된 원량에는 공격자의 방어력을 적용한다.
export function applyOnHitReflect(
  state: PvPBattleState,
  atkKey: "p1" | "p2",
  defKey: "p1" | "p2",
  rawDmgBeforeMitigation: number,
  finishCurrentAction = true,
  fortressOnly = false,
): { state: PvPBattleState; attackerKilled: boolean } {
  const attacker = state[atkKey];
  const defender = state[defKey];
  const thornsPct = defender.player.thornsPct ?? 0;
  const thornsDmg =
    thornsPct > 0
      ? Math.floor((rawDmgBeforeMitigation * thornsPct) / 100)
      : 0;
  const bramblePct = defender.player.bramblePct ?? 0;
  const brambleDmg =
    bramblePct > 0
      ? Math.floor((rawDmgBeforeMitigation * bramblePct) / 100)
      : 0;
  const infinitePct = defender.player.infiniteThornsAtkPct ?? 0;
  const infiniteDmg =
    infinitePct > 0 ? Math.floor((attacker.player.atk * infinitePct) / 100) : 0;
  // 수호자 반사 — 피격(적중) 시 전투 시작 방어력 기반 데미지("방어 계수만큼").
  // 강체로 누적된 방어와 전투 중 VIT 버프는 생존에만 적용하고 반사 원량에는 더하지 않는다.
  // PvE의 thornsFlatFromDef 경로와 같은 기준이며, 시작 원량이 없는 구 전투 데이터만
  // 시작 방어력과 계수로 복원한다.
  const thornsDefPct = defender.player.thornsDefPct ?? 0;
  const wardenReflectDmg =
    rawDmgBeforeMitigation > 0
      ? (defender.player.thornsFlatFromDef ??
        (thornsDefPct > 0
          ? Math.floor((defender.player.def * thornsDefPct) / 100)
          : 0))
      : 0;
  const baseTotal = fortressOnly
    ? 0
    : thornsDmg + brambleDmg + infiniteDmg + wardenReflectDmg;
  const fortressReaction = resolveFortressReaction({
    landed: rawDmgBeforeMitigation > 0,
    defenderDef: effectiveMutationDef(
      defender.player.def,
      defender.stacks.mutationWeight,
      defender.player.stoneskinDefPctPerWeight ?? 0,
    ),
    impact: defender.stacks.fortressImpact,
    impactOnHit: defender.player.fortressImpactOnHit ?? false,
    ironWallReflectCharges: defender.stacks.ironWallReflectCharges,
  });
  const reactiveDefenseCharges = consumeReactiveDefenseCharges(
    {
      evasion: defender.stacks.skillEvasionTurns,
      damageReduction: defender.stacks.skillDmgReduceTurns,
      reflect: defender.stacks.skillReflectBoostTurns,
    },
    {
      evasionUsed: defender.stacks.skillEvasionTurns > 0,
      landed: rawDmgBeforeMitigation > 0,
      reflectEligible: baseTotal > 0,
    },
  );
  const reflectBoostPct =
    defender.stacks.skillReflectBoostTurns > 0
      ? defender.stacks.skillReflectBoostPct
      : 0;
  const boostedBaseTotal =
    reflectBoostPct > 0
      ? Math.floor(baseTotal * (1 + reflectBoostPct / 100))
      : baseTotal;
  const rawTotal = boostedBaseTotal + fortressReaction.rawReflectDamage;
  let reactedState = setSide(state, defKey, {
    ...defender,
    stacks: {
      ...defender.stacks,
      skillEvasionTurns: reactiveDefenseCharges.evasion,
      skillDmgReduceTurns: reactiveDefenseCharges.damageReduction,
      skillReflectBoostTurns: reactiveDefenseCharges.reflect,
      fortressImpact: fortressReaction.impact,
      ironWallReflectCharges: fortressReaction.ironWallReflectCharges,
    },
  });
  if (fortressReaction.impact > defender.stacks.fortressImpact) {
    reactedState = {
      ...reactedState,
      log: appendLog(reactedState.log, {
        kind: "info",
        text: `[충격 방벽] ${defender.name} 충격 +1 (현재 ${fortressReaction.impact}/3)`,
        side: defKey,
      }),
    };
  }
  if (fortressReaction.ironWallReflected) {
    reactedState = {
      ...reactedState,
      log: appendLog(reactedState.log, {
        kind: "info",
        text: `[철벽 태세] ${defender.name} 철벽 반사 ${fortressReaction.ironWallReflectCharges}회 남음`,
        side: defKey,
      }),
    };
  }
  if (rawTotal <= 0) {
    return { state: reactedState, attackerKilled: false };
  }
  const barrier = resolveMagicBarrierDamage({
    rawDamage: rawTotal,
    durability: attacker.magicBarrier ?? 0,
    absorbPct: attacker.player.magicBarrierPvpAbsorbPct,
    efficiencyPct: attacker.player.magicBarrierPvpEfficiencyPct,
    eligible: true,
    mitigateBody: (bodyRawDamage) =>
      scalePvPDamage(
        reactedState,
        mitigatePvPReflectDamage(reactedState, atkKey, defKey, bodyRawDamage),
      ),
  });
  const shieldAbsorbed = Math.min(
    attacker.stacks.playerShield,
    barrier.hpBoundDamage,
  );
  const dmgToHp = barrier.hpBoundDamage - shieldAbsorbed;
  const newShield = attacker.stacks.playerShield - shieldAbsorbed;
  const hpAfterReflect = Math.max(0, attacker.hp - dmgToHp);
  const survival = applyBerserkerHostileDamagePvP(
    {
      ...attacker,
      magicBarrier: barrier.durabilityLeft,
      stacks: {
        ...attacker.stacks,
        playerShield: newShield,
      },
    },
    hpAfterReflect,
  );
  let nextAttacker = survival.side;
  const enduranceFires =
    nextAttacker.hp <= 0 &&
    !!attacker.player.enduranceActive &&
    !attacker.flags.enduranceTriggered;
  if (enduranceFires) {
    nextAttacker = {
      ...nextAttacker,
      hp: 1,
      flags: { ...nextAttacker.flags, enduranceTriggered: true },
    };
  }
  if (finishCurrentAction && nextAttacker.berserker) {
    nextAttacker = {
      ...nextAttacker,
      berserker: finishBerserkerCurrentActionGuard(nextAttacker.berserker),
    };
  }
  let st = setSide(reactedState, atkKey, {
    ...nextAttacker,
  });
  const labels: string[] = [];
  if (thornsDmg > 0) labels.push("반사 갑주");
  if (brambleDmg > 0) labels.push("가시 갑옷");
  if (infiniteDmg > 0) labels.push("무한 가시");
  if (wardenReflectDmg > 0) labels.push("수호 반사");
  if (reflectBoostPct > 0) labels.push("반사 증폭");
  if (fortressReaction.ironWallReflected) labels.push("철벽 반사");
  if (shieldAbsorbed > 0) {
    st = {
      ...st,
      log: appendLog(st.log, {
        kind: "info",
        text: `[철벽] ${attacker.name} 보호막이 반사 피해 ${shieldAbsorbed} 흡수 (남은 ${newShield})`,
      }),
    };
  }
  for (const entry of magicBarrierCombatLogEntries(barrier)) {
    st = {
      ...st,
      log: appendLog(st.log, { ...entry, side: atkKey }),
    };
  }
  st = {
    ...st,
    log: appendLog(st.log, {
      kind: "player_attack",
      text: `[${labels.join(" + ")}] ${attacker.name}에게 ${dmgToHp} 반사 피해.`,
    }),
  };
  if (survival.triggered) {
    st = {
      ...st,
      log: appendLog(st.log, {
        kind: "info",
        text: `[사망 극복] ${attacker.name}이(가) 쓰러지지 않고 HP ${nextAttacker.hp}로 돌아왔다.`,
        side: atkKey,
      }),
    };
    if ((attacker.player.berserkerMadnessRank ?? 0) >= 4) {
      st = {
        ...st,
        log: appendLog(st.log, {
          kind: "info",
          text: `[패황의 지배] 다음 공격 강화 · 멸왕일도 1회 재충전.`,
          side: atkKey,
        }),
      };
    }
  }
  if (enduranceFires) {
    st = {
      ...st,
      log: appendLog(st.log, {
        kind: "info",
        text: `[불굴] ${attacker.name} 마지막 한 숨 — HP 1 로 버텼다!`,
        side: atkKey,
      }),
    };
  }
  if (nextAttacker.hp <= 0) {
    st = {
      ...st,
      log: appendLog(st.log, {
        kind: "info",
        text: `${attacker.name}이(가) 쓰러졌다.`,
      }),
      phase: "ended",
      outcome: defKey === "p1" ? "p1_win" : "p2_win",
    };
    return { state: st, attackerKilled: true };
  }
  return { state: st, attackerKilled: false };
}

// 반격의 룬 — 피격 후 일정 확률로 카운터 1회 (ATK 데미지). 공격자가 죽으면 attackerKilled=true.
export function maybeApplyRuneCounter(
  state: PvPBattleState,
  atkKey: "p1" | "p2",
  defKey: "p1" | "p2",
  finishCurrentAction = true,
): { state: PvPBattleState; attackerKilled: boolean } {
  const defender = state[defKey];
  const attacker = state[atkKey];
  const pct = defender.player.runeCounterChancePct ?? 0;
  if (pct <= 0 || Math.random() * 100 >= pct) {
    return { state, attackerKilled: false };
  }
  // PR-5a: 룬 반격도 v2 buff/debuff 격리 해제. defender 공격자, attacker 방어자.
  const v2AtkMultRC = v2AtkBuffMult(defender.v2SelfBuffs, defender.v2SelfDebuffs);
  const v2DefMultRC = v2DefBuffMult(attacker.v2SelfBuffs, attacker.v2SelfDebuffs);
  const rcAtk = effectiveAttackerAtk(defender, attacker);
  const rcDef = attackerFacingDef(defender, attacker);
  const counterAttack =
    v2AtkMultRC !== 1 ? Math.floor(rcAtk * v2AtkMultRC) : rcAtk;
  const counterDefense =
    v2DefMultRC !== 1 ? Math.floor(rcDef * v2DefMultRC) : rcDef;
  const barrier = resolveMagicBarrierDamage({
    rawDamage: counterAttack,
    durability: attacker.magicBarrier ?? 0,
    absorbPct: attacker.player.magicBarrierPvpAbsorbPct,
    efficiencyPct: attacker.player.magicBarrierPvpEfficiencyPct,
    eligible: true,
    mitigateBody: (bodyRawDamage) =>
      scalePvPDamage(state, damageBetween(bodyRawDamage, counterDefense)),
  });
  const dmg = barrier.hpBoundDamage;
  const survival = resolvePvPHostileDamageSurvival(
    { ...attacker, magicBarrier: barrier.durabilityLeft },
    attacker.hp - dmg,
  );
  if (finishCurrentAction && survival.side.berserker) {
    survival.side = {
      ...survival.side,
      berserker: finishBerserkerCurrentActionGuard(
        survival.side.berserker,
      ),
    };
  }
  let st = setSide(state, atkKey, survival.side);
  for (const entry of magicBarrierCombatLogEntries(barrier)) {
    st = {
      ...st,
      log: appendLog(st.log, { ...entry, side: atkKey }),
    };
  }
  st = {
    ...st,
    log: appendLog(st.log, {
      kind: "player_attack",
      text: `[반격의 룬] ${attacker.name}에게 ${dmg} 반격 피해.`,
    }),
  };
  st = appendPvPSurvivalLogs(st, atkKey, attacker.name, survival);
  if (survival.side.hp <= 0) {
    st = {
      ...st,
      log: appendLog(st.log, {
        kind: "info",
        text: `${attacker.name}이(가) 쓰러졌다.`,
      }),
      phase: "ended",
      outcome: defKey === "p1" ? "p1_win" : "p2_win",
    };
    return { state: st, attackerKilled: true };
  }
  return { state: st, attackerKilled: false };
}

// 무도가/절정 반격 패시브 — 피격 후 일정 확률로 ATK 카운터(반격의 룬과 동일 패턴·별개 누적). PvE
//   enemyPhase 의 passiveCounterChancePct 카운터를 PvP 로 미러. pct 0 이면 RNG 미소비(byte-identical).
export function maybeApplyMartialCounter(
  state: PvPBattleState,
  atkKey: "p1" | "p2",
  defKey: "p1" | "p2",
  finishCurrentAction = true,
): { state: PvPBattleState; attackerKilled: boolean } {
  const defender = state[defKey];
  const attacker = state[atkKey];
  const pct = defender.player.passiveCounterChancePct ?? 0;
  if (pct <= 0 || Math.random() * 100 >= pct) {
    return { state, attackerKilled: false };
  }
  // 반격 데미지도 v2 buff/debuff 격리 해제. defender 가 공격자, attacker 가 방어자(반격 방향).
  const v2AtkMultMC = v2AtkBuffMult(defender.v2SelfBuffs, defender.v2SelfDebuffs);
  const v2DefMultMC = v2DefBuffMult(attacker.v2SelfBuffs, attacker.v2SelfDebuffs);
  const mcAtk = effectiveAttackerAtk(defender, attacker);
  const mcDef = attackerFacingDef(defender, attacker);
  const counterBoostPct =
    defender.player.passiveCounterDamageUsesReflectBoost &&
    defender.stacks.skillReflectBoostTurns > 0
      ? defender.stacks.skillReflectBoostPct
      : 0;
  const counterAtk = v2AtkMultMC !== 1 ? Math.floor(mcAtk * v2AtkMultMC) : mcAtk;
  const boostedCounterAtk =
    counterBoostPct > 0
      ? Math.floor(counterAtk * (1 + counterBoostPct / 100))
      : counterAtk;
  const counterDefense =
    v2DefMultMC !== 1 ? Math.floor(mcDef * v2DefMultMC) : mcDef;
  const barrier = resolveMagicBarrierDamage({
    rawDamage: boostedCounterAtk,
    durability: attacker.magicBarrier ?? 0,
    absorbPct: attacker.player.magicBarrierPvpAbsorbPct,
    efficiencyPct: attacker.player.magicBarrierPvpEfficiencyPct,
    eligible: true,
    mitigateBody: (bodyRawDamage) =>
      scalePvPDamage(state, damageBetween(bodyRawDamage, counterDefense)),
  });
  const dmg = barrier.hpBoundDamage;
  const survival = resolvePvPHostileDamageSurvival(
    { ...attacker, magicBarrier: barrier.durabilityLeft },
    attacker.hp - dmg,
  );
  if (finishCurrentAction && survival.side.berserker) {
    survival.side = {
      ...survival.side,
      berserker: finishBerserkerCurrentActionGuard(
        survival.side.berserker,
      ),
    };
  }
  let st = setSide(state, atkKey, survival.side);
  for (const entry of magicBarrierCombatLogEntries(barrier)) {
    st = {
      ...st,
      log: appendLog(st.log, { ...entry, side: atkKey }),
    };
  }
  st = {
    ...st,
    log: appendLog(st.log, {
      kind: "player_attack",
      text: `[${counterBoostPct > 0 ? "반격 + 금강인" : "반격"}] ${attacker.name}에게 ${dmg} 반격 피해.`,
    }),
  };
  st = appendPvPSurvivalLogs(st, atkKey, attacker.name, survival);
  if (survival.side.hp <= 0) {
    st = {
      ...st,
      log: appendLog(st.log, {
        kind: "info",
        text: `${attacker.name}이(가) 쓰러졌다.`,
      }),
      phase: "ended",
      outcome: defKey === "p1" ? "p1_win" : "p2_win",
    };
    return { state: st, attackerKilled: true };
  }
  return { state: st, attackerKilled: false };
}

// 공격 턴 종료 후 처리 — 그림자 분신 → 무피해 난무 → 막다른 격노 → 약점 분석 → 재생.
// PvE 의 finishPlayerTurn 미러.
function finishAttackerTurn(
  state: PvPBattleState,
  atkKey: "p1" | "p2",
  defKey: "p1" | "p2",
  allowOffensiveFollowups = true,
): PvPBattleState {
  let st = state;
  const attacker = st[atkKey];
  // PR-5a: 분신·난무 모두 v2 buff/debuff 격리 해제 적용. PvP 는 매 호출마다 atk/def state 가
  // 바뀔 수 있어 (dealExtraDamage 가 hp 만 변경하므로 buff/debuff map 은 보존) 안전.
  const applyV2AtkPvP = (rawAtk: number, atkSide: PvPSide): number => {
    const m = v2AtkBuffMult(atkSide.v2SelfBuffs, atkSide.v2SelfDebuffs);
    return m !== 1 ? Math.floor(rawAtk * m) : rawAtk;
  };
  const applyV2DefPvP = (rawDef: number, defSide: PvPSide): number => {
    const m = v2DefBuffMult(defSide.v2SelfBuffs, defSide.v2SelfDebuffs);
    return m !== 1 ? Math.floor(rawDef * m) : rawDef;
  };
  // 그림자 분신 + 6티어 군단.
  const clonePct = attacker.player.shadowCloneAtkPct ?? 0;
  const cloneExtra = attacker.player.shadowLegionExtraClones ?? 0;
  const cloneCount = clonePct > 0 ? 1 + cloneExtra : 0;
  if (allowOffensiveFollowups && st.phase !== "ended" && cloneCount > 0) {
    for (let i = 0; i < cloneCount; i += 1) {
      if (st.phase === "ended") break;
      const atk = st[atkKey];
      const def = st[defKey];
      const cloneDmg = damageBetween(
        applyV2AtkPvP(Math.floor((attackerAtkWithMadness(atk) * clonePct) / 100), atk),
        applyV2DefPvP(attackerFacingDef(atk, def), def),
      );
      st = dealExtraDamage(
        st,
        atkKey,
        defKey,
        cloneDmg,
        cloneExtra > 0 ? "그림자 군단" : "그림자 분신",
      );
    }
  }
  // 무피해 난무.
  const attackerAfter = st[atkKey];
  const flurry = attackerAfter.player.flurryAttacks ?? 0;
  if (
    allowOffensiveFollowups &&
    st.phase !== "ended" &&
    flurry > 0 &&
    attackerAfter.stacks.damageTakenThisCombat === 0
  ) {
    for (let i = 0; i < flurry; i += 1) {
      if (st.phase === "ended") break;
      const atk = st[atkKey];
      const def = st[defKey];
      const fd = damageBetween(
        applyV2AtkPvP(effectiveAttackerAtk(atk, def), atk),
        applyV2DefPvP(attackerFacingDef(atk, def), def),
      );
      st = dealExtraDamage(st, atkKey, defKey, fd, "무피해 난무");
    }
  }
  if (st.phase === "ended") return st;
  // 막다른 격노 (5티어) — completedPlayerTurns >= RAMPAGE_START_TURN 후, 매 턴 종료 시 ATK 누적.
  const rampage = st[atkKey].player.rampagePerTurn ?? 0;
  if (rampage > 0 && st[atkKey].turn.completedPlayerTurns >= RAMPAGE_START_TURN) {
    const side = st[atkKey];
    const nextBonus = side.buffs.rampageAtkBonus + rampage;
    st = setSide(st, atkKey, {
      ...side,
      buffs: { ...side.buffs, rampageAtkBonus: nextBonus },
    });
    st = {
      ...st,
      log: appendLog(st.log, {
        kind: "info",
        text: `[막다른 격노] ${side.name} ATK +${rampage} (누적 +${nextBonus})`,
      }),
    };
  }
  // 약점 분석 (5티어) — 매 턴 종료 시 상대 ATK/DEF 페널티 +N (자기 buffs 에 기록).
  const analysis = st[atkKey].player.analysisPerTurn ?? 0;
  if (analysis > 0) {
    const side = st[atkKey];
    const nextAtkPen = side.buffs.opponentAtkPenalty + analysis;
    const nextDefPen = side.buffs.opponentDefPenalty + analysis;
    st = setSide(st, atkKey, {
      ...side,
      buffs: {
        ...side.buffs,
        opponentAtkPenalty: nextAtkPen,
        opponentDefPenalty: nextDefPen,
      },
    });
    st = {
      ...st,
      log: appendLog(st.log, {
        kind: "info",
        text: `[약점 분석] ${st[defKey].name} ATK·DEF -${analysis} (누적 -${nextAtkPen}/-${nextDefPen})`,
      }),
    };
  }
  // PR2-B 운기 — 매 자기 턴 maxHp % 회복(temp 버프). turns 감소는 cast hook(턴 시작)에서 처리.
  {
    const side = st[atkKey];
    const s = side.stacks;
    if (s.skillRegenTurns > 0 && s.skillRegenPct > 0 && side.hp > 0) {
      const heal = scalePvPHealing(
        st,
        Math.floor((side.maxHp * s.skillRegenPct) / 100),
      );
      const nextHp = Math.min(side.maxHp, side.hp + heal);
      if (nextHp > side.hp) {
        st = setSide(
          {
            ...st,
            log: appendLog(st.log, {
              kind: "info",
              text: `[운기] ${side.name}의 HP +${nextHp - side.hp}`,
              side: atkKey,
            }),
          },
          atkKey,
          { ...side, hp: nextHp },
        );
      }
    }
  }
  st = applyRegen(st, atkKey);
  return st;
}

// ── 메인 advanceTurn ─────────────────────────────────────────────────────────

export type PvPAttackDamageResult = {
  assassinFires: boolean;
  critRoll: boolean;
  crushReduction: number;
  cyclingChiThisTurn: number;
  decreeFires: boolean;
  dmg: number;
  enduringStrikeBonus: number;
  executionActive: boolean;
  fatedChainConsumed: boolean;
  focusedBreathConsumed: boolean;
  impactFires: boolean;
  luckyStarFires: boolean;
  manaShieldBypassDmg: number;
  manaShieldEligibleDmg: number;
  totalDmg: number;
  weakpointDefIgnore: boolean;
};

// 대상의 행동 시작 시 tagged DoT 를 한 번 tick. ATB 는 실제 스케줄러 행동 진입 시 이 helper 를
// 호출하고, legacy 턴제는 endAttackerPhase 의 페이즈 전환 시 호출한다.
export function tickPvPSideDotsOnAction(
  state: PvPBattleState,
  targetKey: "p1" | "p2",
): PvPBattleState {
  if (state.phase === "ended") return state;
  const target = state[targetKey];
  const dotTick = tickV2Dots(target.v2Dots, target.maxHp);
  const rawDotDamage =
    dotTick.totalDmg > 0 && target.stacks.dotVulnTurns > 0
      ? Math.floor(dotTick.totalDmg * (1 + target.stacks.dotVulnPct / 100))
      : dotTick.totalDmg;
  const barrier = resolveMagicBarrierDamage({
    rawDamage: rawDotDamage,
    durability: target.magicBarrier ?? 0,
    absorbPct: target.player.magicBarrierPvpAbsorbPct,
    efficiencyPct: target.player.magicBarrierPvpEfficiencyPct,
    eligible: true,
    mitigateBody: (bodyRawDamage) =>
      scalePvPDamage(
        state,
        statusDamageAfterReduction(
          bodyRawDamage,
          target.player.statusDamageReductionPct,
        ),
      ),
  });
  const dotDamage = barrier.hpBoundDamage;
  const survival = applyBerserkerHostileDamagePvP(
    {
      ...target,
      magicBarrier: barrier.durabilityLeft,
      v2Dots: dotTick.nextDots,
    },
    target.hp - dotDamage,
  );
  let nextTarget = survival.side;
  const enduranceFires =
    nextTarget.hp <= 0 &&
    !!target.player.enduranceActive &&
    !target.flags.enduranceTriggered;
  if (enduranceFires) {
    nextTarget = {
      ...nextTarget,
      hp: 1,
      flags: { ...nextTarget.flags, enduranceTriggered: true },
    };
  }
  if (nextTarget.berserker) {
    nextTarget = {
      ...nextTarget,
      berserker: finishBerserkerCurrentActionGuard(nextTarget.berserker),
    };
  }
  let next = setSide(state, targetKey, nextTarget);
  if (dotDamage > 0) {
    next = {
      ...next,
      log: distributeV2DotTicks(dotTick.ticks, dotDamage).reduce(
        (log, tick) =>
          appendLog(log, {
            kind: "info",
            effect: "status_damage",
            text: `${target.name}이(가) ${v2DotLogCause(tick)} ${tick.damage} 피해를 입었다.`,
            side: targetKey,
          }),
        next.log,
      ),
    };
  }
  for (const entry of magicBarrierCombatLogEntries(barrier)) {
    next = {
      ...next,
      log: appendLog(next.log, { ...entry, side: targetKey }),
    };
  }
  if (survival.triggered) {
    next = {
      ...next,
      log: appendLog(next.log, {
        kind: "info",
        text: `[사망 극복] ${target.name}이(가) 쓰러지지 않고 HP ${nextTarget.hp}로 돌아왔다.`,
        side: targetKey,
      }),
    };
    if ((target.player.berserkerMadnessRank ?? 0) >= 4) {
      next = {
        ...next,
        log: appendLog(next.log, {
          kind: "info",
          text: `[패황의 지배] 다음 공격 강화 · 멸왕일도 1회 재충전.`,
          side: targetKey,
        }),
      };
    }
  }
  if (enduranceFires) {
    next = {
      ...next,
      log: appendLog(next.log, {
        kind: "info",
        text: `[불굴] ${target.name} 마지막 한 숨 — HP 1 로 버텼다!`,
        side: targetKey,
      }),
    };
  }
  if (next[targetKey].hp > 0) return next;
  return {
    ...next,
    log: appendLog(next.log, {
      kind: "info",
      text: `${target.name}이(가) 쓰러졌다.`,
    }),
    phase: "ended",
    outcome: targetKey === "p1" ? "p2_win" : "p1_win",
  };
}

// 공격자 페이즈 종료 → 후처리(분신/난무/막다른 격노/약점 분석/재생) → 방어자 페이즈 시작.
// legacy 턴제에서는 페이즈 전환이 곧 다음 행동 시작이므로 여기서 DoT 를 처리한다.
// ATB 는 독립된 행동 시계를 사용하므로 실제 행동 진입 시 처리하고 여기서는 생략한다.
export function endAttackerPhase(
  state: PvPBattleState,
  atkKey: "p1" | "p2",
  defKey: "p1" | "p2",
  options: PvPPhaseEndOptions = {},
): PvPBattleState {
  if (state.phase === "ended") return state;
  // 턴 카운터 갱신 — 공격자: completedPlayerTurns +1, 게이트 리셋.
  let next: PvPBattleState = setSide(state, atkKey, {
    ...state[atkKey],
    turn: {
      ...state[atkKey].turn,
      completedPlayerTurns: state[atkKey].turn.completedPlayerTurns + 1,
      doubleStrikeUsedThisTurn: false,
      lightspeedUsedThisTurn: false,
      critThisTurn: false,
      riposteUsedThisTurn: false,
      firstAttackPending: true,
      galeChainsThisTurn: 0,
      weakpointUsedThisTurn: false,
      fatedChainTriggeredThisTurn: false,
    },
  });
  // 공격자 턴 후처리 (분신/난무/막다른 격노/약점 분석/재생).
  next = finishAttackerTurn(
    next,
    atkKey,
    defKey,
    options.skipOffensiveFollowups !== true,
  );
  if (next.phase === "ended") return next;
  if (options.tickDefenderDots !== false) {
    next = tickPvPSideDotsOnAction(next, defKey);
    if (next.phase === "ended") return next;
  }
  // 방어자(다음 공격자) 의 enemyPhasesCompleted +1 — 이번 라운드에서 방어를 1회 마침 (가드 카운터에 사용).
  const defenderAfterBleed = next[defKey];
  next = setSide(next, defKey, {
    ...defenderAfterBleed,
    turn: {
      ...defenderAfterBleed.turn,
      enemyPhasesCompleted: defenderAfterBleed.turn.enemyPhasesCompleted + 1,
    },
  });
  // 새 방어자(다음 공격자) 의 attacksLeft 세팅. nextTurnAttackBonus(유격 누적) 소비.
  const newNextAttacker = next[defKey];
  next = setSide(next, defKey, {
    ...newNextAttacker,
    attacksLeft:
      rollPvPAttackCount(newNextAttacker, next[atkKey]) +
      newNextAttacker.nextTurnAttackBonus,
    nextTurnAttackBonus: 0,
    turn: { ...newNextAttacker.turn, firstAttackPending: true },
  });
  // 페이즈 토글.
  return { ...next, phase: atkKey === "p1" ? "p2" : "p1" };
}

// 포션 효과 — 단일 사이드의 HP 또는 MP 회복. potionHealPct 자체 buffs 에서 가산 (HP 만).
export function applyPotionTo(
  state: PvPBattleState,
  key: "p1" | "p2",
  potion: Potion,
): PvPBattleState {
  const side = state[key];
  if (potion.effect.kind === "heal_hp") {
    const heal = scalePvPHealing(
      state,
      potionHealAmount(potion, side.maxHp, side.buffs.potionHealPct ?? 0),
    );
    const newHp = Math.min(side.maxHp, side.hp + heal);
    const actual = newHp - side.hp;
    const sigShield = healToShield(side.player.equipSignatures, {
      actualHeal: actual,
      calculatedHeal: heal,
      maxHp: side.maxHp,
    });
    let next = setSide(state, key, {
      ...side,
      hp: newHp,
      stacks: sigShield
        ? {
            ...side.stacks,
            playerShield: side.stacks.playerShield + sigShield.amount,
          }
        : side.stacks,
    });
    next = {
      ...next,
      log: appendLog(next.log, {
        kind: "info",
        text: `${side.name}이(가) ${potion.name}을(를) 마셨다 — HP +${actual} (${side.hp} → ${newHp})`,
      }),
    };
    if (sigShield) {
      next = {
        ...next,
        log: appendLog(next.log, {
          kind: "info",
          text: `[${sigShield.label}] ${side.name} 보호막 +${sigShield.amount}`,
        }),
      };
    }
    return next;
  }
  if (potion.effect.kind === "heal_mp") {
    // PR-6 — MP 포션. maxMp 0 (INT 없는 캐릭) 이면 회복 0 → 사실상 no-op.
    const restore = computeMpRestoreAmount(potion, side.maxMp);
    const newMp = Math.min(side.maxMp, side.mp + restore);
    const actual = newMp - side.mp;
    let next = setSide(state, key, { ...side, mp: newMp });
    next = {
      ...next,
      log: appendLog(next.log, {
        kind: "info",
        text: `${side.name}이(가) ${potion.name}을(를) 마셨다 — MP +${actual} (${side.mp} → ${newMp})`,
      }),
    };
    return next;
  }
  return state;
}

// 방어자 측 능력 통합은 PR-1b 에서. (파일 상단 시리즈 노트 참조.)

// ── 결판 (full simulation) ─────────────────────────────────────────────────

export type PvPResolveContext = {
  pickAction: (state: PvPBattleState, who: "p1" | "p2") => PlayerAction;
  potions: { p1: Partial<Record<PotionId, number>>; p2: Partial<Record<PotionId, number>> };
  // 전투 시작 로그에 박을 전술 안내 한 줄(양측 전술 라벨). 호출부가 문자열로 빌드해 넘긴다
  // (엔진은 stance 를 모름 — 순환 의존 회피). 미지정이면 추가 안 함.
  openingNote?: string;
  // 상대에게 가하는 최종 피해 배율. 기본 1이며 아레나처럼 특정 호출 표면만 조정할 때 사용한다.
  damageMultiplier?: number;
  // HP 회복과 새 보호막 생성 배율. 기본 1이며 아레나에서만 별도 조정한다.
  sustainMultiplier?: number;
  // 선공 추첨값(0 이상 1 미만). 테스트·재현 경로는 명시하고 실제 전투는 Math.random 1회를 쓴다.
  initiativeRoll?: number;
  // v2 스킬 상태 (PR-4a) — saves_kv "skills.v2" 의 learned/equipped, 양 side 별도. 미지정/빈 배열이면
  // v2 스킬 cast no-op. 라우트가 saves_kv 에서 읽어 넘긴다.
  v2Skills?: {
    p1?: import("@/adventure/data/v2/v2Skills").V2SkillsState;
    p2?: import("@/adventure/data/v2/v2Skills").V2SkillsState;
  };
};

export type PvPBattleResolution = {
  outcome: PvPOutcome;
  finalState: PvPBattleState;
  potionsConsumed: {
    p1: Partial<Record<PotionId, number>>;
    p2: Partial<Record<PotionId, number>>;
  };
  turns: number;
};

// PvP 결판 — 양쪽이 turn cap 까지 결판 못 내면 무승부.
export const PVP_TURN_CAP = 100;

// PR-4b: v2 스킬 cast — MP 차감 + cooldown set + 효과 적용 (damage/heal/buff/debuff) + 로그.
// 매 side 의 turn 진입 시 1회 — 자기 side 의 buff/debuff turn -1 tick + cast.
function applyImmediateProvokedBasicAttacksPvP(
  state: PvPBattleState,
  provokerKey: "p1" | "p2",
  count: number,
  skillName: string,
): PvPBattleState {
  const attacks = Math.max(0, Math.floor(count));
  if (attacks <= 0 || state.phase === "ended") return state;
  const attackerKey = provokerKey === "p1" ? "p2" : "p1";
  const originalPhase = state.phase;
  const originalAttacker = state[attackerKey];
  let next = setSide(
    {
      ...state,
      phase: attackerKey,
      log: appendLog(state.log, {
        kind: "info",
        text: `[${skillName}] ${originalAttacker.name}이(가) 즉시 기본 공격 ${attacks}회!`,
        side: provokerKey,
      }),
    },
    attackerKey,
    {
      ...originalAttacker,
      // 정확히 두 번만 직접 호출하고 페이즈 종료 후처리는 실행하지 않도록 여분 1회를 둔다.
      attacksLeft: attacks + 1,
      turn: { ...originalAttacker.turn, firstAttackPending: false },
    },
  );
  for (let index = 0; index < attacks && next.phase !== "ended"; index += 1) {
    if (next.phase !== attackerKey) break;
    const logStart = next.log.length;
    next = advanceTurnPvP(next, { kind: "attack" }, { tickDefenderDots: false });
    if (next.log.length > logStart) {
      next = {
        ...next,
        log: next.log.map((entry, logIndex) =>
          logIndex < logStart || entry.side
            ? entry
            : { ...entry, side: attackerKey },
        ),
      };
    }
  }
  if (next.phase === "ended") return next;
  const attackerAfterProvoke = next[attackerKey];
  return setSide(
    { ...next, phase: originalPhase },
    attackerKey,
    {
      ...attackerAfterProvoke,
      attacksLeft: originalAttacker.attacksLeft,
      turn: originalAttacker.turn,
    },
  );
}

export function castV2SkillOnAttackerTurnPvP(
  state: PvPBattleState,
  who: "p1" | "p2",
): {
  state: PvPBattleState;
  /** 실제 스킬이 발동했으면 true. 호출부는 해당 행동의 기본 공격을 생략한다. */
  castFired: boolean;
  /** 스킬 적중으로 얻어 같은 행동 묶음에서 실행할 추가 기본 공격 수. */
  signatureExtraActions: number;
  // 바람/대지 ATB 템포(원소술사) — 비-ATB(legacy) 호출부는 .state 만 쓰고 무시. ATB 루프가 틱 반영.
  selfHastePct: number;
  enemyDelayPct: number;
} {
  const sideStart = state[who];
  const otherKey: "p1" | "p2" = who === "p1" ? "p2" : "p1";
  let st = state;
  const preLog = state.log;
  st = setSide({ ...st, log: preLog }, who, sideStart);
  const side = st[who];
  const opp = st[otherKey];
  const tier6UnityPct =
    (side.buffs.tier6UnityTurnsLeft ?? 0) > 0
      ? side.buffs.tier6UnityHealPct ?? 0
      : 0;
  const tier6UnityMult = 1 + tier6UnityPct / 100;
  const tier6UnityAtk = Math.floor(side.player.atk * tier6UnityMult);
  const tier6UnityMagicAtk = Math.floor(
    (side.player.magicAtk ?? side.player.atk) * tier6UnityMult,
  );
  // 1) buff/debuff tick (cast 전에 — 새 buff 는 발동턴부터 turns 만큼 유지).
  const tickedSelfBuffs = tickV2BuffMap(side.v2SelfBuffs);
  const tickedSelfDebuffs = tickV2BuffMap(side.v2SelfDebuffs);
  // 2) cast 결정 + 효과 계산. target = 상대 side (opp).
  let result = resolveV2SkillCast({
    skills: side.v2Skills,
    cooldowns: side.v2SkillCooldowns,
    combatMode: "pvp",
    // PR2-B(Codex) — PvP 도 발동확률 게이트 + 워메이지 proc 보너스. 단 스킬 미보유 전투자에게
    //   Math.random() 을 소비하면 PvP RNG 가 드리프트하므로(Codex 2차) 장착 스킬 있을 때만 롤.
    procRoll: side.v2Skills.equipped.length > 0 ? Math.random() * 100 : undefined,
    procChanceBonus:
      (side.player.skillProcChanceAdd ?? 0) -
      (side.stacks.skillProcDownTurns > 0 ? side.stacks.skillProcDownPct : 0),
    // 패턴 경로에서도 procChance 굴림(부활) — 플래그 on 이면 패턴이 고른 스킬도 확률 게이트 통과 필요.
    applyProcInPattern: V2_SKILL_PROC_IN_PATTERN,
    // 전투 패턴(갬빗) — 플래그 on 일 때만 주입(PvP 양쪽 다 플레이어). off 면 옛 슬롯순서+proc.
    // 저장된 커스텀 패턴 우선, 없으면 장착 스킬 종류별 스마트 기본 패턴(유틸 스팸 방지).
    turn: side.turn.completedPlayerTurns + 1,
    combatPattern: V2_COMBAT_PATTERN_ENABLED
      ? effectiveCombatPatternFromEquipped(
          side.v2Skills.equipped,
          side.v2Skills.pattern ??
            smartDefaultPatternFromEquipped(side.v2Skills.equipped),
        )
      : undefined,
    berserker: side.berserker
      ? berserkerCastContext(
          side.player.berserkerMadnessRank ?? 0,
          side.berserker,
        )
      : undefined,
    attacker: {
      mp: side.mp,
      atk: tier6UnityAtk,
      attackCount: side.player.attackCount,
      magicAtk: tier6UnityMagicAtk,
      singleHitPhysicalSkillDamagePct:
        side.player.singleHitPhysicalSkillDamagePct,
      minDamage: side.player.minDamage,
      magicMinDamage: side.player.magicMinDamage,
      healMult: side.player.healMult,
      maxHp: side.maxHp,
      // PR2-B — PvP 시전자도 PlayerCombat → def/vit 비례딜·현재HP(사혈격)·maxMp(보호막/명상)·차수 flat 유효.
      def: effectiveMutationDef(
        side.player.def,
        side.stacks.mutationWeight,
        side.player.stoneskinDefPctPerWeight ?? 0,
      ),
      str: side.player.strStat,
      int: side.player.intStat,
      vit: side.player.vitStat,
      dex: side.player.dexStat,
      luk: side.player.lukStat,
      spi: side.player.spiStat,
      allStatTotal: side.player.allStatTotal,
      // 활성 파생버프 — 조건식이 만료된 버프만 다시 시전하도록 실제 PvP 스택을 전달한다.
      selfShield: side.stacks.playerShield,
      selfShieldActive: side.stacks.playerShield > 0,
      selfStatBuffActive: {
        spd: side.buffs.playerSpdTurnsLeft > 0,
      },
      selfBuffPctActive: {
        evasion: side.stacks.skillEvasionTurns > 0,
        crit: side.stacks.skillCritTurns > 0,
        damageReduction: side.stacks.skillDmgReduceTurns > 0,
        reflectDamage: side.stacks.skillReflectBoostTurns > 0,
        regen: side.stacks.skillRegenTurns > 0,
        guaranteedEvade: side.stacks.evadesRemaining > 0,
        duelistDeclaration: (side.duelistBuff?.remainingBasicHits ?? 0) > 0,
      },
      currentHp: side.hp,
      maxMp: side.maxMp,
      classTier: side.player.classTier,
      fortressImpact: side.stacks.fortressImpact,
      ironWallReflectCharges: side.stacks.ironWallReflectCharges,
      fortressImpactDamagePctPerStack:
        side.player.fortressImpactDamagePctPerStack,
      fortressDefSkillStatCoefPct: side.player.fortressDefSkillStatCoefPct,
      lawInscription: side.player.lawInscription,
      lawInscriptions: side.stacks.lawInscriptions,
      mutationWeight: side.stacks.mutationWeight,
      bleedPhysicalSkillDamagePctPerStack:
        side.player.bleedPhysicalSkillDamagePctPerStack,
      selfBuffs: tickedSelfBuffs,
      selfDebuffs: tickedSelfDebuffs,
      characterElement: side.player.characterElement,
    },
    target: {
      def: skillTargetDef(side, opp),
      magicDef: skillTargetMagicDef(side, opp),
      // PR-5a: PvP 양 side 다 v2 buff slot 있음 — opponent 의 buff 도 def 곱셈에 반영.
      selfBuffs: opp.v2SelfBuffs,
      selfDebuffs: opp.v2SelfDebuffs,
      // PR2-B — 처단(처형 임계)·스택 payoff(참절/중독폭발) 대상 = 상대 side.
      currentHp: opp.hp,
      maxHp: opp.maxHp,
      bleedStacks: opp.v2Dots.filter((d) => d.tag === "bleed").reduce((s, d) => s + d.stacks, 0),
      poisonStacks: opp.v2Dots.filter((d) => d.tag === "poison").reduce((s, d) => s + d.stacks, 0),
      // 약점 노출 — 비전 작렬(magicVuln payoff)이 상대 누적 스택을 읽어 추가딜.
      magicVulnStacks: opp.stacks.magicVulnStacks,
      enemyVulnerabilityActive: opp.stacks.enemyVulnTurns > 0,
      enemyDamageDownActive: opp.stacks.damageDownTurns > 0,
      enemySkillProcDownActive: opp.stacks.skillProcDownTurns > 0,
      enemyHealReductionActive: opp.stacks.healReduceTurns > 0,
    },
  });
  // 보장 회피는 스킬 전체를 무효화한다. 일반 회피도는 빗나감 대신 직접 피해만 줄이며,
  // DoT·디버프·제어 같은 적중 시 효과는 정상 적용한다.
  let skillGuaranteedEvaded = false;
  let skillEvasionReductionPct = 0;
  if (
    result.castSkillId &&
    result.enemyDamage > 0 &&
    opp.stacks.evadesRemaining > 0
  ) {
    // 그림자 도약 등 보장 회피는 평타뿐 아니라 다음 직접 피해 스킬에도 우선 적용한다.
    // 스킬 다단히트는 일반 명중 판정과 마찬가지로 한 번의 공격 행동으로 취급해 전체를 회피한다.
    skillGuaranteedEvaded = true;
    result = removeMissedV2SkillTargetEffects(result);
  } else if (result.castSkillId && result.enemyDamage > 0) {
    // 평타와 동일하게 기본 회피도에 전투 중 증가율을 곱하고 공격자의 적중도와 대결한다.
    const sPrecisionMult = side.player.precisionEvasionMult ?? 1;
    const sLuckEvadeBonus = opp.flags.luckyBuffActive
      ? opp.player.doubleLuck?.evade ?? 0
      : 0;
    const sSkillEvadeBonus =
      opp.stacks.skillEvasionTurns > 0 ? opp.stacks.skillEvasionPct : 0;
    const sTemporaryEvasionIncreasePct =
      sLuckEvadeBonus +
      (opp.player.universalLuckBonusPct ?? 0) +
      opp.buffs.cyclingChiBonus +
      sSkillEvadeBonus;
    const sDefenderEvaR = Math.max(
      0,
      (opp.player.evaRating ?? opp.player.evasionPct ?? 0) *
        sPrecisionMult *
        (1 + Math.max(0, sTemporaryEvasionIncreasePct) / 100),
    );
    skillEvasionReductionPct = pvpEvasionDamageReductionPct(
      sDefenderEvaR,
      effectivePvPAccuracyRating(side),
    );
  }
  // 3) state 업데이트. 앞 단계에서 만든 st 의 로그를 이어서 누적한다.
  // 시전 별도 로그 폐기 — damage/heal 로그에 prefix 로 스킬명 포함.
  let nextLog = st.log;
  let nextSideHp = side.hp;
  let nextOppHp = opp.hp;
  let tier6SkillHitDamages: number[] = [];
  let nextOppShield = opp.stacks.playerShield;
  let nextOppMagicBarrier = opp.magicBarrier ?? 0;
  let nextOppTripleWard = opp.stacks.tripleWard;
  let skillStabilityReducedBy = 0;
  const skillWardReductions: Array<{
    kind: "physical" | "magic";
    reductionPct: number;
    remaining: number;
  }> = [];
  const skillWardConsumedKinds = new Set<"physical" | "magic">();
  let skillShieldAbsorbed = 0;
  let skillMagicBarrierAbsorbed = 0;
  let skillMagicBarrierDurabilitySpent = 0;
  let skillMagicBarrierDestroyed = false;
  let skillDamageToHp = 0;
  let healShieldAmount = 0;
  const castSkillDef = result.castSkillId ? V2_SKILLS[result.castSkillId] : null;
  const isBloodDemonReign = result.castSkillId === "v2c_blooddemon_reign";
  const bloodDemonHealPct = isBloodDemonReign
    ? (castSkillDef?.effects.find(
        (effect) => effect.kind === "healFromDamage",
      )?.pct ?? 0)
    : 0;
  let bloodDemonEffectiveDamage = 0;
  // hpCostDamage는 명중한 공격에 HP를 피해로 교환한다. 확정 회피에서는
  // removeMissedV2SkillTargetEffects가 selfHpCost를 0으로 만들며, 일반 회피 경감에서는
  // 흡혈보다 먼저 비용을 내 최대 HP에서도 회복할 공간이 생기게 한다.
  if (result.selfHpCost > 0) {
    const cost = Math.min(Math.max(0, nextSideHp - 1), result.selfHpCost);
    if (cost > 0) {
      nextSideHp -= cost;
      nextLog = appendLog(nextLog, {
        kind: "info",
        text: `${result.castSkillName ?? "사혈"}! ${side.name} 생명력 ${cost} 소모`,
        side: who,
      });
    }
  }
  // 스킬 데미지 배수 — 주문중첩(워메이지)·약점노출(마도사 magicVuln)·속박(enemyVuln). 현재 누적
  //   기준, 적용은 이번 시전부터(적중 후 아래에서 스택 증가). 전부 미보유면 배수 1 → 무변(PvE 미러).
  const spellStackMult =
    1 + (side.stacks.spellCastCount * (side.player.skillDmgPctPerCast ?? 0)) / 100;
  const magicVulnMult =
    1 +
    (opp.stacks.magicVulnStacks * (side.player.enemyMagicVulnPctPerStack ?? 0)) /
      100;
  const erosionMult =
    opp.stacks.dotVulnTurns > 0 && opp.stacks.magicVulnStacks > 0
      ? 1 + opp.stacks.dotVulnPct / 100
      : 1;
  // 속박(enemyVuln) 이번 턴 유효값 — turn-start 감소(또는 새 시전 set) 적용 후. 스킬 cast 와
  //   같은 턴 평타가 동일 값을 쓰도록 nextStacks 와 공유(평타는 post-hook nextStacks 를 읽음).
  //   pre-decay 를 쓰면 속박 마지막 턴에 스킬만 증폭/평타는 미증폭 불일치(Codex).
  //   주의: 현 속박 스킬(속박 사격)은 무피해라 자가증폭 없음. 향후 "피해+속박" 콤보 스킬이 생기면
  //   이 cast 의 자기 피해도 방금 건 속박으로 증폭됨(의도된 동작).
  const nextEnemyVulnTurns = result.enemyVulnToApply
    ? result.enemyVulnToApply.turns
    : Math.max(0, side.stacks.enemyVulnTurns - 1);
  const nextEnemyVulnPct =
    result.enemyVulnToApply?.pct ?? side.stacks.enemyVulnPct;
  const vulnMult = nextEnemyVulnTurns > 0 ? 1 + nextEnemyVulnPct / 100 : 1;
  const magicSkillDamageBonus =
    result.magicEnemyDamage > 0 && (side.player.magicSkillDamagePct ?? 0) > 0
      ? Math.floor(
          (result.magicEnemyDamage * (side.player.magicSkillDamagePct ?? 0)) /
            100,
        )
      : 0;
  const lawMagicVulnBonus =
    result.magicEnemyDamage > 0 &&
    (side.stacks.enemyMagicVulnTurns ?? 0) > 0
      ? Math.floor(
          (result.magicEnemyDamage *
            (side.stacks.enemyMagicVulnPct ?? 0)) /
            100,
        )
      : 0;
  const skillDamageBase =
    result.enemyDamage + magicSkillDamageBonus + lawMagicVulnBonus;
  // 스킬 치명타 — PvE 미러. 평타와 같은 크리 확률(min(critChancePct, 75%)) 공유, 배수만 SKILL_CRIT_MULT
  //   로 분리. PvP 확률 판정은 대상의 치명타 저항을 차감하며, 강제 치명타는 저항을 무시한다.
  //   데미지>0 일 때만 롤(자버프·무피해 스킬엔 롤 안 함 → RNG 스트림 보존).
  const effectiveSkillCritPct = Math.max(
    0,
    Math.min(CRIT_PCT_CAP, side.player.critChancePct ?? 0) -
      (opp.player.critResistPct ?? 0),
  );
  const skillCritAfterEvadeFired =
    result.enemyDamage > 0 && side.flags.skillCritAfterEvadePending;
  const skillCritFired =
    result.enemyDamage > 0 &&
    (result.berserkerTransition.forceSkillCrit ||
      skillCritAfterEvadeFired ||
      (effectiveSkillCritPct > 0 &&
        Math.random() * 100 < effectiveSkillCritPct));
  // 스킬 다단히트(PvE 미러) — 시전자가 이 턴 굴려둔 공격 횟수(attacksLeft)만큼 데미지 스킬 반복 타격.
  //   데미지 스킬에만(버프/힐/마나/DoT 부여는 1회). 추가 공격 0 빌드는 skillHitCount=1 → 기존 byte-동일.
  const skillHitCount =
    result.castSkillId && result.enemyDamage > 0
      ? Math.max(1, side.attacksLeft)
      : 1;
  const skillPreCriticalMultiplier =
    spellStackMult *
    magicVulnMult *
    erosionMult *
    vulnMult *
    (side.stacks.damageDownTurns > 0
      ? 1 - side.stacks.damageDownPct / 100
      : 1);
  const skillCriticalMultiplier = skillCritFired
    ? SKILL_CRIT_MULT +
      Math.max(0, side.player.skillCritDmgPct ?? 0) / 100 +
      result.berserkerTransition.bonusSkillCritDamagePct / 100 +
      (side.player.skillCritOverflow
        ? computeCritOverflowBonus(side.player.critChancePct ?? 0)
        : 0)
    : 1;
  const singleSkillDamage = computeDirectSkillDamage({
    totalDamage: skillDamageBase,
    magicDamage:
      result.magicEnemyDamage + magicSkillDamageBonus + lawMagicVulnBonus,
    preCriticalMultiplier: skillPreCriticalMultiplier,
    criticalMultiplier: skillCriticalMultiplier,
    equipmentMagicCritBonus:
      Math.max(0, side.player.equipmentMagicSkillCritDmgPct ?? 0) / 100,
    critical: skillCritFired,
  });
  let nextComboHitCount = side.stacks.comboHitCount;
  let landedSkillHits = 0;
  let skillReflectBase = 0;
  if (skillCritAfterEvadeFired && result.castSkillName) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[흑월지배] ${side.name}의 ${result.castSkillName}이(가) 치명타가 된다.`,
      side: who,
    });
  }
  // damage: 일반 공격 player_attack kind 미러.
  if (result.enemyDamage > 0 && result.castSkillName) {
    // 다단 스킬은 타마다 한 줄(PvE 미러). 부스트는 타당 raw 비율 분배(합 = 1회분 singleSkillDamage).
    // 다단히트(추가 공격)면 1회분 타격 묶음을 skillHitCount 번 반복.
    const singleHits =
      result.hitDamages.length > 1
        ? distributeBoostedHits(result.hitDamages, singleSkillDamage)
        : [singleSkillDamage];
    const repeatedHits: number[] = [];
    for (let h = 0; h < skillHitCount; h++) repeatedHits.push(...singleHits);
    const comboResult = applyComboFinisherToHits(
      repeatedHits,
      side.stacks.comboHitCount,
      side.player.comboFinisherBonusPct,
    );
    const perHitAfterEvasion = comboResult.hitDamages.map((hit) =>
      applyEvasionDamageReduction(hit, skillEvasionReductionPct),
    );
    const rawDamageBeforeEvasion = comboResult.hitDamages.reduce(
      (sum, hit) => sum + hit,
      0,
    );
    const rawDamageAfterEvasion = perHitAfterEvasion.reduce(
      (sum, hit) => sum + hit,
      0,
    );
    if (rawDamageAfterEvasion < rawDamageBeforeEvasion) {
      nextLog = appendLog(nextLog, {
        kind: "info",
        text: `[회피 경감 ${skillEvasionReductionPct.toFixed(1)}%] ${opp.name} 피해 -${rawDamageBeforeEvasion - rawDamageAfterEvasion}`,
        side: otherKey,
      });
    }
    const damageReductionPct = pvpSideDamageTakenReductionPct(opp);
    const perHitBeforeReduction = perHitAfterEvasion.map((hit) =>
      scalePvPDamage(st, hit),
    );
    const perHit = perHitAfterEvasion.map((hit) => {
      const reduced =
        damageReductionPct > 0
          ? Math.max(
              1,
              Math.floor(hit * (1 - damageReductionPct / 100)),
            )
          : hit;
      return scalePvPDamage(st, reduced);
    });
    tier6SkillHitDamages = perHit.filter((hit) => hit > 0);
    landedSkillHits = perHit.filter((hit) => hit > 0).length;
    nextComboHitCount = comboResult.nextComboHitCount;
    const skillDamage = perHit.reduce((sum, hit) => sum + hit, 0);
    const skillDamageBeforeReduction = perHitBeforeReduction.reduce(
      (sum, hit) => sum + hit,
      0,
    );
    // 평타 반사와 같은 기준: 회피 경감 후, 그 밖의 받피감·아레나 배율 적용 전 스킬 피해.
    skillReflectBase = perHitAfterEvasion.reduce(
      (sum, hit) => sum + hit,
      0,
    );
    if (skillDamage < skillDamageBeforeReduction) {
      nextLog = appendLog(nextLog, {
        kind: "info",
        text: `[받피감] ${opp.name} 피해 -${skillDamageBeforeReduction - skillDamage}`,
        side: otherKey,
      });
    }
    // 모든 직접 피해 스킬은 보호막을 먼저 소모한다. 보호막을 뚫고 실제 HP 피해가
    // 남은 경우에만 아래 반사 판정이 활성화된다.
    const manaShieldEligible =
      result.selfHpCost <= 0 &&
      !castSkillDef?.effects.some((effect) => effect.kind === "executeDamage");
    const hpHits = comboResult.hitDamages.map((rawHit) => {
      const barrier = resolveMagicBarrierDamage({
        rawDamage: rawHit,
        durability: nextOppMagicBarrier,
        absorbPct: opp.player.magicBarrierPvpAbsorbPct,
        efficiencyPct: opp.player.magicBarrierPvpEfficiencyPct,
        eligible: manaShieldEligible,
        mitigateBody: (bodyRawDamage) => {
          if (bodyRawDamage <= 0) return 0;
          const afterEvasion = applyEvasionDamageReduction(
            bodyRawDamage,
            skillEvasionReductionPct,
          );
          const reduced =
            damageReductionPct > 0
              ? Math.max(
                  1,
                  Math.floor(
                    afterEvasion * (1 - damageReductionPct / 100),
                  ),
                )
              : afterEvasion;
          const stabilityPct = tripleWardStabilityReductionPct(
            nextOppTripleWard,
          );
          const afterStability = stabilityPct > 0
            ? Math.max(1, Math.floor(reduced * (1 - stabilityPct / 100)))
            : reduced;
          skillStabilityReducedBy += reduced - afterStability;
          const magicShare = Math.min(
            1,
            Math.max(
              0,
              result.magicEnemyDamage / Math.max(1, result.enemyDamage),
            ),
          );
          const physicalDamage = Math.floor(
            afterStability * (1 - magicShare),
          );
          const magicDamage = afterStability - physicalDamage;
          let wardedDamage = 0;
          for (const [kind, part] of [
            ["physical", physicalDamage],
            ["magic", magicDamage],
          ] as const) {
            if (part <= 0) continue;
            if (skillWardConsumedKinds.has(kind)) {
              wardedDamage += part;
              continue;
            }
            const ward = resolveTripleWardDamage(
              nextOppTripleWard,
              kind,
              "pvp",
              [part],
            );
            nextOppTripleWard = ward.state;
            wardedDamage += ward.totalDamage;
            if (ward.consumed) {
              skillWardConsumedKinds.add(kind);
              skillWardReductions.push({
                kind,
                reductionPct: ward.reductionPct,
                remaining: ward.remaining,
              });
            }
          }
          return scalePvPDamage(st, wardedDamage);
        },
      });
      nextOppMagicBarrier = barrier.durabilityLeft;
      skillMagicBarrierAbsorbed += barrier.absorbedDamage;
      skillMagicBarrierDurabilitySpent += barrier.durabilitySpent;
      skillMagicBarrierDestroyed ||= barrier.destroyed;
      const absorbed = Math.min(nextOppShield, barrier.hpBoundDamage);
      nextOppShield -= absorbed;
      skillShieldAbsorbed += absorbed;
      const actualHpDamage = Math.min(
        nextOppHp,
        barrier.hpBoundDamage - absorbed,
      );
      nextOppHp -= actualHpDamage;
      skillDamageToHp += actualHpDamage;
      return actualHpDamage;
    });
    if (skillStabilityReducedBy > 0) {
      nextLog = appendLog(nextLog, {
        kind: "info",
        text: `[영역 안정] ${opp.name} 피해 -${skillStabilityReducedBy}`,
        side: otherKey,
      });
    }
    for (const ward of skillWardReductions) {
      nextLog = appendLog(nextLog, {
        kind: "info",
        text: `[${TRIPLE_WARD_LABELS[ward.kind]}] ${opp.name} 직접 ${ward.kind === "magic" ? "마법" : "물리"} 피해 ${ward.reductionPct}% 감소 (${ward.remaining}회 남음)`,
        side: otherKey,
      });
    }
    if (skillShieldAbsorbed > 0) {
      nextLog = appendLog(nextLog, {
        kind: "info",
        text: `[철벽] ${opp.name} 보호막이 ${skillShieldAbsorbed} 흡수 (남은 ${nextOppShield})`,
        side: otherKey,
      });
    }
    if (skillMagicBarrierAbsorbed > 0) {
      for (const entry of magicBarrierCombatLogEntries({
        bodyRawDamage: 0,
        mitigatedBodyDamage: 0,
        absorbedDamage: skillMagicBarrierAbsorbed,
        spillDamage: 0,
        hpBoundDamage: 0,
        durabilitySpent: skillMagicBarrierDurabilitySpent,
        durabilityLeft: nextOppMagicBarrier,
        destroyed: skillMagicBarrierDestroyed,
      })) {
        nextLog = appendLog(nextLog, { ...entry, side: otherKey });
      }
    }
    if (isBloodDemonReign) {
      bloodDemonEffectiveDamage =
        skillShieldAbsorbed + skillMagicBarrierAbsorbed + skillDamageToHp;
    }
    for (const hit of hpHits) {
      nextLog = appendLog(nextLog, {
        kind: "player_attack",
        text: `${result.castSkillName}!${skillCritFired ? " [치명타]" : ""} ${hit} 피해를 입혔다.`,
        side: who,
      });
    }
  }
  const sigSkill = resolveOffensiveSignatureTriggers(
    side.player.equipSignatures,
    {
      critical: skillCritFired,
      dealtDamage: landedSkillHits > 0,
      allowShock: canApplyShock(opp.stacks.shockAction),
    },
  );
  const sigSkillTargetDots = [
    ...(sigSkill.critPoison
      ? [
          makePoisonDot({
            stacks: 1,
            pctMaxHpPerStack: SIGNATURE_CRIT_POISON_PCT_MAX_HP_PER_STACK,
            sourceAtk: side.player.atk,
          }),
        ]
      : []),
    ...(sigSkill.hitPoison
      ? [
          makePoisonDot({
            stacks: sigSkill.hitPoison.stacks,
            pctMaxHpPerStack: SIGNATURE_HIT_POISON_PCT_MAX_HP_PER_STACK,
            sourceAtk: side.player.atk,
          }),
        ]
      : []),
    ...(sigSkill.hitBleed
      ? [
          makeBleedDot({
            stacks: sigSkill.hitBleed.stacks,
            flatPerStack: 0,
            sourceAtk: side.player.atk,
          }),
        ]
      : []),
  ];
  const sigSkillTargetStatusFired =
    sigSkill.critPoison ||
    !!sigSkill.hitPoison ||
    !!sigSkill.hitBleed ||
    !!sigSkill.critChill ||
    !!sigSkill.critDefDebuff ||
    !!sigSkill.hitShock;
  const sigStatusBlock = statusBlockOnce(opp.player.equipSignatures);
  const hasHostileStatus =
    result.enemyDebuffsToApply.length > 0 ||
    result.dotsToApplyToTarget.length > 0 ||
    result.enemyVulnToApply != null ||
    result.enemyEvasionDownToApply != null ||
    result.enemyAccuracyDownToApply != null ||
    result.enemyDelayToApply != null ||
    result.enemyHealReduceToApply != null ||
    result.enemyDamageDownToApply != null ||
    result.enemySkillProcDownToApply != null ||
    result.enemyDotVulnToApply != null ||
    ((side.player.enemyMagicVulnPctPerStack ?? 0) > 0 &&
      result.enemyDamage > 0) ||
    sigSkillTargetStatusFired;
  const statusBlockTargetEffects =
    hasHostileStatus &&
    !!sigStatusBlock &&
    !opp.flags.statusBlockUsed;
  const purificationBlockTargetEffects =
    hasHostileStatus &&
    !statusBlockTargetEffects &&
    nextOppTripleWard.purification > 0;
  const blockHostileStatus =
    statusBlockTargetEffects || purificationBlockTargetEffects;
  if (purificationBlockTargetEffects) {
    nextOppTripleWard = consumePurificationWard(nextOppTripleWard).state;
  }
  const activeSkillCritSpdMult =
    side.buffs.playerSpdTurnsLeft > 0 ? side.buffs.playerSpdMult : 1;
  const sigSkillCritSpdBuff = sigSkill.critSpeed
    ? {
        playerSpdMult: Math.max(
          activeSkillCritSpdMult,
          sigSkill.critSpeed.mult,
        ),
        playerSpdTurnsLeft: Math.max(
          side.buffs.playerSpdTurnsLeft,
          sigSkill.critSpeed.turns,
        ),
      }
    : null;
  const activeSkillEnemySpdMult =
    side.buffs.enemySpdTurnsLeft > 0 ? side.buffs.enemySpdMult : 1;
  const sigSkillEnemySlow =
    !blockHostileStatus && sigSkill.critChill
      ? {
          enemySpdMult: Math.min(
            activeSkillEnemySpdMult,
            sigSkill.critChill.mult,
          ),
          enemySpdTurnsLeft: Math.max(
            side.buffs.enemySpdTurnsLeft,
            sigSkill.critChill.turns,
          ),
        }
      : null;
  const activeSkillEnemyDefDebuffPct =
    side.buffs.enemyDefDebuffTurnsLeft > 0
      ? side.buffs.enemyDefDebuffPct
      : 0;
  const sigSkillEnemyDefDebuff =
    !blockHostileStatus && sigSkill.critDefDebuff
      ? {
          enemyDefDebuffPct: Math.max(
            activeSkillEnemyDefDebuffPct,
            sigSkill.critDefDebuff.pct,
          ),
          enemyDefDebuffTurnsLeft: Math.max(
            side.buffs.enemyDefDebuffTurnsLeft,
            sigSkill.critDefDebuff.turns,
          ),
        }
      : null;
  const sigSkillBuffs = {
    ...(sigSkillCritSpdBuff ?? {}),
    ...(sigSkillEnemySlow ?? {}),
    ...(sigSkillEnemyDefDebuff ?? {}),
  };
  const hasSigSkillBuffs =
    !!sigSkillCritSpdBuff ||
    !!sigSkillEnemySlow ||
    !!sigSkillEnemyDefDebuff;
  if (sigSkillCritSpdBuff) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${sigSkill.critSpeed?.label ?? "군림"}] ${side.name} 결정타 — 속도가 솟구친다!`,
      side: who,
    });
  }
  if (!blockHostileStatus && sigSkill.critPoison) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[독니] ${opp.name}을(를) 중독시켰다!`,
      side: who,
    });
  }
  if (!blockHostileStatus && sigSkill.hitPoison) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${sigSkill.hitPoison.label}] ${opp.name}에게 중독 ${sigSkill.hitPoison.stacks}스택을 남겼다.`,
      side: who,
    });
  }
  if (!blockHostileStatus && sigSkill.hitBleed) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${sigSkill.hitBleed.label}] ${opp.name}에게 출혈 ${sigSkill.hitBleed.stacks}스택을 남겼다.`,
      side: who,
    });
  }
  if (!blockHostileStatus && sigSkill.critChill) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: formatChillSlowLog(opp.name, sigSkill.critChill),
      side: who,
    });
  }
  if (!blockHostileStatus && sigSkill.critDefDebuff) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: formatDefDebuffLog(opp.name, sigSkill.critDefDebuff),
      side: who,
    });
  }
  if (!blockHostileStatus && sigSkill.hitShock) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: formatShockAppliedLog(opp.name, sigSkill.hitShock),
      side: who,
    });
  }
  if (result.berserkerTransition.grantFinisher) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[혈전] 다음 파멸일격 또는 멸왕일도를 준비한다.`,
      side: who,
    });
  }
  if (result.berserkerTransition.consumeFinisher) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[혈전 해방] ${result.castSkillName ?? "필살기"}에 피의 기세를 터뜨린다.`,
      side: who,
    });
  }
  if (result.berserkerTransition.consumeDeathDamage) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[패황의 지배] ${result.castSkillName ?? "공격"}에 죽음 직전의 힘을 싣는다.`,
      side: who,
    });
  }
  let nextOppBerserker = opp.berserker;
  let berserkerSurvivalTriggered = false;
  if (skillDamageToHp > 0) {
    const survival = applyBerserkerHostileDamagePvP(
      { ...opp, hp: nextOppHp },
      nextOppHp,
    );
    nextOppHp = survival.side.hp;
    nextOppBerserker = survival.side.berserker;
    berserkerSurvivalTriggered = survival.triggered;
  }
  if (berserkerSurvivalTriggered) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[사망 극복] ${opp.name}이(가) 쓰러지지 않고 HP ${nextOppHp}로 돌아왔다.`,
      side: otherKey,
    });
    if ((opp.player.berserkerMadnessRank ?? 0) >= 4) {
      nextLog = appendLog(nextLog, {
        kind: "info",
        text: `[패황의 지배] 다음 공격 강화 · 멸왕일도 1회 재충전.`,
        side: otherKey,
      });
    }
  }
  const skillEnduranceFires =
    nextOppHp <= 0 &&
    !!opp.player.enduranceActive &&
    !opp.flags.enduranceTriggered;
  if (skillEnduranceFires) {
    nextOppHp = 1;
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[불굴] ${opp.name} 마지막 한 숨 — HP 1 로 버텼다!`,
      side: otherKey,
    });
  }
  // heal: 같은 player_attack kind (자기 행동). 화상(healReduce)이 걸렸으면 회복 감소.
  //   디버프 없으면(0) Math.floor 미적용 → byte-identical.
  const resolvedSelfHealBase = isBloodDemonReign
    ? Math.floor((bloodDemonEffectiveDamage * bloodDemonHealPct) / 100)
    : result.selfHeal;
  const resolvedSelfHeal = Math.floor(
    resolvedSelfHealBase * tier6UnityMult,
  );
  if (resolvedSelfHeal > 0 && result.castSkillName) {
    const hr = side.stacks.healReduceTurns > 0 ? side.stacks.healReducePct : 0;
    const debuffAdjustedHeal =
      hr > 0 ? Math.floor(resolvedSelfHeal * (1 - hr / 100)) : resolvedSelfHeal;
    // 무자원 1회 회복기는 combatShared 의 PvP 50% 제한을 이미 받는다. 아레나 공통
    // 지속력 배율까지 중복 적용하지 않고, 그 밖의 회복만 호출 표면 보정을 거친다.
    const effHeal = isLimitedRecoverySkillId(result.castSkillId)
      ? debuffAdjustedHeal
      : scalePvPHealing(st, debuffAdjustedHeal);
    const before = nextSideHp;
    nextSideHp = Math.min(side.maxHp, nextSideHp + effHeal);
    const actual = nextSideHp - before;
    if (actual > 0) {
      const overflowSuffix = effHeal > actual ? ` (산출 ${effHeal})` : "";
      nextLog = appendLog(nextLog, {
        kind: "player_attack",
        text: `${result.castSkillName}! ${side.name} HP ${actual} 회복했다.${overflowSuffix}`,
        side: who,
      });
      const sigShield = healToShield(side.player.equipSignatures, {
        actualHeal: actual,
        calculatedHeal: effHeal,
        maxHp: side.maxHp,
      });
      if (sigShield) {
        healShieldAmount += sigShield.amount;
        nextLog = appendLog(nextLog, {
          kind: "info",
          text: `[${sigShield.label}] ${side.name} 보호막 +${sigShield.amount}`,
          side: who,
        });
      }
    }
  }
  // 마나 회복(명상 등) — 로그 한 줄(빈 턴 갭 방지). PvE 미러.
  if (result.manaRestored > 0 && result.castSkillName) {
    nextLog = appendLog(nextLog, {
      kind: "player_attack",
      text: `${result.castSkillName}! ${side.name} 마나 ${result.manaRestored} 회복했다.`,
      side: who,
    });
  }
  if (result.guaranteedEvadesToAdd > 0 && result.castSkillName) {
    nextLog = appendLog(nextLog, {
      kind: "player_attack",
      text: `${result.castSkillName}! 확정 회피를 준비했다.`,
      side: who,
    });
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${result.castSkillName}] ${side.name}이(가) 다음 공격 ${result.guaranteedEvadesToAdd}회를 반드시 회피한다.`,
      side: who,
    });
  }
  const sigMpRefund = onSkillCastMpRefund(side.player.equipSignatures);
  const costPaid = side.mp - result.nextMp;
  const sigMpRefundAmount =
    sigMpRefund && costPaid > 0
      ? Math.floor((costPaid * sigMpRefund.pct) / 100)
      : 0;
  if (sigMpRefund && sigMpRefundAmount > 0 && result.castSkillName) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${sigMpRefund.label}] ${side.name} 마나 ${sigMpRefundAmount} 환급`,
      side: who,
    });
  }
  // PR2-B — 보호막 + temp 버프(운기/연환집중/선풍각/속박) 적용(PvE applySkillTempBuffs/shield 미러).
  //   보호막 흡수는 기존 로직(stacks.playerShield)이 처리, 4 버프는 stacks 에 기록 후 전투에서 소비.
  //   (비전 작렬=마법취약 payoff 는 PvP magicVuln 트래커 없어 여전히 no-op — 별도 follow-up.)
  const rawShieldGain = result.shieldToApply
    ? result.shieldToApply.hp + result.shieldToApply.mp
    : 0;
  const shieldGain =
    result.castSkillId === "v2c_lawweaver_release" ||
    isLimitedRecoverySkillId(result.castSkillId)
    ? rawShieldGain
    : scalePvPShield(st, rawShieldGain);
  const critBuff = result.selfBuffPctToApply.find((b) => b.target === "crit");
  const evaBuff = result.selfBuffPctToApply.find((b) => b.target === "evasion");
  const dmgReduceBuff = result.selfBuffPctToApply.find(
    (b) => b.target === "damageReduction",
  );
  const reflectBuff = result.selfBuffPctToApply.find((b) => b.target === "reflectDamage");
  const refreshedTripleWard = result.refreshTripleWards
    ? refreshTripleWardState(
        side.stacks.tripleWard,
        aggregateEquippedPassives(side.v2Skills.equipped).tripleWardRank,
      )
    : side.stacks.tripleWard;
  // PvE와 동일하게 직접 피해 스킬의 실제 타격 수를 every-N 카운터에 합산한다.
  // 다단 스킬이 한 번에 여러 주기를 넘기면 넘긴 횟수만큼 후속 행동을 추가한다.
  const sigEvery = everyNHitsEffect(side.player.equipSignatures);
  const sigEveryN = sigEvery?.hits ?? 0;
  const nextSigHitCount =
    sigEveryN > 0
      ? side.stacks.signatureHitCount + landedSkillHits
      : side.stacks.signatureHitCount;
  const signatureExtraActions =
    sigEveryN > 0
      ? Math.floor(nextSigHitCount / sigEveryN) -
        Math.floor(side.stacks.signatureHitCount / sigEveryN)
      : 0;
  const lawGain = addLawInscriptionGain(
    side.stacks.lawInscriptions,
    result.lawInscriptionGain,
  );
  const nextLawInscriptions = result.lawInscriptionsToConsume
    ? emptyLawInscriptionState()
    : lawGain.state;
  if (signatureExtraActions > 0) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${sigEvery?.label ?? "연격"}] ${side.name} ${landedSkillHits}회 적중 — 추가 기본 공격 ${signatureExtraActions}회!`,
      side: who,
    });
  }
  // 차수… 아니라 temp 버프 turns 감소는 **자기 턴 시작(여기, cast hook = phase 당 1회)**에서.
  // 새 버프 시전이면 그 turns 로 리셋, 아니면 -1. 턴 시작 감소라 방어용 선풍각(상대 턴에 소비)도
  // 시전 턴 직후 1턴 손실 없이 N 턴 유지(PvE 는 자기 턴에 소비/감소라 turn-end, PvP 는 turn-start).
  const nextStacks: PvPSideStacks = {
    ...side.stacks,
    tripleWard: refreshedTripleWard,
    evadesRemaining:
      side.stacks.evadesRemaining + result.guaranteedEvadesToAdd,
    playerShield: side.stacks.playerShield + shieldGain,
    skillRegenPct:
      result.selfRegenToApply?.pctMaxHpPerTurn ?? side.stacks.skillRegenPct,
    skillRegenTurns: result.selfRegenToApply
      ? result.selfRegenToApply.turns
      : Math.max(0, side.stacks.skillRegenTurns - 1),
    skillCritPct: critBuff?.pct ?? side.stacks.skillCritPct,
    skillCritTurns: critBuff
      ? critBuff.turns
      : Math.max(0, side.stacks.skillCritTurns - 1),
    skillEvasionPct: evaBuff?.pct ?? side.stacks.skillEvasionPct,
    skillEvasionTurns: evaBuff
      ? evaBuff.turns
      : side.stacks.skillEvasionTurns,
    accuracyDownPct: side.stacks.accuracyDownPct,
    accuracyDownTurns: Math.max(0, side.stacks.accuracyDownTurns - 1),
    skillDmgReducePct:
      dmgReduceBuff?.pct ?? side.stacks.skillDmgReducePct,
    skillDmgReduceTurns: dmgReduceBuff
      ? dmgReduceBuff.turns
      : side.stacks.skillDmgReduceTurns,
    skillReflectBoostPct: reflectBuff?.pct ?? side.stacks.skillReflectBoostPct,
    skillReflectBoostTurns: reflectBuff
      ? reflectBuff.turns
      : side.stacks.skillReflectBoostTurns,
    // 속박 — 위 스킬피해 배수와 동일 값(turn-start 감소/set) 사용 → 같은 턴 스킬·평타 일관.
    enemyVulnPct: blockHostileStatus
      ? side.stacks.enemyVulnPct
      : nextEnemyVulnPct,
    enemyVulnTurns: blockHostileStatus
      ? Math.max(0, side.stacks.enemyVulnTurns - 1)
      : nextEnemyVulnTurns,
    enemyMagicVulnPct:
      result.enemyMagicVulnToApply && !blockHostileStatus
        ? result.enemyMagicVulnToApply.pct
        : side.stacks.enemyMagicVulnPct ?? 0,
    enemyMagicVulnTurns:
      result.enemyMagicVulnToApply && !blockHostileStatus
        ? result.enemyMagicVulnToApply.turns
        : Math.max(0, (side.stacks.enemyMagicVulnTurns ?? 0) - 1),
    // 화상 — 이 side 에 걸린 회복 감소. 자기 턴 시작에 turns 감소(부착은 상대 cast 의 nextOpp 에서).
    healReducePct: side.stacks.healReducePct,
    healReduceTurns: Math.max(0, side.stacks.healReduceTurns - 1),
    damageDownPct: side.stacks.damageDownPct,
    damageDownTurns: Math.max(0, side.stacks.damageDownTurns - 1),
    skillProcDownPct: side.stacks.skillProcDownPct,
    skillProcDownTurns: Math.max(0, side.stacks.skillProcDownTurns - 1),
    dotVulnPct: side.stacks.dotVulnPct,
    dotVulnTurns: Math.max(0, side.stacks.dotVulnTurns - 1),
    // 주문 중첩 — 패시브 보유 + 시전 시 +1(데미지 무관, cap). PvE increment 미러.
    spellCastCount:
      (side.player.skillDmgPctPerCast ?? 0) > 0 && result.castSkillId
        ? Math.min(SPELL_STACK_CAP, side.stacks.spellCastCount + 1)
        : side.stacks.spellCastCount,
    comboHitCount: nextComboHitCount,
    signatureHitCount: nextSigHitCount,
    signatureBonusAttacksLeft:
      side.stacks.signatureBonusAttacksLeft + signatureExtraActions,
    fortressImpact: Math.max(
      0,
      side.stacks.fortressImpact - result.fortressImpactToConsume,
    ),
    mutationWeight: result.mutationTransition.weightAfter,
    ironWallReflectCharges:
      result.ironWallReflectToApply?.charges ??
      side.stacks.ironWallReflectCharges,
    ...((side.stacks.lawInscriptions != null ||
      side.player.lawInscription ||
      result.lawInscriptionsToConsume != null)
      ? { lawInscriptions: nextLawInscriptions }
      : {}),
  };
  const lawGainText = lawInscriptionGainLog(
    lawGain.gained,
    nextLawInscriptions,
  );
  const lawConsumeText = lawInscriptionConsumeLog(
    result.lawInscriptionsToConsume,
  );
  if (lawGainText) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: lawGainText,
      side: who,
    });
  }
  if (lawConsumeText) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: lawConsumeText,
      side: who,
    });
  }
  if (result.lawInscriptionComplete) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: "공격·환류·침식·수호가 하나로 이어져 완성 각인이 발동했다.",
      side: who,
    });
  }
  if (result.ironWallReflectToApply && result.castSkillName) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${result.castSkillName}] 철벽 반사 ${result.ironWallReflectToApply.charges}회 준비`,
      side: who,
    });
  }
  if (result.refreshTripleWards && result.castSkillName) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${result.castSkillName}] ${side.name} 삼중 결계 ${refreshedTripleWard.physical}회 재전개`,
      side: who,
    });
  }
  if (
    result.fortressImpactToConsume > 0 &&
    result.enemyDamage > 0 &&
    result.castSkillName
  ) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${result.castSkillName}] 충격 ${result.fortressImpactToConsume}스택 소비`,
      side: who,
    });
  }
  for (const text of mutationTransitionLogLines(
    result.castSkillName,
    result.mutationTransition,
  )) {
    nextLog = appendLog(nextLog, { kind: "info", text, side: who });
  }
  if (shieldGain > 0) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${result.castSkillName ?? "보호막"}] ${side.name} 보호막 +${shieldGain}`,
      side: who,
    });
  }
  if (result.selfRegenToApply) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${result.castSkillName ?? "운기"}] 행동마다 HP +${result.selfRegenToApply.pctMaxHpPerTurn}% (${result.selfRegenToApply.turns}행동)`,
      side: who,
    });
  }
  if (critBuff) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${result.castSkillName ?? "집중"}] 치명타 확률 +${critBuff.pct}%p (${critBuff.turns}행동)`,
      side: who,
    });
  }
  if (evaBuff) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${result.castSkillName ?? "회피"}] 회피도 +${evaBuff.pct}% (${evaBuff.turns}행동)`,
      side: who,
    });
  }
  if (dmgReduceBuff) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${result.castSkillName ?? "방어"}] 받는 피해 -${dmgReduceBuff.pct}% (${dmgReduceBuff.turns}행동)`,
      side: who,
    });
  }
  if (result.enemyVulnToApply && !blockHostileStatus) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${result.castSkillName ?? "속박"}] 적 받는 피해 +${result.enemyVulnToApply.pct}% (${result.enemyVulnToApply.turns}행동)`,
      side: who,
    });
  }
  if (result.enemyMagicVulnToApply && !blockHostileStatus) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${result.castSkillName ?? "침식"}] ${opp.name}이(가) 받는 마법 피해 +${result.enemyMagicVulnToApply.pct}% (${result.enemyMagicVulnToApply.turns}행동)`,
      side: who,
    });
  }
  if (result.enemyAccuracyDownToApply && !blockHostileStatus) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${result.castSkillName ?? "암흑"}] ${opp.name} 적중도 −${result.enemyAccuracyDownToApply.pct}% (${result.enemyAccuracyDownToApply.turns}행동)`,
      side: who,
    });
  }
  if (result.enemyAccuracyDownToApply && !blockHostileStatus) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${result.castSkillName ?? "암흑"}] ${opp.name} 적중도 −${result.enemyAccuracyDownToApply.pct}% (${result.enemyAccuracyDownToApply.turns}행동)`,
      side: who,
    });
  }
  if (result.enemyDamageDownToApply && !blockHostileStatus) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${result.castSkillName ?? "쇠약"}] ${opp.name} 주는 피해 −${result.enemyDamageDownToApply.pct}% (${result.enemyDamageDownToApply.turns}행동)`,
      side: who,
    });
  }
  if (result.enemySkillProcDownToApply && !blockHostileStatus) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${result.castSkillName ?? "금제"}] ${opp.name} 스킬 발동률 −${result.enemySkillProcDownToApply.pct}%p (${result.enemySkillProcDownToApply.turns}행동)`,
      side: who,
    });
  }
  if (result.enemyDotVulnToApply && !blockHostileStatus) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${result.castSkillName ?? "침식"}] ${opp.name} 지속/저주 피해 +${result.enemyDotVulnToApply.pct}% (${result.enemyDotVulnToApply.turns}행동)`,
      side: who,
    });
  }
  const nextSelfBuffs = applyV2BuffsToMap(tickedSelfBuffs, result.selfBuffsToApply);
  // enemyDebuff 결과는 상대 side 의 v2SelfDebuffs 에 박힌다.
  const nextOppSelfDebuffs = blockHostileStatus
    ? opp.v2SelfDebuffs
    : applyV2BuffsToMap(opp.v2SelfDebuffs, result.enemyDebuffsToApply);
  // PR-8 — dot 결과는 상대 side 의 v2Dots 에 박힌다.
  const dotsToApplyToTarget = applyPoisonDamageToDots(
    result.dotsToApplyToTarget,
    side.player,
  );
  const nextOppDots = blockHostileStatus
    ? opp.v2Dots
    : applyV2DotsToTarget(
        applyV2DotsToTarget(opp.v2Dots, dotsToApplyToTarget),
        sigSkillTargetDots,
      );
  for (const b of result.selfBuffsToApply) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${result.castSkillName ?? "강화"}] ${STAT_LABELS[b.stat]} +${b.pct}% (${b.turns}행동)`,
      side: who,
    });
  }
  for (const d of blockHostileStatus ? [] : result.enemyDebuffsToApply) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${result.castSkillName ?? "약화"}] ${STAT_LABELS[d.stat]} -${d.pct}% (${d.turns}행동)`,
      side: who,
    });
  }
  if (statusBlockTargetEffects && sigStatusBlock) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${sigStatusBlock.label}] ${opp.name} 상태이상을 막았다.`,
      side: who,
    });
  }
  if (purificationBlockTargetEffects) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${TRIPLE_WARD_LABELS.purification}] ${opp.name} 상태이상을 막았다. (${nextOppTripleWard.purification}회 남음)`,
      side: otherKey,
    });
  }
  for (const dot of blockHostileStatus ? [] : dotsToApplyToTarget) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${result.castSkillName ?? dot.label}] +${dot.stacks}스택 (${dot.turns}회)`,
      side: who,
    });
  }
  const transitionedBerserker = side.berserker
    ? applyBerserkerCastTransition(
        side.berserker,
        result.berserkerTransition,
      )
    : undefined;
  const nextBerserker = transitionedBerserker;
  const berserkerAttackStart =
    result.castSkillId &&
    V2_SKILLS[result.castSkillId]?.category === "attack"
      ? side.berserker
      : undefined;
  const castDeclaration = result.castSkillId
    ? composeDuelistDeclaration(side.v2Skills.equipped, result.castSkillId)
    : null;
  const nextDuelistBuff = castDeclaration
    ? castDeclaration
    : result.castSkillId
      ? interruptDuelistRamp(side.duelistBuff)
      : side.duelistBuff;
  if (castDeclaration) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: duelistDeclarationSummary(castDeclaration),
      side: who,
    });
  }
  const nextSide: PvPSide = {
    ...side,
    // 스킬은 이번 행동의 평타를 대체한다. 다단 적중 시그니처가 만든 추가 기본 공격만 남긴다.
    attacksLeft: result.castSkillId
      ? signatureExtraActions
      : side.attacksLeft,
    hp: nextSideHp,
    ...(nextBerserker ? { berserker: nextBerserker } : {}),
    mp: Math.min(side.maxMp, result.nextMp + sigMpRefundAmount),
    duelistBuff: nextDuelistBuff,
    buffs: hasSigSkillBuffs
      ? { ...side.buffs, ...sigSkillBuffs }
      : side.buffs,
    v2SkillCooldowns: result.nextCooldowns,
    v2SelfBuffs: nextSelfBuffs,
    v2SelfDebuffs: tickedSelfDebuffs,
    flags: skillCritAfterEvadeFired
      ? { ...side.flags, skillCritAfterEvadePending: false }
      : side.flags,
    stacks:
      healShieldAmount > 0
        ? {
            ...nextStacks,
            playerShield: nextStacks.playerShield + healShieldAmount,
          }
        : nextStacks,
  };
  // 약점 노출 — 시전자가 패시브 보유 + 시전 + 데미지 적중이면 확률로 상대 마법취약 +1(상한 클램프, 감쇠 없음).
  const magicVulnApplyChancePct = side.player.enemyMagicVulnApplyChancePct ?? 100;
  const magicVulnApplied =
    !blockHostileStatus &&
    (side.player.enemyMagicVulnPctPerStack ?? 0) > 0 &&
    result.castSkillId &&
    result.enemyDamage > 0 &&
    magicVulnApplyChancePct > 0 &&
    (magicVulnApplyChancePct >= 100 ||
      Math.random() * 100 < magicVulnApplyChancePct);
  const nextOppMagicVuln =
    magicVulnApplied
      ? Math.min(MAGIC_VULN_STACK_CAP, opp.stacks.magicVulnStacks + 1)
      : opp.stacks.magicVulnStacks;
  if (nextOppMagicVuln > opp.stacks.magicVulnStacks) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[흉조] ${opp.name}에게 마법취약 +1 (${nextOppMagicVuln}/${MAGIC_VULN_STACK_CAP})`,
      side: who,
    });
  }
  const nextOpp: PvPSide = {
    ...opp,
    hp: nextOppHp,
    magicBarrier: nextOppMagicBarrier,
    flags: {
      ...opp.flags,
      enduranceTriggered:
        opp.flags.enduranceTriggered || skillEnduranceFires,
      statusBlockUsed:
        opp.flags.statusBlockUsed || statusBlockTargetEffects,
    },
    ...(nextOppBerserker
      ? {
          berserker: finishBerserkerCurrentActionGuard(nextOppBerserker),
        }
      : {}),
    v2SelfDebuffs: nextOppSelfDebuffs,
    v2Dots: nextOppDots,
    stacks: {
      ...opp.stacks,
      tripleWard: nextOppTripleWard,
      playerShield: nextOppShield,
      magicVulnStacks: nextOppMagicVuln,
      // 화상 부착 — 시전자가 상대에게 회복 감소 디버프. 상대는 자기 턴(cast hook)에 turns 감소.
      healReducePct: !blockHostileStatus && result.enemyHealReduceToApply
        ? result.enemyHealReduceToApply.pct
        : opp.stacks.healReducePct,
      healReduceTurns: !blockHostileStatus && result.enemyHealReduceToApply
        ? result.enemyHealReduceToApply.turns
        : opp.stacks.healReduceTurns,
      accuracyDownPct:
        !blockHostileStatus && result.enemyAccuracyDownToApply
          ? result.enemyAccuracyDownToApply.pct
          : opp.stacks.accuracyDownPct,
      accuracyDownTurns: !blockHostileStatus && result.enemyAccuracyDownToApply
        ? result.enemyAccuracyDownToApply.turns
        : opp.stacks.accuracyDownTurns,
      damageDownPct: !blockHostileStatus && result.enemyDamageDownToApply
        ? result.enemyDamageDownToApply.pct
        : opp.stacks.damageDownPct,
      damageDownTurns: !blockHostileStatus && result.enemyDamageDownToApply
        ? result.enemyDamageDownToApply.turns
        : opp.stacks.damageDownTurns,
      skillProcDownPct:
        !blockHostileStatus && result.enemySkillProcDownToApply
          ? result.enemySkillProcDownToApply.pct
          : opp.stacks.skillProcDownPct,
      skillProcDownTurns:
        !blockHostileStatus && result.enemySkillProcDownToApply
        ? result.enemySkillProcDownToApply.turns
        : opp.stacks.skillProcDownTurns,
      dotVulnPct: !blockHostileStatus && result.enemyDotVulnToApply
        ? result.enemyDotVulnToApply.pct
        : opp.stacks.dotVulnPct,
      dotVulnTurns: !blockHostileStatus && result.enemyDotVulnToApply
        ? result.enemyDotVulnToApply.turns
        : opp.stacks.dotVulnTurns,
      ...(!blockHostileStatus && sigSkill.hitShock
        ? { shockAction: "pending" as const }
        : {}),
    },
  };
  const selfHastePct = result.selfHasteToApply?.pct ?? 0;
  const enemyDelayPct = blockHostileStatus
    ? 0
    : result.enemyDelayToApply?.pct ?? 0;
  let next: PvPBattleState = { ...st, log: nextLog };
  next = setSide(next, who, nextSide);
  next = setSide(next, otherKey, nextOpp);
  let tier6ExtraActions = 0;
  if (result.castSkillId && next[who].stacks.tier6Uniques) {
    const actionId = side.turn.completedPlayerTurns + 1;
    const dotsBefore = tier6PvpDotContext(opp);
    const statusKindsBefore = tier6PvpStatusKindCount(side, opp);
    next = applyTier6UniquePvpEvent(next, who, otherKey, {
      kind: "action_start",
      shield: side.stacks.playerShield,
      maxHp: side.maxHp,
      origin: { actionId, eventId: next.log.length },
    });
    if (costPaid > 0) {
      next = applyTier6UniquePvpEvent(next, who, otherKey, {
        kind: "mp_spent",
        amount: costPaid,
        magicAtk: tier6UnityMagicAtk,
        targetHasStatus: statusKindsBefore > 0,
        origin: { actionId, eventId: next.log.length },
      });
    }
    for (let index = 0; index < tier6SkillHitDamages.length; index += 1) {
      const attacksBefore = next[who].attacksLeft;
      next = applyTier6UniquePvpEvent(next, who, otherKey, {
        kind: "direct_hit",
        damage: tier6SkillHitDamages[index]!,
        crit: skillCritFired,
        attackKind: "skill",
        paidMp: index === 0 ? costPaid : 0,
        statusKinds: statusKindsBefore,
        bleedStacks: dotsBefore.bleed.stacks,
        bleedRemainingDamage: dotsBefore.bleed.remainingDamage,
        poisonStacks: dotsBefore.poison.stacks,
        poisonRemainingDamage: dotsBefore.poison.remainingDamage,
        magicAtk: tier6UnityMagicAtk,
        maxHp: side.maxHp,
        origin: { actionId, eventId: next.log.length + index + 1 },
      });
      tier6ExtraActions += Math.max(
        0,
        next[who].attacksLeft - attacksBefore,
      );
    }
    if (resolvedSelfHeal > 0) {
      next = applyTier6UniquePvpEvent(next, who, otherKey, {
        kind: "heal_calculated",
        amount: resolvedSelfHeal,
        maxHp: side.maxHp,
        origin: { actionId, eventId: next.log.length },
      });
    }
    const tier6ShieldGain = shieldGain + healShieldAmount;
    if (tier6ShieldGain > 0) {
      next = applyTier6UniquePvpEvent(next, who, otherKey, {
        kind: "shield_gained",
        amount: tier6ShieldGain,
        maxHp: side.maxHp,
        origin: { actionId, eventId: next.log.length },
      });
    }
    next = applyTier6UniquePvpEvent(next, who, otherKey, {
      kind: "hp_threshold",
      currentHp: next[who].hp,
      maxHp: side.maxHp,
      origin: { actionId, eventId: next.log.length },
    });
  }
  if (
    next[otherKey].stacks.tier6Uniques &&
    opp.stacks.playerShield > 0 &&
    nextOppShield <= 0 &&
    skillShieldAbsorbed > 0
  ) {
    next = applyTier6UniquePvpEvent(next, otherKey, who, {
      kind: "shield_broken",
      shieldBefore: opp.stacks.playerShield,
      overflowDamage: skillDamageToHp,
      maxHp: opp.maxHp,
      origin: {
        actionId: side.turn.completedPlayerTurns + 1,
        eventId: next.log.length,
      },
    });
  }
  if (next[otherKey].stacks.tier6Uniques) {
    next = applyTier6UniquePvpEvent(next, otherKey, who, {
      kind: "hp_threshold",
      currentHp: next[otherKey].hp,
      maxHp: next[otherKey].maxHp,
      origin: {
        actionId: side.turn.completedPlayerTurns + 1,
        eventId: next.log.length,
      },
    });
  }
  if (skillGuaranteedEvaded && result.castSkillName) {
    next = applyDodgeEffects(
      next,
      who,
      otherKey,
      `[회피 강화] ${opp.name}이(가) ${side.name}의 ${result.castSkillName}을(를) 회피했다.`,
      true,
      true,
    );
  }
  // 직접 피해 스킬도 한 번의 피격 행동으로 반사를 발동한다. 다단 스킬은 회피 판정과 동일하게
  // 한 행동으로 취급하며, 스킬로 방어자가 쓰러진 경우에는 평타와 마찬가지로 반사하지 않는다.
  if (
    skillReflectBase > 0 &&
    next[otherKey].hp > 0 &&
    next.phase !== "ended"
  ) {
    const reflected = applyOnHitReflect(
      next,
      who,
      otherKey,
      skillReflectBase,
      false,
      skillDamageToHp <= 0,
    );
    next = reflected.state;
    if (reflected.attackerKilled) {
      return {
        state: next,
        castFired: result.castSkillId != null,
        signatureExtraActions: signatureExtraActions + tier6ExtraActions,
        selfHastePct,
        enemyDelayPct,
      };
    }
  }
  if (
    result.castSkillId &&
    V2_SKILLS[result.castSkillId]?.category === "attack"
  ) {
    next = finishPvPBerserkerAttackAction(
      next,
      who,
      berserkerAttackStart,
    );
  }
  // 스킬 데미지로 상대가 쓰러지면 즉시 전투 종료 (PvE resolveBattle 의 enemyHp<=0 가드 미러).
  //   이 가드가 없으면 상대 HP 0 인 채로 시전자의 후속 액션이 한 스텝 더 진행된다 — 평타면 시체를
  //   한 번 더 때려(cosmetic) 결국 종료되지만, 포션 등 비공격 액션이면 죽은 쪽으로 페이즈가 넘어가는
  //   잠재 버그. 다단히트로 치명 시전이 흔해져 가드 필수. main loop 가 phase==="ended" 를 받아 처리.
  if (nextOppHp <= 0 && next.phase !== "ended") {
    return {
      state: {
        ...next,
        log: appendLog(next.log, {
          kind: "info",
          text: `${opp.name}이(가) 쓰러졌다.`,
          side: who,
        }),
        phase: "ended",
        outcome: who === "p1" ? "p1_win" : "p2_win",
      },
      castFired: result.castSkillId != null,
      signatureExtraActions: signatureExtraActions + tier6ExtraActions,
      selfHastePct,
      enemyDelayPct,
    };
  }
  const provokeImmediateBasicAttacks = result.castSkillId
    ? Math.max(
        0,
        Math.floor(
          V2_SKILLS[result.castSkillId]?.provokeImmediateBasicAttacks ?? 0,
        ),
      )
    : 0;
  if (provokeImmediateBasicAttacks > 0 && result.castSkillName) {
    next = applyImmediateProvokedBasicAttacksPvP(
      next,
      who,
      provokeImmediateBasicAttacks,
      result.castSkillName,
    );
  }
  return {
    state: next,
    castFired: result.castSkillId != null,
    signatureExtraActions: signatureExtraActions + tier6ExtraActions,
    selfHastePct,
    enemyDelayPct,
  };
}

function resolveBattlePvPLegacy(
  p1Player: PlayerCombat,
  p2Player: PlayerCombat,
  p1Name: string,
  p2Name: string,
  ctx: PvPResolveContext,
): PvPBattleResolution {
  const initiative = pickPvpInitiative(
    p1Player.spd,
    p2Player.spd,
    ctx.initiativeRoll ?? Math.random(),
  );
  const potions = {
    p1: { ...ctx.potions.p1 },
    p2: { ...ctx.potions.p2 },
  };
  const consumed = {
    p1: {} as Partial<Record<PotionId, number>>,
    p2: {} as Partial<Record<PotionId, number>>,
  };
  let state = initialBattleStatePvP(
    p1Player,
    p2Player,
    p1Name,
    p2Name,
    ctx.v2Skills?.p1,
    ctx.v2Skills?.p2,
    ctx.damageMultiplier,
    ctx.sustainMultiplier,
    initiative,
  );
  // PR-7a — 옛 spell 시스템 폐기. start-of-battle one-shot 도 제거됐고, v2 스킬 cast hook
  // 이 각 side 의 첫 turn 진입 시 1회 발동 (resolveBattlePvP main loop).
  if (state.p1.hp <= 0 && state.p2.hp <= 0) {
    state = { ...state, outcome: "draw", phase: "ended" };
  } else if (state.p1.hp <= 0) {
    state = { ...state, outcome: "p2_win", phase: "ended" };
  } else if (state.p2.hp <= 0) {
    state = { ...state, outcome: "p1_win", phase: "ended" };
  }
  // 전술 안내(#502 가시성을 PvP 경로에도) — ctx.openingNote(양측 전술 라벨)를 마주섬·선공
  // 안내 다음에 info 로 끼운다. 호출부가 문자열로 빌드(엔진은 stance 를 모름).
  if (ctx.openingNote) {
    state = {
      ...state,
      log: [...state.log, { kind: "info", text: ctx.openingNote, turn: "player" }],
    };
  }
  // hp_bar 는 p1=player / p2=enemy 관점으로 박는다. challenge API 가 me=p1 로
  // 호출하므로 그대로 도전자 시점 렌더에 맞음. (대전자 시점 미러가 필요해지면
  // 동일 데이터를 그쪽 관점으로 swap 해 새 entry 생성.)
  const hpBarEntry = (s: PvPBattleState): BattleLogEntry => {
    const playerResources = mergeLawInscriptionSnapshot(
      mergeTripleWardResourceSnapshot(
        activeTier6ResourceSnapshot(s.p1.stacks.tier6Uniques),
        s.p1.stacks.tripleWard,
      ),
      s.p1.stacks.lawInscriptions,
    );
    const enemyResources = mergeLawInscriptionSnapshot(
      mergeTripleWardResourceSnapshot(
        activeTier6ResourceSnapshot(s.p2.stacks.tier6Uniques),
        s.p2.stacks.tripleWard,
      ),
      s.p2.stacks.lawInscriptions,
    );
    return {
      kind: "hp_bar",
    text: "",
    playerHp: s.p1.hp,
    playerMaxHp: s.p1.maxHp,
    enemyHp: s.p2.hp,
    enemyMaxHp: s.p2.maxHp,
    // v2 MP — p1 시점 (challenge API 가 me=p1 로 호출). p1 INT 0 = 둘 다 0 → UI 비표시.
    playerMp: s.p1.mp,
    playerMaxMp: s.p1.maxMp,
    enemyMp: s.p2.mp,
    enemyMaxMp: s.p2.maxMp,
    playerMagicBarrier: s.p1.magicBarrier,
    playerMagicBarrierMax: s.p1.maxMagicBarrier,
    enemyMagicBarrier: s.p2.magicBarrier,
    enemyMagicBarrierMax: s.p2.maxMagicBarrier,
    ...(playerResources
      ? {
          playerSignatureResources: playerResources,
        }
      : {}),
    ...(enemyResources
      ? {
          enemySignatureResources: enemyResources,
        }
      : {}),
    };
  };
  let turns = 0;
  // v2 스킬 (PR-4a) — 각 side 의 턴 진입 시 1회 cast (framework only).
  // advanceTurnPvP 는 attacksLeft > 0 (다대시·블록 등) 일 때 같은 phase 를 반환하므로
  // loop iteration 하나가 곧 한 turn 은 아니다 — per-side phase-entry flag 로 dedupe.
  // 효과 적용은 PR-4b. 옛 applyStartOfBattleSpellsPvP (battle-start one-shot) 와 별개.
  const v2CastedThisPhase: { p1: boolean; p2: boolean } = { p1: false, p2: false };
  const v2SkillConsumedThisPhase: { p1: boolean; p2: boolean } = {
    p1: false,
    p2: false,
  };
  const evasionRecoveryAppliedThisPhase: { p1: boolean; p2: boolean } = {
    p1: false,
    p2: false,
  };
  while (state.phase !== "ended") {
    const who: "p1" | "p2" = state.phase === "p1" ? "p1" : "p2";
    const other: "p1" | "p2" = who === "p1" ? "p2" : "p1";
    // who 가 이번 phase 의 actor — 다른 쪽 flag 는 reset (그 쪽 다음 phase 에서 1회 보장).
    v2CastedThisPhase[other] = false;
    v2SkillConsumedThisPhase[other] = false;
    evasionRecoveryAppliedThisPhase[other] = false;
    const shockEntry = enterShockAction(state[who].stacks.shockAction);
    if (state[who].stacks.shockAction !== shockEntry.next) {
      const side = state[who];
      state = setSide(state, who, {
        ...side,
        stacks: { ...side.stacks, shockAction: shockEntry.next },
      });
    }
    if (shockEntry.skip) {
      const side = state[who];
      state = setSide(
        {
          ...state,
          log: appendLog(state.log, {
            kind: "info",
            text: `[감전] ${side.name}이(가) 움직이지 못했다.`,
            side: who,
          }),
        },
        who,
        {
          ...side,
          attacksLeft: 0,
          buffs:
            side.turn.completedPlayerTurns > 0
              ? decrementTimedEffects(side.buffs)
              : side.buffs,
          v2SelfBuffs: tickV2BuffMap(side.v2SelfBuffs),
          v2SelfDebuffs: tickV2BuffMap(side.v2SelfDebuffs),
        },
      );
      state = endAttackerPhase(state, who, other, {
        skipOffensiveFollowups: true,
      });
    } else {
      if (!evasionRecoveryAppliedThisPhase[who]) {
        evasionRecoveryAppliedThisPhase[who] = true;
        state = applyEvasionActionRecoveryPvP(state, who);
      }
      let castFiredThisPhase = v2SkillConsumedThisPhase[who];
      if (!v2CastedThisPhase[who]) {
        v2CastedThisPhase[who] = true;
        // legacy(턴제)는 ATB 템포(selfHaste/enemyDelay)를 쓰지 않는다.
        const cast = castV2SkillOnAttackerTurnPvP(state, who);
        state = cast.state;
        castFiredThisPhase = cast.castFired;
        v2SkillConsumedThisPhase[who] = cast.castFired;
        if (
          cast.castFired &&
          cast.signatureExtraActions <= 0 &&
          state.phase === who
        ) {
          state = endAttackerPhase(state, who, other);
        }
        // 스킬 피해 또는 페이즈 종료 후처리로 side 가 사망하면 후속 처리를 건너뛴다.
        if (state.phase === "ended") {
          state = { ...state, log: appendLog(state.log, hpBarEntry(state)) };
          turns += 1;
          break;
        }
      }
      if (state.phase === who) {
        let action: PlayerAction = { kind: "attack" };
        if (!castFiredThisPhase) {
          const picked = ctx.pickAction(state, who);
          if (picked.kind === "use_potion") {
            const have = potions[who][picked.potionId] ?? 0;
            if (have > 0) {
              potions[who][picked.potionId] = have - 1;
              consumed[who][picked.potionId] =
                (consumed[who][picked.potionId] ?? 0) + 1;
              action = picked;
            }
          } else {
            action = picked;
          }
        }
        const prevLogLen = state.log.length;
        state = advanceTurnPvP(state, action);
        // advanceTurnPvP 안에서 push 된 entry 들은 모두 이번 액터(who) 의 것.
        // 이미 side 가 박힌 entry 는 보존.
        if (state.log.length > prevLogLen) {
          const tagged = state.log.map((e, idx) =>
            idx < prevLogLen || e.side ? e : { ...e, side: who },
          );
          state = { ...state, log: tagged };
        }
      }
    }
    // 턴 종료 시점 HP/AP 스냅샷. 종료된 상태(phase==="ended")에서도 한 번 박는다.
    state = { ...state, log: appendLog(state.log, hpBarEntry(state)) };
    turns += 1;
    // PvP 무한 루프 가드 / 시간 캡. 양쪽 다 데미지 0 이면 hp% 로 승부 결정 (높은 쪽 승, 동률 무승부).
    if (turns > PVP_TURN_CAP && state.phase !== "ended") {
      const p1Frac = state.p1.hp / state.p1.maxHp;
      const p2Frac = state.p2.hp / state.p2.maxHp;
      const outcome: PvPOutcome =
        p1Frac > p2Frac ? "p1_win" : p2Frac > p1Frac ? "p2_win" : "draw";
      return {
        outcome,
        finalState: { ...state, phase: "ended", outcome },
        potionsConsumed: consumed,
        turns,
      };
    }
    // 안전 가드 — 더 큰 절대 캡.
    if (turns > 1000) {
      return {
        outcome: "draw",
        finalState: { ...state, phase: "ended", outcome: "draw" },
        potionsConsumed: consumed,
        turns,
      };
    }
  }
  return {
    outcome: state.outcome ?? "draw",
    finalState: state,
    potionsConsumed: consumed,
    turns,
  };
}

export function resolveBattlePvP(
  p1Player: PlayerCombat,
  p2Player: PlayerCombat,
  p1Name: string,
  p2Name: string,
  ctx: PvPResolveContext,
): PvPBattleResolution {
  if (V2_CORE_LOOP_V2) {
    return resolveBattlePvPAtb(p1Player, p2Player, p1Name, p2Name, ctx);
  }
  return resolveBattlePvPLegacy(p1Player, p2Player, p1Name, p2Name, ctx);
}
