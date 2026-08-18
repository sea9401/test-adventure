import type { Monster } from "@/adventure/data/monsters";
import { statusNameForDebuffStat } from "@/adventure/data/v2/statusEffects";
import {
  effectiveCombatPatternFromEquipped,
  smartDefaultPatternFromEquipped,
  aggregateEquippedPassives,
  rebalanceDynamicV2SkillEffects,
  V2_SKILLS,
} from "@/adventure/data/v2/v2Skills";
import {
  computeMpRestoreAmount,
  type Potion,
  type PotionId,
} from "@/adventure/data/potions";
import {
  applyV2BuffsToMap,
  applyBleedChangeToDots,
  bleedChangeLogText,
  applyV2DotsToTarget,
  applyPlayerPoisonDamageScaling,
  damageBetween,
  DAMAGE_FLOOR_FRACTION,
  defaultV2MaxMpFor,
  decrementTimedBuffs,
  distributeV2DotTicks,
  makeBleedDot,
  makePoisonDot,
  potionHealAmount,
  applyComboFinisherToHits,
  resolveV2SkillCast,
  type V2SkillCastInput,
  type V2SkillCastResult,
  type V2SkillDotApply,
  distributeBoostedHits,
  rollAttackCount,
  statusDamageAfterReduction,
  tickV2BuffMap,
  tickV2Dots,
  v2AtkBuffMult,
  v2DefBuffMult,
  v2DotLogCause,
  v2DamageAmount,
  v2MagicBuffMult,
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
  resolveDirectSkillHitSignatures,
  rollEvasionActionRecovery,
  resolveTrackedShieldAbsorption,
  SIGNATURE_CRIT_POISON_PCT_MAX_HP_PER_STACK,
  SIGNATURE_HIT_POISON_PCT_MAX_HP_PER_STACK,
  statusBlockOnce,
  trackedBattleStartShield,
  trackedShieldBreakEffect,
} from "./signatureEffects";
import { canApplyShock, enterShockAction } from "./shockAction";
import { V2_COMBAT_PATTERN_ENABLED } from "./combatPattern";
import {
  CRIT_PCT_CAP,
  STAT_LABELS,
} from "@/adventure/data/stats";
import {
  ANALYSIS_PENALTY_CAP_PCT,
  BLEED_MAX_STACKS,
  HEAVEN_DECREE_HP_PCT,
  LUCKY_STAR_DAMAGE_MULT,
  MAGIC_VULN_STACK_CAP,
  RAMPAGE_START_TURN,
  SKILL_CRIT_MULT,
  SPELL_STACK_CAP,
  applyEvasionDamageReduction,
  cappedDefReductionPct,
  evasionDamageReductionPct,
  pveEvasionDamageReductionPct,
} from "@/adventure/data/v2/v2CombatConstants";
import {
  magicBarrierCombatLogEntries,
  resolveMagicBarrierDamage,
  type MagicBarrierDamageResult,
} from "./magicBarrier";
import { resolvePlayerPhase } from "./engine.playerPhase";
import { resolveEnemyPhase } from "./engine.enemyPhase";
import {
  composeDuelistDeclaration,
  duelistDeclarationSummary,
  interruptDuelistRamp,
} from "./duelistCombat";
import {
  computeCritOverflowBonus,
  computeDirectSkillDamage,
  reducedMagicDefense,
} from "./engine.damageHelpers";
import {
  consumeShadowFollowUp,
  recordSwordShadow,
  refineSwordShadow,
} from "./shadowBladeCombat";
import {
  gainSwordIntent,
  ruinSwordBonuses,
  startRuinCharge,
} from "./ruinBladeCombat";
import { resolveCrossover, type CrossFamily } from "./skyAscendantCombat";
import {
  formulaCompletionOverdraftSkillIds,
  formulaStagesForCast,
  previewFormulaCast,
} from "./primordialSageCombat";
import {
  V2_CORE_LOOP_V2,
  V2_SKILL_PROC_IN_PATTERN,
} from "@/adventure/data/v2/coreLoopConfig";
import { resolveBattleAtb } from "./engine.atb";
import {
  hasTier6Unique,
  initialTier6UniqueRuntime,
  activeTier6ResourceSnapshot,
} from "./tier6UniqueEffects";
import {
  addLawInscriptionGain,
  emptyLawInscriptionState,
  lawInscriptionConsumeLog,
  lawInscriptionGainLog,
  mergeLawInscriptionSnapshot,
} from "./lawInscription";
import {
  applyTier6UniquePveEvent,
  tier6DotContext,
  tier6StatusKindCount,
} from "./tier6UniquePveAdapter";
import {
  applyBerserkerCastTransition,
  applyBerserkerLethalDamage,
  berserkerCastContext,
  clampBerserkerGuardedHp,
  finishBerserkerCurrentActionGuard,
  finishBerserkerPlayerAttack,
  initialBerserkerCombatState,
} from "./berserkerCombat";
import {
  consumeReactiveDefenseCharges,
  ironWallDamageReductionPct,
  resolveFortressReaction,
} from "./fortressKnight";
import {
  consumePurificationWard,
  initialTripleWardState,
  mergeTripleWardResourceSnapshot,
  refreshTripleWardState,
  resolveTripleWardDamage,
  TRIPLE_WARD_LABELS,
  tripleWardStabilityReductionPct,
  type TripleWardDamageKind,
  type TripleWardState,
} from "./tripleWard";
import {
  effectiveMutationDef,
  mutationTransitionLogLines,
} from "./mutationCombat";
import {
  formatFrostChillGainLog,
  formatFrostChillTriggerLog,
  freezeRawDamage,
  mergeFrostChillSnapshot,
  resolveFrostChillGain,
} from "./frostChill";

import {
  BOSS_MAX_HP_DAMAGE_MULT,
  BOSS_PCT_HP_DAMAGE_MULT,
  mergeTier7ResourceSnapshot,
  type BattleBuffs,
  type BattleLogEntry,
  type BattleOutcome,
  type BattleStacks,
  type BattleState,
  type PlayerAction,
  type PlayerCombat,
} from "./engineState";
export {
  BOSS_MAX_HP_DAMAGE_MULT,
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

function applyTrackedSetShieldAbsorptionPve(
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

type EnemySkillMitigation = {
  damage: number;
  evasionReductionPct: number;
  evasionReducedBy: number;
  resolveReducedBy: number;
  endureReducedBy: number;
  passiveReducedBy: number;
  stabilityReducedBy: number;
  stabilityStacksBefore: number;
  wardReductions: Array<{
    kind: TripleWardDamageKind;
    reductionPct: number;
    reducedBy: number;
    remaining: number;
  }>;
  tripleWard: TripleWardState;
  guardReducedBy: number;
  steadfastReducedBy: number;
};

function resolveEnemySkillReflection(
  state: BattleState,
  player: PlayerCombat,
  result: Pick<V2SkillCastResult, "enemyDamage">,
  mitigation: EnemySkillMitigation,
  damageToHp: number,
  shieldAbsorbed: number,
  fortressReaction: ReturnType<typeof resolveFortressReaction>,
): { damage: number; labels: string[]; genericReflectEligible: boolean } {
  const landed = result.enemyDamage > 0;
  const hitStoppedByShield = shieldAbsorbed > 0 && damageToHp <= 0;
  const reflectBase = Math.max(
    0,
    result.enemyDamage - mitigation.evasionReducedBy,
  );
  const thornsDamage =
    landed && !hitStoppedByShield && (player.thornsPct ?? 0) > 0
      ? Math.floor((reflectBase * (player.thornsPct ?? 0)) / 100)
      : 0;
  const brambleDamage =
    landed && !hitStoppedByShield && (player.bramblePct ?? 0) > 0
      ? Math.floor((reflectBase * (player.bramblePct ?? 0)) / 100)
      : 0;
  const infiniteDamage =
    landed && !hitStoppedByShield && (player.infiniteThornsAtkPct ?? 0) > 0
      ? Math.floor(
          (state.enemy.atk * (player.infiniteThornsAtkPct ?? 0)) / 100,
        )
      : 0;
  const enchantDamage =
    landed && (player.enchantReflectPct ?? 0) > 0 && damageToHp > 0
      ? Math.floor((damageToHp * (player.enchantReflectPct ?? 0)) / 100)
      : 0;
  const wardenDamage =
    landed && !hitStoppedByShield && (player.thornsFlatFromDef ?? 0) > 0
      ? player.thornsFlatFromDef ?? 0
      : 0;
  const genericRaw =
    thornsDamage +
    brambleDamage +
    infiniteDamage +
    enchantDamage +
    wardenDamage;
  const reflectBoostPct =
    state.stacks.skillReflectBoostTurns > 0
      ? state.stacks.skillReflectBoostPct
      : 0;
  const boostedGenericRaw =
    reflectBoostPct > 0
      ? Math.floor(genericRaw * (1 + reflectBoostPct / 100))
      : genericRaw;
  const totalRaw = boostedGenericRaw + fortressReaction.rawReflectDamage;
  const targetDef = playerFacingEnemyDef(state, player);
  const targetDefMult = v2DefBuffMult(
    state.enemyV2SelfBuffs,
    state.enemyV2Debuffs,
  );
  const damage =
    totalRaw > 0
      ? damageBetween(
          totalRaw,
          targetDefMult !== 1
            ? Math.floor(targetDef * targetDefMult)
            : targetDef,
        )
      : 0;
  const labels: string[] = [];
  if (thornsDamage > 0) labels.push("반사 갑주");
  if (brambleDamage > 0) labels.push("가시 갑옷");
  if (infiniteDamage > 0) labels.push("무한 가시");
  if (enchantDamage > 0) labels.push("별빛 반사");
  if (wardenDamage > 0) labels.push("수호 반사");
  if (reflectBoostPct > 0 && genericRaw > 0) labels.push("반사 증폭");
  if (fortressReaction.ironWallReflected) labels.push("철벽 반사");
  return {
    damage,
    labels,
    genericReflectEligible: genericRaw > 0,
  };
}

function reduceIncomingEnemySkillDamage(
  state: BattleState,
  player: PlayerCombat,
  result: Pick<V2SkillCastResult, "enemyDamage" | "magicEnemyDamage">,
  applyTripleWard = true,
): EnemySkillMitigation {
  const damage = result.enemyDamage;
  if (damage <= 0) {
    return {
      damage: 0,
      evasionReductionPct: 0,
      evasionReducedBy: 0,
      resolveReducedBy: 0,
      endureReducedBy: 0,
      passiveReducedBy: 0,
      stabilityReducedBy: 0,
      stabilityStacksBefore: state.stacks.tripleWard.stabilityStacks,
      wardReductions: [],
      tripleWard: state.stacks.tripleWard,
      guardReducedBy: 0,
      steadfastReducedBy: 0,
    };
  }
  const evasionReductionPct = playerPveEvasionReductionPct(state, player);
  const afterEvasion = applyEvasionDamageReduction(
    damage,
    evasionReductionPct,
  );
  const afterEnemyDamageDown =
    state.stacks.enemyDamageDownTurns > 0 &&
    state.stacks.enemyDamageDownPct > 0
      ? Math.max(
          1,
          Math.floor(
            afterEvasion * (1 - state.stacks.enemyDamageDownPct / 100),
          ),
        )
      : afterEvasion;
  const afterResolve =
    state.buffs.playerDmgReductionTurnsLeft > 0 &&
    state.buffs.playerDmgReductionPct > 0
      ? Math.max(
          1,
          Math.floor(
            afterEnemyDamageDown *
              (1 - state.buffs.playerDmgReductionPct / 100),
          ),
        )
      : afterEnemyDamageDown;
  const endurePct = player.enchantEndurePct ?? 0;
  const afterEndure =
    endurePct > 0
      ? Math.max(1, Math.floor(afterResolve * (1 - endurePct / 100)))
      : afterResolve;
  const activeReductionPct =
    state.stacks.skillDmgReduceTurns > 0
      ? state.stacks.skillDmgReducePct
      : 0;
  const lowHpReductionPct = lowHpDamageReductionPct(
    player.equipSignatures,
    state.playerHp,
    player.maxHp,
  );
  const generalReductionPct =
    (player.passiveDamageTakenReductionPct ?? 0) +
    activeReductionPct +
    ironWallDamageReductionPct(state.stacks.ironWallReflectCharges) +
    lowHpReductionPct;
  const openingMagicReductionPct =
    result.magicEnemyDamage > 0 &&
    state.turn.enemyPhasesCompleted <
      (player.passiveOpeningMagicDamageReductionPhases ?? 0)
      ? (player.passiveOpeningMagicDamageReductionPct ?? 0)
      : 0;
  const magicDamageShare = Math.min(
    1,
    Math.max(0, result.magicEnemyDamage / Math.max(1, damage)),
  );
  const passiveReductionPct =
    generalReductionPct + openingMagicReductionPct * magicDamageShare;
  const afterPassive = passiveReductionPct > 0
    ? Math.max(
        1,
        Math.floor(afterEndure * (1 - passiveReductionPct / 100)),
      )
    : afterEndure;
  const stabilityPct = applyTripleWard
    ? tripleWardStabilityReductionPct(state.stacks.tripleWard)
    : 0;
  const afterStability = stabilityPct > 0
    ? Math.max(1, Math.floor(afterPassive * (1 - stabilityPct / 100)))
    : afterPassive;
  let tripleWard = state.stacks.tripleWard;
  const wardReductions: EnemySkillMitigation["wardReductions"] = [];
  let afterWards = afterStability;
  if (applyTripleWard && afterStability > 0) {
    const physicalDamage = Math.floor(afterStability * (1 - magicDamageShare));
    const magicDamage = afterStability - physicalDamage;
    let resolvedTotal = 0;
    for (const [kind, part] of [
      ["physical", physicalDamage],
      ["magic", magicDamage],
    ] as const) {
      if (part <= 0) continue;
      const ward = resolveTripleWardDamage(tripleWard, kind, "pve", [part]);
      tripleWard = ward.state;
      resolvedTotal += ward.totalDamage;
      if (ward.consumed) {
        wardReductions.push({
          kind,
          reductionPct: ward.reductionPct,
          reducedBy: part - ward.totalDamage,
          remaining: ward.remaining,
        });
      }
    }
    afterWards = resolvedTotal;
  }
  const guard = player.guard;
  const afterGuard =
    guard &&
    guard.turns > 0 &&
    state.turn.enemyPhasesCompleted < guard.turns
      ? Math.max(0, afterWards - guard.reduction)
      : afterWards;
  const steadfastFlat = player.steadfastWillFlat ?? 0;
  const afterSteadfast =
    steadfastFlat > 0 ? Math.max(0, afterGuard - steadfastFlat) : afterGuard;
  return {
    damage: afterSteadfast,
    evasionReductionPct,
    evasionReducedBy: damage - afterEvasion,
    resolveReducedBy: afterEnemyDamageDown - afterResolve,
    endureReducedBy: afterResolve - afterEndure,
    passiveReducedBy: afterEndure - afterPassive,
    stabilityReducedBy: afterPassive - afterStability,
    stabilityStacksBefore: state.stacks.tripleWard.stabilityStacks,
    wardReductions,
    tripleWard,
    guardReducedBy: afterWards - afterGuard,
    steadfastReducedBy: afterGuard - afterSteadfast,
  };
}

function resolveIncomingEnemySkillWithBarrier(
  state: BattleState,
  player: PlayerCombat,
  result: Pick<V2SkillCastResult, "enemyDamage" | "magicEnemyDamage">,
): {
  barrier: MagicBarrierDamageResult;
  mitigation: EnemySkillMitigation;
} {
  let mitigation: EnemySkillMitigation | undefined;
  const magicShare = Math.min(
    1,
    Math.max(0, result.magicEnemyDamage / Math.max(1, result.enemyDamage)),
  );
  const barrier = resolveMagicBarrierDamage({
    rawDamage: result.enemyDamage,
    durability: state.playerMagicBarrier ?? 0,
    absorbPct: player.magicBarrierAbsorbPct,
    efficiencyPct: player.magicBarrierEfficiencyPct,
    eligible: true,
    mitigateBody: (bodyRawDamage) => {
      mitigation = reduceIncomingEnemySkillDamage(state, player, {
        enemyDamage: bodyRawDamage,
        magicEnemyDamage: Math.floor(bodyRawDamage * magicShare),
      });
      return mitigation.damage;
    },
  });
  return {
    barrier,
    mitigation:
      mitigation ?? reduceIncomingEnemySkillDamage(state, player, result, false),
  };
}

function appendEnemySkillMitigationLogs(
  log: BattleLogEntry[],
  mitigation: EnemySkillMitigation,
): BattleLogEntry[] {
  let next = log;
  if (mitigation.evasionReducedBy > 0) {
    next = appendLog(next, {
      kind: "info",
      text: `[회피 경감 ${mitigation.evasionReductionPct.toFixed(1)}%] 피해 -${mitigation.evasionReducedBy}`,
    });
  }
  if (mitigation.resolveReducedBy > 0) {
    next = appendLog(next, {
      kind: "info",
      text: `[결의] 피해 -${mitigation.resolveReducedBy}`,
    });
  }
  if (mitigation.endureReducedBy > 0) {
    next = appendLog(next, {
      kind: "info",
      text: `[인내] 피해 -${mitigation.endureReducedBy}`,
    });
  }
  if (mitigation.passiveReducedBy > 0) {
    next = appendLog(next, {
      kind: "info",
      text: `[받피감] 피해 -${mitigation.passiveReducedBy}`,
    });
  }
  if (mitigation.stabilityReducedBy > 0) {
    next = appendLog(next, {
      kind: "info",
      text: `[영역 안정 ${mitigation.stabilityStacksBefore}중첩] 피해 -${mitigation.stabilityReducedBy}`,
    });
  }
  for (const ward of mitigation.wardReductions) {
    next = appendLog(next, {
      kind: "info",
      text: `[${TRIPLE_WARD_LABELS[ward.kind]}] 직접 ${ward.kind === "magic" ? "마법" : "물리"} 피해 ${ward.reductionPct}% 감소 (${ward.remaining}회 남음)`,
    });
  }
  if (mitigation.guardReducedBy > 0) {
    next = appendLog(next, {
      kind: "info",
      text: `[가드] 피해 -${mitigation.guardReducedBy}`,
    });
  }
  if (mitigation.steadfastReducedBy > 0) {
    next = appendLog(next, {
      kind: "info",
      text: `[굳건한 의지] 피해 -${mitigation.steadfastReducedBy}`,
    });
  }
  return next;
}

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
  calculatedHeal: number = actualHeal,
): BattleState {
  const sig = healToShield(player.equipSignatures, {
    actualHeal,
    calculatedHeal,
    maxHp: state.playerMaxHp,
  });
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

export function playerPveEvasionReductionPct(
  state: BattleState,
  player: PlayerCombat,
): number {
  const luckEvadeBonus = state.flags.luckyBuffActive
    ? player.doubleLuck?.evade ?? 0
    : 0;
  const temporaryEvasionIncreasePct =
    luckEvadeBonus +
    (player.universalLuckBonusPct ?? 0) +
    state.buffs.cyclingChiBonus +
    (state.stacks.skillEvasionTurns > 0 ? state.stacks.skillEvasionPct : 0);
  const chillSlowPct =
    state.enemy.skill?.kind === "chill"
      ? state.stacks.chillStacks *
        (state.enemy.skill.evasionPenaltyPerStack ?? 0)
      : 0;
  const accuracyDownPct =
    state.stacks.enemyAccuracyDownTurns > 0
      ? state.stacks.enemyAccuracyDownPct
      : 0;
  const enemyAccuracy = Math.max(
    0,
    (state.enemy.accuracy ?? 0) *
      (1 - Math.min(100, Math.max(0, accuracyDownPct)) / 100),
  );
  const evasionRating = Math.max(
    0,
    (player.evaRating ?? player.evasionPct) *
      (1 + Math.max(0, temporaryEvasionIncreasePct) / 100) *
      (1 - Math.min(100, Math.max(0, chillSlowPct)) / 100),
  );
  return pveEvasionDamageReductionPct(evasionRating, enemyAccuracy);
}

// 소유자 행동 시작 회복 — 행동 시작 DoT 생존 확인 뒤, 스킬/평타/포션 선택 전에 한 번 호출한다.
export function applyEvasionActionRecoveryPvE(
  state: BattleState,
  player: PlayerCombat,
  playerName: string,
  roll: () => number = Math.random,
): BattleState {
  const recovery = rollEvasionActionRecovery(
    player.equipSignatures,
    state.playerHp,
    state.playerMaxHp,
    playerPveEvasionReductionPct(state, player),
    roll,
  );
  if (!recovery) return state;
  const nextHp = Math.min(state.playerMaxHp, state.playerHp + recovery.amount);
  const actual = nextHp - state.playerHp;
  if (actual <= 0) return state;
  const next = {
    ...state,
    playerHp: nextHp,
    log: appendLog(state.log, {
      kind: "info" as const,
      text: `[${recovery.label}] ${playerName}의 HP +${actual}`,
      turn: "player" as const,
    }),
  };
  return applyHealShieldIfAny(next, player, actual, recovery.amount);
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

function isEnemyBleeding(state: BattleState): boolean {
  return state.enemyV2Dots.some((d) => d.tag === "bleed" && d.stacks > 0 && d.turns > 0);
}

function isEnemyPoisoned(state: BattleState): boolean {
  return state.enemyV2Dots.some((d) => d.tag === "poison" && d.stacks > 0 && d.turns > 0);
}

function playerSkillTargetDef(state: BattleState, player: PlayerCombat): number {
  // 평타와 같은 고정·비율 관통, 전투 중 방어 디버프, 상시 감소와 부식을 순서대로 한 번만 적용한다.
  return playerFacingEnemyDef(state, player);
}

function playerSkillTargetMagicDef(
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

function applyPoisonDamageToDots(
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
  const enemyHp = Math.max(0, state.enemyHp - dmg);
  let next: BattleState = {
    ...state,
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
  }, player, actual, regen.amount);
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
  }, player, actual, heal);
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
  }, player, actual, heal);
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
    const enemyBleedBeforeTick = state.enemyV2Dots.find(
      (dot) => dot.tag === "bleed" && dot.turns > 0,
    );
    const enemyDotTick = tickV2Dots(
      state.enemyV2Dots,
      state.enemy.hp,
      state.maxHpDamageMult ??
        (state.isBoss ? BOSS_MAX_HP_DAMAGE_MULT : 1),
    );
    const enemyDotDamageBeforeReduction =
      enemyDotTick.totalDmg > 0 && state.stacks.enemyDotVulnTurns > 0
        ? Math.floor(enemyDotTick.totalDmg * (1 + state.stacks.enemyDotVulnPct / 100))
        : enemyDotTick.totalDmg;
    const enemyDotDamage = statusDamageAfterReduction(
      enemyDotDamageBeforeReduction,
      state.enemy.statusDamageReductionPct,
    );
    if (enemyDotDamage > 0) {
      const actualEnemyDotDamage = Math.min(state.enemyHp, enemyDotDamage);
      const actualBleedDamage =
        distributeV2DotTicks(enemyDotTick.ticks, actualEnemyDotDamage).find(
          (tick) => tick.tag === "bleed",
        )?.damage ?? 0;
      const newHp = Math.max(0, state.enemyHp - enemyDotDamage);
      let dotLog = distributeV2DotTicks(
        enemyDotTick.ticks,
        enemyDotDamage,
      ).reduce(
        (log, tick) =>
          appendLog(log, {
            kind: "info",
            effect: "status_damage",
            text: `${state.enemy.name}이(가) ${v2DotLogCause(tick)} ${tick.damage} 피해를 입었다.`,
          }),
        state.log,
      );
      const bleedTickHealPct =
        enemyBleedBeforeTick && enemyBleedBeforeTick.stacks >= BLEED_MAX_STACKS
          ? state.v2Skills.equipped.reduce((sum, skillId) => {
              const mechanic = V2_SKILLS[skillId]?.passive
                ? V2_SKILLS[skillId]?.bleedHunt
                : undefined;
              return (
                sum + Math.max(0, mechanic?.bleedTickHealMaxHpPct ?? 0)
              );
            }, 0)
          : 0;
      const bleedTickHeal =
        actualBleedDamage > 0 && bleedTickHealPct > 0
          ? Math.floor((state.playerMaxHp * bleedTickHealPct) / 100)
          : 0;
      const nextPlayerHp = Math.min(
        state.playerMaxHp,
        state.playerHp + bleedTickHeal,
      );
      const actualBleedTickHeal = nextPlayerHp - state.playerHp;
      if (actualBleedTickHeal > 0) {
        dotLog = appendLog(dotLog, {
          kind: "info",
          text: `[피의 양식] HP ${actualBleedTickHeal} 회복했다.`,
          turn: "enemy",
        });
      }
      state = applyPhaseTriggerIfAny({
        ...state,
        playerHp: nextPlayerHp,
        enemyHp: newHp,
        enemyV2Dots: enemyDotTick.nextDots,
        log: dotLog,
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
  // 협동 보스 등에서 최대 HP 비례 지속 피해 성분만 별도 감산할 때 사용한다.
  // isBoss 기본값은 BOSS_MAX_HP_DAMAGE_MULT(0.8), 미지정 일반 전투는 1.
  maxHpDamageMult?: number;
  // 전투 시작 로그에 박을 안내 한 줄(전술 등). 호출부가 문자열로 빌드해 넘긴다
  // (엔진은 stance 를 모름 — 순환 의존 회피). 미지정이면 추가 안 함.
  openingNote?: string;
  // v2 스킬 상태 (PR-4a) — saves_kv "skills.v2" 의 learned/equipped. 미지정/빈 배열이면
  // v2 스킬 cast no-op. 라우트가 saves_kv 에서 읽어 넘긴다.
  v2Skills?: import("@/adventure/data/v2/v2Skills").V2SkillsState;
  // 밸런스 시뮬레이터·엔진 테스트 전용. 빌드 환경 플래그와 무관하게 양쪽 ATB 스킬을 켠다.
  // 일반 게임 호출부는 넘기지 않으며, 라이브 동작은 V2_ATB_SKILLS 설정을 그대로 따른다.
  forceAtbSkills?: boolean;
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
  /** 전투 상한에 도달해 강제 종료된 경우. 사냥에서는 무승부성 패배로 판정한다. */
  endReason?: "timeout";
  finalState: BattleState;
  potionsConsumed: Partial<Record<PotionId, number>>;
  turns: number;
};

function evadeIncomingEnemySkill(
  state: BattleState,
  player: PlayerCombat,
  result: V2SkillCastResult,
): { state: BattleState; result: V2SkillCastResult } {
  if (
    !result.castSkillId ||
    result.enemyDamage <= 0 ||
    state.stacks.evadesRemaining <= 0
  ) {
    return { state, result };
  }

  let nextLog = appendLog(state.log, {
    kind: "info",
    text: `[회피 강화] ${state.enemy.name}의 ${result.castSkillName ?? "스킬 공격"}을(를) 회피했다!`,
  });
  const critAfterEvadePrepared =
    !!player.skillCritAfterEvade && !state.flags.skillCritAfterEvadePending;
  if (critAfterEvadePrepared) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[흑월지배] 다음 직접 피해 스킬 치명타 준비.`,
    });
  }

  const evadeHeal = player.evadeHealAmount ?? 0;
  const nextPlayerHp =
    evadeHeal > 0
      ? Math.min(state.playerMaxHp, state.playerHp + evadeHeal)
      : state.playerHp;
  const actualHeal = nextPlayerHp - state.playerHp;
  const sigShield =
    actualHeal > 0
      ? healToShield(player.equipSignatures, {
          actualHeal,
          calculatedHeal: evadeHeal,
          maxHp: state.playerMaxHp,
        })
      : null;
  if (actualHeal > 0) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[곡예] 플레이어의 HP +${actualHeal}`,
    });
  }
  if (sigShield) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${sigShield.label}] 플레이어 보호막 +${sigShield.amount}`,
    });
  }

  const speedBuff = onDodgeSpeedBuff(player.equipSignatures);
  if (speedBuff) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${speedBuff.label}] 플레이어의 속도 +${Math.round((speedBuff.mult - 1) * 100)}% (${speedBuff.turns}행동)`,
    });
  }
  const activeSpeedMult =
    state.buffs.playerSpdTurnsLeft > 0 ? state.buffs.playerSpdMult : 1;
  let nextState: BattleState = {
    ...state,
    playerHp: nextPlayerHp,
    playerAttacksLeft:
      state.playerAttacksLeft + (player.skirmishNextTurnBonus ?? 0),
    buffs: speedBuff
      ? {
          ...state.buffs,
          playerSpdMult: Math.max(activeSpeedMult, speedBuff.mult),
          playerSpdTurnsLeft: Math.max(
            state.buffs.playerSpdTurnsLeft,
            speedBuff.turns,
          ),
        }
      : state.buffs,
    flags: critAfterEvadePrepared
      ? { ...state.flags, skillCritAfterEvadePending: true }
      : state.flags,
    stacks: {
      ...state.stacks,
      evadesRemaining: state.stacks.evadesRemaining - 1,
      playerShield:
        state.stacks.playerShield + (sigShield?.amount ?? 0),
    },
    log: nextLog,
  };
  const counter = applyCounterIfAny(nextState, player);
  nextState = counter.state;

  return {
    state: nextState,
    result: {
      ...result,
      enemyDamage: 0,
      magicEnemyDamage: 0,
      dotsToApplyToTarget: [],
      enemyDebuffsToApply: [],
      enemyVulnToApply: undefined,
      enemyEvasionDownToApply: undefined,
      enemyAccuracyDownToApply: undefined,
      enemyDelayToApply: undefined,
      enemyHealReduceToApply: undefined,
      enemyDamageDownToApply: undefined,
      enemySkillProcDownToApply: undefined,
      enemyDotVulnToApply: undefined,
    },
  };
}

// v2 적(몬스터) 스킬 시전 — applyPlayerV2SkillCast 의 적 대칭판(ATB 라이브 경로용).
//   ⚠️ ATB 전용: 버프/디버프 tick 은 tickEnemyBundleEntry/tickPlayerBundleEntry(번들)가 이미 했으므로
//   여기선 tick 없이 cast 결정 + 효과 적용만 한다(player cast 헬퍼와 동일 소유권 모델 — 이중 tick 방지).
//   레거시 advanceTurn 의 인라인 적 cast 는 자체 tick 을 가지므로 별개이며, 양쪽 모두 직접 피해를
//   보호막으로 먼저 흡수하고 HP 피해가 남을 때만 피격 반격을 허용한다.
//   🔑 v2Skills 미장착 몹은 즉시 no-op → 기존 전투 전부 byte-identical(골든 불변). MP·쿨다운(소모) +
//   데미지/힐/HP비용/자버프/적디버프/도트 + lethal 까지. "시전=평타 XOR"(skipBasic)은 호출부가 처리.
export function applyEnemyV2SkillCast(
  state: BattleState,
  player: PlayerCombat,
): { state: BattleState; castFired: boolean } {
  if (state.enemyV2Skills.equipped.length === 0) {
    return { state, castFired: false };
  }
  let result = resolveV2SkillCast({
    skills: state.enemyV2Skills,
    cooldowns: state.enemyV2SkillCooldowns,
    procRoll: Math.random() * 100,
    procChanceBonus:
      state.stacks.enemySkillProcDownTurns > 0
        ? -state.stacks.enemySkillProcDownPct
        : 0,
    attacker: {
      mp: state.enemyMp,
      atk: state.enemy.atk,
      maxHp: state.enemy.hp,
      def: state.enemy.def,
      currentHp: state.enemyHp,
      maxMp: state.enemyMaxMp,
      selfBuffs: state.enemyV2SelfBuffs,
      selfDebuffs: state.enemyV2Debuffs,
      characterElement: state.enemy.element,
    },
    target: {
      def: effectiveMutationDef(
        player.def,
        state.stacks.mutationWeight,
        player.stoneskinDefPctPerWeight ?? 0,
      ),
      magicDef: player.magicDef,
      selfBuffs: state.v2SelfBuffs,
      selfDebuffs: state.v2SelfDebuffs,
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
  const guaranteedEvade = evadeIncomingEnemySkill(state, player, result);
  state = guaranteedEvade.state;
  result = guaranteedEvade.result;
  if (state.phase === "ended") {
    return {
      state: {
        ...state,
        enemyMp: result.nextMp,
        enemyV2SkillCooldowns: result.nextCooldowns,
      },
      castFired: true,
    };
  }
  let nextPlayerHp = state.playerHp;
  let nextEnemyHp = state.enemyHp;
  let nextLog = state.log;
  const fortressReaction = resolveFortressReaction({
    landed: result.enemyDamage > 0,
    defenderDef: effectiveMutationDef(
      player.def,
      state.stacks.mutationWeight,
      player.stoneskinDefPctPerWeight ?? 0,
    ),
    impact: state.stacks.fortressImpact,
    impactOnHit: player.fortressImpactOnHit ?? false,
    ironWallReflectCharges: state.stacks.ironWallReflectCharges,
  });
  const resolvedEnemySkill = resolveIncomingEnemySkillWithBarrier(
    state,
    player,
    result,
  );
  const mitigation = resolvedEnemySkill.mitigation;
  nextLog = appendEnemySkillMitigationLogs(nextLog, mitigation);
  const enemySkillMagicBarrier = resolvedEnemySkill.barrier;
  const enemySkillShieldAbsorbed = Math.min(
    state.stacks.playerShield,
    enemySkillMagicBarrier.hpBoundDamage,
  );
  const enemySkillDamageToHp =
    enemySkillMagicBarrier.hpBoundDamage - enemySkillShieldAbsorbed;
  const nextPlayerShield =
    state.stacks.playerShield - enemySkillShieldAbsorbed;
  const enemySkillReflection = resolveEnemySkillReflection(
    state,
    player,
    result,
    mitigation,
    enemySkillDamageToHp,
    enemySkillShieldAbsorbed,
    fortressReaction,
  );
  const reactiveDefenseCharges = consumeReactiveDefenseCharges(
    {
      evasion: state.stacks.skillEvasionTurns,
      damageReduction: state.stacks.skillDmgReduceTurns,
      reflect: state.stacks.skillReflectBoostTurns,
    },
    {
      evasionUsed:
        result.enemyDamage > 0 && state.stacks.skillEvasionTurns > 0,
      landed: result.enemyDamage > 0,
      reflectEligible: enemySkillReflection.genericReflectEligible,
    },
  );
  if (result.enemyDamage > 0 && result.castSkillName) {
    if (enemySkillShieldAbsorbed > 0) {
      nextLog = appendLog(nextLog, {
        kind: "info",
        text: `[철벽] 보호막이 ${enemySkillShieldAbsorbed} 흡수 (남은 ${nextPlayerShield})`,
      });
    }
    for (const entry of magicBarrierCombatLogEntries(enemySkillMagicBarrier)) {
      nextLog = appendLog(nextLog, entry);
    }
    nextPlayerHp = Math.max(0, nextPlayerHp - enemySkillDamageToHp);
    nextLog = appendLog(nextLog, {
      kind: "enemy_attack",
      text: `${result.castSkillName}! ${enemySkillDamageToHp} 피해를 입혔다.`,
    });
    const survival = applyBerserkerHostileDamage(
      { ...state, playerHp: nextPlayerHp, log: nextLog },
      player,
      nextPlayerHp,
    );
    state = survival.state;
    nextPlayerHp = state.playerHp;
    nextLog = state.log;
  }
  if (fortressReaction.impact > state.stacks.fortressImpact) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[충격 방벽] 충격 +1 (현재 ${fortressReaction.impact}/3)`,
      turn: "enemy",
    });
  }
  if (enemySkillReflection.damage > 0) {
    nextEnemyHp = Math.max(0, nextEnemyHp - enemySkillReflection.damage);
    nextLog = appendLog(nextLog, {
      kind: "player_attack",
      text: `[${enemySkillReflection.labels.join(" + ")}] ${state.enemy.name}에게 ${enemySkillReflection.damage} 반사 피해.`,
      turn: "enemy",
    });
  }
  if (fortressReaction.ironWallReflected) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[철벽 태세] 철벽 반사 ${fortressReaction.ironWallReflectCharges}회 남음`,
      turn: "enemy",
    });
  }
  const enemySkillEnduranceFires =
    nextPlayerHp <= 0 &&
    !!player.enduranceActive &&
    !state.flags.enduranceTriggered;
  if (enemySkillEnduranceFires) {
    nextPlayerHp = 1;
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[불굴] 마지막 한 숨 — HP 1 로 버텼다!`,
      turn: "enemy",
    });
  }
  if (nextEnemyHp > 0 && result.selfHeal > 0 && result.castSkillName) {
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
  if (nextEnemyHp > 0 && result.selfHpCost > 0) {
    nextEnemyHp = Math.max(1, nextEnemyHp - result.selfHpCost);
  }
  const nextEnemySelfBuffs = applyV2BuffsToMap(
    state.enemyV2SelfBuffs,
    result.selfBuffsToApply,
  );
  const sigStatusBlock = statusBlockOnce(player.equipSignatures);
  const hasHostileStatus =
    result.enemyDebuffsToApply.length > 0 ||
    result.dotsToApplyToTarget.length > 0;
  const statusBlockTargetEffects =
    hasHostileStatus &&
    !!sigStatusBlock &&
    !state.flags.statusBlockUsed;
  const purificationBlockTargetEffects =
    hasHostileStatus &&
    !statusBlockTargetEffects &&
    mitigation.tripleWard.purification > 0;
  const blockHostileStatus =
    statusBlockTargetEffects || purificationBlockTargetEffects;
  const nextTripleWard = purificationBlockTargetEffects
    ? consumePurificationWard(mitigation.tripleWard).state
    : mitigation.tripleWard;
  const nextPlayerDebuffs = blockHostileStatus
    ? state.v2SelfDebuffs
    : applyV2BuffsToMap(state.v2SelfDebuffs, result.enemyDebuffsToApply);
  const nextPlayerDots = blockHostileStatus
    ? state.playerV2Dots
    : applyV2DotsToTarget(state.playerV2Dots, result.dotsToApplyToTarget);
  for (const b of result.selfBuffsToApply) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${result.castSkillName ?? "강화"}] ${STAT_LABELS[b.stat]} +${b.pct}% (${b.turns}행동)`,
      turn: "enemy",
    });
  }
  for (const d of blockHostileStatus ? [] : result.enemyDebuffsToApply) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${[result.castSkillName, statusNameForDebuffStat(d.stat)].filter(Boolean).join(" + ") || "약화"}] ${STAT_LABELS[d.stat]} -${d.pct}% (대상 행동 ${d.turns}회)`,
      turn: "enemy",
    });
  }
  if (statusBlockTargetEffects && sigStatusBlock) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${sigStatusBlock.label}] 상태이상을 막았다.`,
      turn: "enemy",
    });
  }
  if (purificationBlockTargetEffects) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${TRIPLE_WARD_LABELS.purification}] 상태이상을 막았다. (${nextTripleWard.purification}회 남음)`,
      turn: "enemy",
    });
  }
  for (const dot of blockHostileStatus ? [] : result.dotsToApplyToTarget) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${[result.castSkillName, dot.label].filter(Boolean).join(" + ")}] +${dot.stacks}스택 (${dot.turns}회)`,
      turn: "enemy",
    });
  }
  const countered =
    enemySkillDamageToHp > 0 && result.castSkillName
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
    playerMagicBarrier: enemySkillMagicBarrier.durabilityLeft,
    enemyHp: nextEnemyHp,
    enemyMp: result.nextMp,
    enemyV2SkillCooldowns: result.nextCooldowns,
    enemyV2SelfBuffs: nextEnemySelfBuffs,
    v2SelfDebuffs: nextPlayerDebuffs,
    playerV2Dots: nextPlayerDots,
    flags: {
      ...state.flags,
      enduranceTriggered:
        state.flags.enduranceTriggered || enemySkillEnduranceFires,
      statusBlockUsed:
        state.flags.statusBlockUsed || statusBlockTargetEffects,
    },
    stacks: {
      ...state.stacks,
      tripleWard: nextTripleWard,
      playerShield: nextPlayerShield,
      skillEvasionTurns: reactiveDefenseCharges.evasion,
      skillDmgReduceTurns: reactiveDefenseCharges.damageReduction,
      skillReflectBoostTurns: reactiveDefenseCharges.reflect,
      fortressImpact: fortressReaction.impact,
      ironWallReflectCharges: fortressReaction.ironWallReflectCharges,
    },
    log: nextLog,
  };
  nextState = applyTrackedSetShieldAbsorptionPve(
    nextState,
    player,
    enemySkillShieldAbsorbed,
  );
  if (
    nextState.stacks.tier6Uniques &&
    state.stacks.playerShield > 0 &&
    nextPlayerShield <= 0 &&
    enemySkillShieldAbsorbed > 0
  ) {
    nextState = applyTier6UniquePveEvent(nextState, player, {
      kind: "shield_broken",
      shieldBefore: state.stacks.playerShield,
      overflowDamage: enemySkillDamageToHp,
      maxHp: nextState.playerMaxHp,
      origin: {
        actionId: nextState.turn.enemyPhasesCompleted + 1,
        eventId: nextState.log.length,
      },
    });
  }
  if (nextState.stacks.tier6Uniques) {
    nextState = applyTier6UniquePveEvent(nextState, player, {
      kind: "hp_threshold",
      currentHp: nextState.playerHp,
      maxHp: nextState.playerMaxHp,
      origin: {
        actionId: nextState.turn.enemyPhasesCompleted + 1,
        eventId: nextState.log.length,
      },
    });
  }
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
  } else if (nextState.enemyHp <= 0) {
    nextState = {
      ...nextState,
      enemyHp: 0,
      log: appendLog(nextState.log, {
        kind: "info",
        text: `${state.enemy.name}을(를) 쓰러뜨렸다!`,
        turn: "enemy",
      }),
      outcome: "win",
      phase: "ended",
    };
  }
  if (nextState.berserker) {
    nextState = {
      ...nextState,
      berserker: finishBerserkerCurrentActionGuard(nextState.berserker),
    };
  }
  return { state: nextState, castFired: true };
}

// v2 플레이어 스킬 시전 + 효과 적용 — resolveBattleLegacy 에서 추출(ATB 경로 공유용).
// buff/debuff tick 은 호출부 책임(legacy=인라인 tick, ATB=tickPlayerBundleEntry). lethal 체크와
// "시전=완료 턴"(평타 XOR) 처리도 호출부가 루프 모델에 맞게 한다. 이 함수는 cast 결정 + 데미지/힐/
// 마나/HP비용/버프/디버프/도트/취약·실명·암흑 + state 업데이트(로그 포함)까지만 한다(byte-identical).
function applyImmediateProvokedEnemyBasicAttacks(
  state: BattleState,
  player: PlayerCombat,
  playerName: string,
  count: number,
  skillName: string,
): BattleState {
  const attacks = Math.max(0, Math.floor(count));
  if (attacks <= 0 || state.phase === "ended") return state;
  const originalPhase = state.phase;
  const originalEnemyAttacksLeft = state.turn.enemyAttacksLeft;
  const originalEnemyPhasesCompleted = state.turn.enemyPhasesCompleted;
  let next: BattleState = {
    ...state,
    phase: "enemy",
    turn: { ...state.turn, enemyAttacksLeft: attacks },
    log: appendLog(state.log, {
      kind: "info",
      text: `[${skillName}] ${state.enemy.name}이(가) 즉시 기본 공격 ${attacks}회!`,
      turn: "player",
    }),
  };
  for (let index = 0; index < attacks && next.phase !== "ended"; index += 1) {
    if (index > 0 && next.phase !== "enemy") break;
    const logStart = next.log.length;
    next = resolveEnemyPhase(next, player, playerName, false, false, true);
    if (next.log.length > logStart) {
      next = {
        ...next,
        log: next.log.map((entry, logIndex) =>
          logIndex < logStart || entry.turn
            ? entry
            : { ...entry, turn: "enemy" as const },
        ),
      };
    }
  }
  if (next.phase === "ended") return next;
  return {
    ...next,
    phase: originalPhase,
    turn: {
      ...next.turn,
      enemyAttacksLeft: originalEnemyAttacksLeft,
      enemyPhasesCompleted: originalEnemyPhasesCompleted,
    },
  };
}

export function applyPlayerV2SkillCast(
  state: BattleState,
  player: PlayerCombat,
  ticked: {
    selfBuffs: import("./combatShared").V2BuffMap;
    selfDebuffs: import("./combatShared").V2BuffMap;
    enemyDebuffs: import("./combatShared").V2BuffMap;
  },
  playerName = "플레이어",
): {
  state: BattleState;
  castFired: boolean;
  /** 이번 스킬의 실제 적중 횟수로 발생한 추가 기본 공격 수. */
  signatureExtraActions: number;
  // 바람/대지 ATB 템포(원소술사) — 비-ATB(legacy) 호출부는 무시. ATB 루프가 틱 계산에 반영.
  selfHastePct: number;
  enemyDelayPct: number;
} {
  const tickedSelfBuffs = ticked.selfBuffs;
  const tickedSelfDebuffs = ticked.selfDebuffs;
  const tickedEnemyDebuffs = ticked.enemyDebuffs;
  const shadowCoreEquipped = state.v2Skills.equipped.includes(
    "v2c_shadowblade_swordshadow",
  );
  const formulaCoreEquipped = state.v2Skills.equipped.includes(
    "v2c_primordialsage_completeformula",
  );
  const formulaOptimizationEquipped = state.v2Skills.equipped.includes(
    "v2c_primordialsage_optimization",
  );
  const formulaState = state.stacks.tier7?.formula ?? {
    stages: 0,
    seenSkillIds: [],
  };
  const formulaOverdraftSkillIds =
    formulaCoreEquipped && formulaOptimizationEquipped
      ? formulaCompletionOverdraftSkillIds({
          state: formulaState,
          learned: state.v2Skills.learned,
          equipped: state.v2Skills.equipped,
        })
      : [];
  const tier6UnityPct =
    (state.buffs.tier6UnityTurnsLeft ?? 0) > 0
      ? state.buffs.tier6UnityHealPct ?? 0
      : 0;
  const tier6UnityMult = 1 + tier6UnityPct / 100;
  const tier6UnityAtk = Math.floor(player.atk * tier6UnityMult);
  const tier6UnityMagicAtk = Math.floor(
    (player.magicAtk ?? player.atk) * tier6UnityMult,
  );
  const activeEnemyBleed = state.enemyV2Dots.find(
    (dot) => dot.tag === "bleed" && dot.turns > 0,
  );
  const needsBleedHuntRoll = state.v2Skills.equipped.some(
    (skillId) =>
      V2_SKILLS[skillId]?.bleedHunt?.directPhysicalHitBleedExtend != null,
  );
  const castInput: V2SkillCastInput = {
    skills: state.v2Skills,
    cooldowns: state.v2SkillCooldowns,
    magicMpCostReductionPct: formulaOptimizationEquipped ? 20 : 0,
    mpOverdraftSkillIds: formulaOverdraftSkillIds,
    procRoll: Math.random() * 100,
    bleedHuntRoll: needsBleedHuntRoll ? Math.random() * 100 : undefined,
    procChanceBonus: player.skillProcChanceAdd ?? 0,
    // 패턴 경로에서도 procChance 굴림(부활) — 플래그 on 이면 패턴이 고른 스킬도 확률 게이트 통과 필요.
    applyProcInPattern: V2_SKILL_PROC_IN_PATTERN,
    // 전투 패턴(갬빗) — 플래그 on 일 때만 주입(플레이어 cast). off 면 옛 슬롯순서+proc.
    // 저장된 커스텀 패턴(C2) 우선, 없으면 장착 스킬 종류별 스마트 기본 패턴(유틸 스팸 방지).
    turn: state.turn.completedPlayerTurns + 1,
    combatPattern: V2_COMBAT_PATTERN_ENABLED
      ? effectiveCombatPatternFromEquipped(
          state.v2Skills.equipped,
          state.v2Skills.pattern ??
            smartDefaultPatternFromEquipped(state.v2Skills.equipped),
        )
      : undefined,
    berserker: state.berserker
      ? berserkerCastContext(
          player.berserkerMadnessRank ?? 0,
          state.berserker,
        )
      : undefined,
    attacker: {
      mp: state.playerMp,
      atk: tier6UnityAtk,
      attackCount: player.attackCount,
      magicAtk: tier6UnityMagicAtk,
      singleHitPhysicalSkillDamagePct:
        player.singleHitPhysicalSkillDamagePct,
      minDamage: player.minDamage,
      magicMinDamage: player.magicMinDamage,
      healMult: player.healMult,
      maxHp: state.playerMaxHp,
      // PR2-B — def/vit 비례 딜·현재HP(사혈격/기공순환)·maxMp(보호막/명상)·차수 flat.
      def: effectiveMutationDef(
        player.def,
        state.stacks.mutationWeight,
        player.stoneskinDefPctPerWeight ?? 0,
      ),
      str: player.strStat,
      int: player.intStat,
      vit: player.vitStat,
      dex: player.dexStat,
      luk: player.lukStat,
      spi: player.spiStat,
      allStatTotal: player.allStatTotal,
      currentHp: state.playerHp,
      maxMp: state.playerMaxMp,
      classTier: player.classTier,
      fortressImpact: state.stacks.fortressImpact,
      ironWallReflectCharges: state.stacks.ironWallReflectCharges,
      fortressImpactDamagePctPerStack:
        player.fortressImpactDamagePctPerStack,
      fortressDefSkillStatCoefPct: player.fortressDefSkillStatCoefPct,
      lawInscription: player.lawInscription,
      lawInscriptions: state.stacks.lawInscriptions,
      mutationWeight: state.stacks.mutationWeight,
      bleedPhysicalSkillDamagePctPerStack:
        player.bleedPhysicalSkillDamagePctPerStack,
      // 활성 상태 효과 — self_buff_pct 조건 평가용(만료 시 재시전 선풍각·철포·운기 등).
      selfShield: state.stacks.playerShield,
      selfShieldActive: state.stacks.playerShield > 0,
      // 군림·질주·적랑 등 장비 발동형 속도 버프는 v2SelfBuffs 가 아니라 BattleBuffs 에 저장된다.
      selfStatBuffActive: {
        spd: state.buffs.playerSpdTurnsLeft > 0,
      },
      selfBuffPctActive: {
        evasion: state.stacks.skillEvasionTurns > 0,
        crit: state.stacks.skillCritTurns > 0,
        damageReduction: state.stacks.skillDmgReduceTurns > 0,
        reflectDamage: state.stacks.skillReflectBoostTurns > 0,
        regen: state.stacks.skillRegenTurns > 0,
        guaranteedEvade: state.stacks.evadesRemaining > 0,
        duelistDeclaration: (state.duelistBuff?.remainingBasicHits ?? 0) > 0,
      },
      selfBuffs: tickedSelfBuffs,
      selfDebuffs: tickedSelfDebuffs,
      characterElement: player.characterElement,
    },
    target: {
      def: playerSkillTargetDef(state, player),
      magicDef: playerSkillTargetMagicDef(state, player),
      // PR-5b: monster 측 v2 self buff 도 def 곱셈에 반영 (격리 해제 일관).
      selfBuffs: state.enemyV2SelfBuffs,
      selfDebuffs: tickedEnemyDebuffs,
      // PR2-B — 처단(처형 임계)·스택 payoff(참절/중독폭발/비전작렬).
      currentHp: state.enemyHp,
      maxHp: state.enemy.hp,
      executeHpThresholdFloorPct:
        state.isBoss === true ? 0 : NORMAL_MONSTER_EXECUTION_HP_PCT,
      bleedStacks: activeEnemyBleed?.stacks ?? 0,
      bleedTurns: activeEnemyBleed?.turns ?? 0,
      poisonStacks: state.enemyV2Dots.filter((d) => d.tag === "poison").reduce((s, d) => s + d.stacks, 0),
      magicVulnStacks: state.stacks.enemyMagicVulnStacks,
      frostChillStacks: state.stacks.enemyFrostChillStacks,
      enemyVulnerabilityActive: state.stacks.enemyVulnTurns > 0,
      enemyDamageDownActive: state.stacks.enemyDamageDownTurns > 0,
      enemySkillProcDownActive: state.stacks.enemySkillProcDownTurns > 0,
      enemyHealReductionActive: state.stacks.enemyHealReduceTurns > 0,
    },
  };
  const ruinChargeAtActionStart = state.stacks.tier7?.ruinCharge;
  let result = ruinChargeAtActionStart
    ? resolveV2SkillCast({
        ...castInput,
        skills: {
          learned: ["v2c_ruinblade_ruinsword"],
          equipped: ["v2c_ruinblade_ruinsword"],
        },
        cooldowns: {
          ...state.v2SkillCooldowns,
          v2c_ruinblade_ruinsword: 0,
        },
        combatPattern: undefined,
        procRoll: 0,
        attacker: {
          ...castInput.attacker,
          mp: Math.max(castInput.attacker.mp, 100),
        },
      })
    : resolveV2SkillCast(castInput);
  const rerunSelectedCast = (
    current: V2SkillCastResult,
    overrides: Pick<
      V2SkillCastInput,
      "directDamagePiercePctAdd" | "directDamagePiercePctOverride"
    > & {
      attacker?: Partial<V2SkillCastInput["attacker"]>;
    },
  ): V2SkillCastResult => {
    if (!current.castSkillId) return current;
    const tier7AttackerOverride =
      current.castSkillId === "v2c_swordsaint_flash" && shadowCoreEquipped
        ? { str: Math.max(player.strStat ?? 0, player.lukStat ?? 0) }
        : current.castSkillId === "v2c_celestialdragon_combo" &&
            state.v2Skills.equipped.includes("v2c_skyascendant_crossover")
          ? { str: Math.max(player.strStat ?? 0, player.dexStat ?? 0) }
          : {};
    return resolveV2SkillCast({
      ...castInput,
      ...overrides,
      skills: {
        ...castInput.skills,
        equipped: [
          current.castSkillId,
          ...castInput.skills.equipped.filter(
            (skillId) => skillId !== current.castSkillId,
          ),
        ],
      },
      cooldowns: {
        ...castInput.cooldowns,
        [current.castSkillId]: 0,
      },
      combatPattern: undefined,
      procRoll: 0,
      attacker: {
        ...castInput.attacker,
        ...tier7AttackerOverride,
        ...overrides.attacker,
        mp: ruinChargeAtActionStart
          ? Math.max(castInput.attacker.mp, 100)
          : castInput.attacker.mp,
      },
    });
  };
  if (
    result.castSkillId === "v2c_swordsaint_flash" &&
    shadowCoreEquipped
  ) {
    result = rerunSelectedCast(result, {
      attacker: {
        str: Math.max(player.strStat ?? 0, player.lukStat ?? 0),
      },
    });
  } else if (
    result.castSkillId === "v2c_celestialdragon_combo" &&
    state.v2Skills.equipped.includes("v2c_skyascendant_crossover")
  ) {
    result = rerunSelectedCast(result, {
      attacker: {
        str: Math.max(player.strStat ?? 0, player.dexStat ?? 0),
      },
    });
  }
  if (ruinChargeAtActionStart) {
    result = {
      ...result,
      nextMp: state.playerMp,
      nextCooldowns: state.v2SkillCooldowns,
    };
  }
  const startingRuinCharge =
    !ruinChargeAtActionStart &&
    result.castSkillId === "v2c_ruinblade_ruinsword";
  if (startingRuinCharge) {
    result = {
      ...result,
      enemyDamage: 0,
      magicEnemyDamage: 0,
      hitDamages: [],
    };
  }
  const castDefinition = result.castSkillId
    ? V2_SKILLS[result.castSkillId]
    : undefined;
  const directDamageEffects = castDefinition?.effects.filter(
    (effect) => effect.kind === "damage",
  );
  const isSinglePhysicalSkill =
    castDefinition?.category === "attack" &&
    directDamageEffects?.length === 1 &&
    directDamageEffects[0]?.kind === "damage" &&
    directDamageEffects[0].scaling !== "magic" &&
    directDamageEffects[0].scaling !== "spi";
  const crossCoreEquipped = state.v2Skills.equipped.includes(
    "v2c_skyascendant_crossover",
  );
  const crossFamily: CrossFamily | undefined = result.castSkillId
    ? (["v2c_skyascendant_fallingstar", "v2c_heavenlybow_orbit"].includes(
        result.castSkillId,
      )
        ? "ranged"
        : [
              "v2c_skyascendant_voidbreak",
              "v2c_celestialdragon_combo",
            ].includes(result.castSkillId)
          ? "martial"
          : undefined)
    : undefined;
  const crossover = crossCoreEquipped
    ? resolveCrossover({
        state: { lastFamily: state.stacks.tier7?.lastCrossFamily },
        currentFamily: crossFamily,
        hit: result.enemyDamage > 0,
        pvp: false,
      })
    : undefined;
  const formulaStages: 0 | 1 | 2 =
    result.castSkillId
      ? formulaStagesForCast(result.castSkillId, result.castSkillName)
      : 0;
  const formulaPreview =
    formulaCoreEquipped && result.castSkillId
      ? previewFormulaCast({
          state: formulaState,
          skillId: result.castSkillId,
          stages: formulaStages,
        })
      : undefined;
  const catalogPiercePct = Math.max(
    0,
    ...(directDamageEffects ?? []).map((effect) =>
      effect.kind === "damage" ? effect.pierceDamagePct ?? 0 : 0,
    ),
  );
  const crossoverPierceAdd =
    crossover?.bonus === "capture"
      ? Math.max(0, crossover.penetrationPct - catalogPiercePct)
      : 0;
  const formulaPierceAdd = formulaPreview?.completes ? 35 : 0;
  if (crossoverPierceAdd > 0 || formulaPierceAdd > 0) {
    result = rerunSelectedCast(result, {
      directDamagePiercePctAdd: crossoverPierceAdd + formulaPierceAdd,
    });
  }
  // 일반 회피도는 스킬을 빗나가게 하지 않는다. 대상의 회피도와 시전자의 적중도를
  // 대결해 직접 피해만 줄이고, 적중 시 부가 효과는 정상 적용한다.
  const skillEvaDown =
    state.stacks.enemyEvasionDownTurns > 0
      ? state.stacks.enemyEvasionDownPct
      : 0;
  const skillEnemyEvaRating =
    Math.max(0, state.enemy.evasionPct ?? 0) *
    (1 - Math.min(100, Math.max(0, skillEvaDown)) / 100) *
    (player.precisionEvasionMult ?? 1);
  const skillEvasionReductionPct = evasionDamageReductionPct(
    skillEnemyEvaRating,
    (player.accRating ?? player.accuracyPct ?? 0) +
      (result.castSkillId
        ? (V2_SKILLS[result.castSkillId]?.accuracyBonusPct ?? 0)
        : 0) +
      result.skillAccuracyBonusPct +
      (crossover?.accuracyBonusPct ?? 0),
  );
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
  const erosionMult =
    state.stacks.enemyDotVulnTurns > 0 && state.stacks.enemyMagicVulnStacks > 0
      ? 1 + state.stacks.enemyDotVulnPct / 100
      : 1;
  // PR2-B-2c 속박 — 적 취약(받는 피해 +%) 가산.
  const vulnMult =
    state.stacks.enemyVulnTurns > 0
      ? 1 + state.stacks.enemyVulnPct / 100
      : 1;
  const magicSkillDamageBonus =
    result.magicEnemyDamage > 0 && (player.magicSkillDamagePct ?? 0) > 0
      ? Math.floor(
          (result.magicEnemyDamage * (player.magicSkillDamagePct ?? 0)) / 100,
        )
      : 0;
  const lawMagicVulnBonus =
    result.magicEnemyDamage > 0 &&
    (state.stacks.enemyMagicVulnTurns ?? 0) > 0
      ? Math.floor(
          (result.magicEnemyDamage *
            (state.stacks.enemyMagicVulnPct ?? 0)) /
            100,
        )
      : 0;
  const skillDamageBase =
    result.enemyDamage + magicSkillDamageBonus + lawMagicVulnBonus;
  // 스킬 치명타 — 평타와 같은 크리 확률(min(critChancePct, 75%)) 공유, 배수만 SKILL_CRIT_MULT 로
  //   분리(평타 critMult 비연동 → 비폭주). 오버플로는 관련 패시브 보유 시에만 스킬에도 적용.
  //   데미지>0 일 때만 롤(자버프·무피해 스킬엔 롤 안 함 → 기존 RNG 스트림 보존).
  const skillCritAfterEvadeFired =
    result.enemyDamage > 0 && state.flags.skillCritAfterEvadePending;
  const skillCritFired =
    result.enemyDamage > 0 &&
    (result.berserkerTransition.forceSkillCrit ||
      skillCritAfterEvadeFired ||
      ((player.critChancePct ?? 0) +
        (result.castSkillId
          ? (V2_SKILLS[result.castSkillId]?.skillCritChancePct ?? 0)
          : 0) >
        0 &&
        Math.random() * 100 <
          Math.min(
            CRIT_PCT_CAP,
            (player.critChancePct ?? 0) +
              (result.castSkillId
                ? (V2_SKILLS[result.castSkillId]?.skillCritChancePct ?? 0)
                : 0),
          )));
  // 스킬 다단히트 — 이 턴 추가 공격 확률로 굴려둔 공격 횟수(playerAttacksLeft)만큼 데미지
  //   스킬을 반복 타격한다. 평타 빌드가 누리는 SPD(추가 공격) 가치를 스킬 빌드에도 부여.
  //   데미지 스킬에만 적용(버프/힐/마나/DoT 부여는 1회 — 다중 적용 X). 새 RNG 미소비(이미
  //   굴린 값 재사용) → 추가 공격 0(평타 1타) 빌드는 skillHitCount=1 로 기존과 byte-동일.
  const skillHitCount =
    result.castSkillId && result.enemyDamage > 0
      ? Math.max(1, state.playerAttacksLeft)
      : 1;
  const skillPreCriticalMultiplier =
    spellStackMult * magicVulnMult * erosionMult * vulnMult;
  const skillCriticalMultiplier = skillCritFired
    ? SKILL_CRIT_MULT +
      Math.max(0, player.skillCritDmgPct ?? 0) / 100 +
      result.berserkerTransition.bonusSkillCritDamagePct / 100 +
      (player.skillCritOverflow
        ? computeCritOverflowBonus(player.critChancePct ?? 0)
        : 0)
    : 1;
  const directSkillSignature = resolveDirectSkillHitSignatures(
    player.equipSignatures,
    {
      dealtDamage: Boolean(result.castSkillId && result.enemyDamage > 0),
      targetPoisoned: isEnemyPoisoned(state),
    },
  );
  const baseSingleSkillDamageBeforeEvasion = computeDirectSkillDamage({
    totalDamage: skillDamageBase,
    magicDamage:
      result.magicEnemyDamage + magicSkillDamageBonus + lawMagicVulnBonus,
    preCriticalMultiplier:
      skillPreCriticalMultiplier * directSkillSignature.damageMult,
    criticalMultiplier: skillCriticalMultiplier,
    equipmentMagicCritBonus:
      Math.max(0, player.equipmentMagicSkillCritDmgPct ?? 0) / 100,
    critical: skillCritFired,
  });
  const intentCoreEquipped = state.v2Skills.equipped.includes(
    "v2c_ruinblade_oneintent",
  );
  let tier7FinalDamagePct = 0;
  if (
    intentCoreEquipped &&
    isSinglePhysicalSkill &&
    result.castSkillId !== "v2c_ruinblade_ruinsword"
  ) {
    tier7FinalDamagePct += (state.stacks.tier7?.swordIntent ?? 0) * 8;
  }
  if (result.castSkillId === "v2c_ruinblade_limitstrike") {
    tier7FinalDamagePct += Math.min(
      60,
      ((state.playerMaxHp - state.playerHp) / Math.max(1, state.playerMaxHp)) *
        60,
    );
  }
  if (ruinChargeAtActionStart) {
    tier7FinalDamagePct += ruinSwordBonuses({
      state: ruinChargeAtActionStart,
      hp: state.playerHp,
      maxHp: state.playerMaxHp,
      pvp: false,
    }).damagePct;
  }
  if (crossover?.bonus === "capture") {
    tier7FinalDamagePct += crossover.damagePct;
  }
  if (formulaPreview?.completes) tier7FinalDamagePct += 50;
  const shadowFollowUp = consumeShadowFollowUp({
    pendingPct: state.stacks.tier7?.shadowFollowUpPct ?? 0,
    isSinglePhysical: Boolean(isSinglePhysicalSkill),
    hit: result.enemyDamage > 0,
    damage: Math.round(
      baseSingleSkillDamageBeforeEvasion * (1 + tier7FinalDamagePct / 100),
    ),
  });
  const singleSkillDamage = shadowFollowUp.damage;
  let nextComboHitCount = state.stacks.comboHitCount;
  let landedSkillHits = 0;
  let dealtDirectSkillDamage = 0;
  // 시전이 발동(castSkillId)했으면 누적 증가. 주문중첩=매 시전, 약점노출=적중(데미지>0) 시. 상한 클램프.
  const nextSpellCastCount =
    (player.skillDmgPctPerCast ?? 0) > 0 && result.castSkillId
      ? Math.min(SPELL_STACK_CAP, state.stacks.spellCastCount + 1)
      : state.stacks.spellCastCount;
  const magicVulnApplyChancePct = player.enemyMagicVulnApplyChancePct ?? 100;
  const magicVulnApplied =
    (player.enemyMagicVulnPctPerStack ?? 0) > 0 &&
    result.castSkillId &&
    result.enemyDamage > 0 &&
    magicVulnApplyChancePct > 0 &&
    (magicVulnApplyChancePct >= 100 ||
      Math.random() * 100 < magicVulnApplyChancePct);
  const nextMagicVulnStacks =
    magicVulnApplied
      ? Math.min(
          MAGIC_VULN_STACK_CAP,
          state.stacks.enemyMagicVulnStacks + 1,
        )
      : state.stacks.enemyMagicVulnStacks;
  // 절제(워메이지 특성) — 스킬 마나 소모 -%. resolveV2SkillCast 가 계산한 회복 전
  // 실제 지불액의 pct% 를 환급한다. 미시전이면 mpSpent 0 → 무변.
  const mpCostReduction = Math.max(
    0,
    (player.mpCostReductionPct ?? 0) -
      (formulaOptimizationEquipped ? 20 : 0),
  );
  const costPaid = result.mpSpent;
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
  let actualSkillDamage = 0;
  let tier6SkillHitDamages: number[] = [];
  // hpCostDamage의 HP는 적중한 피해로 바뀌는 자원이다. 확정 회피에서는 비용이 0이 되며,
  // 일반 회피 경감은 적중으로 취급해 흡혈보다 먼저 비용을 낸다.
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
  if (result.berserkerTransition.grantFinisher) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[혈전] 다음 파멸일격 또는 멸왕일도를 준비한다.`,
      turn: "player",
    });
  }
  if (result.berserkerTransition.consumeFinisher) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[혈전 해방] ${result.castSkillName ?? "필살기"}에 피의 기세를 터뜨린다.`,
      turn: "player",
    });
  }
  if (result.berserkerTransition.consumeDeathDamage) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[패황의 지배] ${result.castSkillName ?? "공격"}에 죽음 직전의 힘을 싣는다.`,
      turn: "player",
    });
  }
  if (skillCritAfterEvadeFired && result.castSkillName) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[흑월지배] 회피의 여세로 ${result.castSkillName}이(가) 치명타가 된다.`,
      turn: "player",
    });
  }
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
    const perHitBeforeEvasion = comboResult.hitDamages;
    const perHit = perHitBeforeEvasion.map((hit) =>
      applyEvasionDamageReduction(hit, skillEvasionReductionPct),
    );
    tier6SkillHitDamages = perHit.filter((hit) => hit > 0);
    const rawDamageBeforeEvasion = perHitBeforeEvasion.reduce(
      (sum, hit) => sum + hit,
      0,
    );
    const rawDamageAfterEvasion = perHit.reduce(
      (sum, hit) => sum + hit,
      0,
    );
    if (rawDamageAfterEvasion < rawDamageBeforeEvasion) {
      nextLog = appendLog(nextLog, {
        kind: "info",
        text: `[회피 경감 ${skillEvasionReductionPct.toFixed(1)}%] ${state.enemy.name} 피해 -${rawDamageBeforeEvasion - rawDamageAfterEvasion}`,
      });
    }
    landedSkillHits = perHit.filter((hit) => hit > 0).length;
    nextComboHitCount = comboResult.nextComboHitCount;
    const boostedSkillDamage = perHit.reduce((sum, hit) => sum + hit, 0);
    dealtDirectSkillDamage = boostedSkillDamage;
    const enemyHpBeforeSkill = nextEnemyHp;
    nextEnemyHp = Math.max(0, nextEnemyHp - boostedSkillDamage);
    if (crossover?.bonus === "pursuit") {
      const pursuitDamage = Math.round(
        boostedSkillDamage * (crossover.damagePct / 100),
      );
      nextEnemyHp = Math.max(0, nextEnemyHp - pursuitDamage);
      nextLog = appendLog(nextLog, {
        kind: "player_attack",
        effect: "extra_damage",
        text: `[교차·추격] ${pursuitDamage} 추가 피해.`,
        turn: "player",
      });
    }
    actualSkillDamage = Math.max(0, enemyHpBeforeSkill - nextEnemyHp);
    for (const hit of perHit) {
      if (hit <= 0) continue; // 분배 반올림으로 0 이 된 타는 줄 생략(합은 이미 차감됨).
      nextLog = appendLog(nextLog, {
        kind: "player_attack",
        text: `${result.castSkillName}!${skillCritFired ? " [치명타]" : ""} ${hit} 피해를 입혔다.`,
      });
    }
  }
  const frostChill = resolveFrostChillGain(
    state.stacks.enemyFrostChillStacks,
    landedSkillHits > 0 ? result.frostChillGain : 0,
    {
      damagePct: player.freezeDamagePct,
      delayPct: player.freezeDelayPct,
    },
  );
  let freezeDamage = 0;
  if (landedSkillHits > 0 && frostChill.requestedGain > 0) {
    if (frostChill.triggered && result.castSkillId) {
      nextLog = appendLog(nextLog, {
        kind: "info",
        text: formatFrostChillTriggerLog(),
        turn: "player",
      });
      const effectiveInt = Math.floor(
        Math.max(0, player.intStat ?? 0) *
          v2MagicBuffMult(tickedSelfBuffs, tickedSelfDebuffs),
      );
      const rawFreezeDamage = freezeRawDamage({
        int: effectiveInt,
        maxMp: state.playerMaxMp,
        damagePct: frostChill.damagePct,
      });
      const [tierScaledEffect] = rebalanceDynamicV2SkillEffects(
        result.castSkillId,
        [
          {
            kind: "damage",
            statCoef: 0,
            baseFlat: rawFreezeDamage,
            scaling: "magic",
          },
        ],
      );
      const tierScaledRaw =
        tierScaledEffect?.kind === "damage"
          ? tierScaledEffect.baseFlat ?? rawFreezeDamage
          : rawFreezeDamage;
      const freezeBaseDamage = v2DamageAmount({
        attackerAtk: 0,
        attackerMagicAtk: 0,
        attackerMagicMinDamage: player.magicMinDamage,
        scaling: "magic",
        targetDef: playerSkillTargetDef(state, player),
        targetMagicDef: playerSkillTargetMagicDef(state, player),
        statCoef: 0,
        baseFlat: tierScaledRaw,
        attackerSelfBuffs: {},
        attackerSelfDebuffs: {},
        targetSelfBuffs: state.enemyV2SelfBuffs,
        targetSelfDebuffs: tickedEnemyDebuffs,
      });
      const freezeMagicSkillBonus =
        (player.magicSkillDamagePct ?? 0) > 0
          ? Math.floor(
              (freezeBaseDamage * (player.magicSkillDamagePct ?? 0)) / 100,
            )
          : 0;
      const freezeLawVulnBonus =
        (state.stacks.enemyMagicVulnTurns ?? 0) > 0
          ? Math.floor(
              (freezeBaseDamage *
                (state.stacks.enemyMagicVulnPct ?? 0)) /
                100,
            )
          : 0;
      const freezeMagicDamage =
        freezeBaseDamage + freezeMagicSkillBonus + freezeLawVulnBonus;
      freezeDamage = applyEvasionDamageReduction(
        computeDirectSkillDamage({
          totalDamage: freezeMagicDamage,
          magicDamage: freezeMagicDamage,
          preCriticalMultiplier: skillPreCriticalMultiplier,
          criticalMultiplier: skillCriticalMultiplier,
          equipmentMagicCritBonus:
            Math.max(0, player.equipmentMagicSkillCritDmgPct ?? 0) / 100,
          critical: skillCritFired,
        }),
        skillEvasionReductionPct,
      );
      nextEnemyHp = Math.max(0, nextEnemyHp - freezeDamage);
      if (freezeDamage > 0) {
        tier6SkillHitDamages.push(freezeDamage);
        nextLog = appendLog(nextLog, {
          kind: "player_attack",
          text: `빙결!${skillCritFired ? " [치명타]" : ""} ${freezeDamage} 피해를 입혔다.`,
        });
      }
    } else {
      nextLog = appendLog(nextLog, {
        kind: "info",
        text: formatFrostChillGainLog(
          frostChill.requestedGain,
          frostChill.next,
        ),
        turn: "player",
      });
    }
  }
  const sigSkill = resolveOffensiveSignatureTriggers(
    player.equipSignatures,
    {
      critical: skillCritFired,
      dealtDamage: landedSkillHits > 0,
      allowShock: canApplyShock(state.stacks.enemyShockAction),
    },
  );
  const sigSkillTargetDots = [
    ...(directSkillSignature.poison
      ? [
          makePoisonDot({
            stacks: directSkillSignature.poison.stacks,
            pctMaxHpPerStack: SIGNATURE_HIT_POISON_PCT_MAX_HP_PER_STACK,
            sourceAtk: player.atk,
          }),
        ]
      : []),
    ...(sigSkill.critPoison
      ? [
          makePoisonDot({
            stacks: 1,
            pctMaxHpPerStack: SIGNATURE_CRIT_POISON_PCT_MAX_HP_PER_STACK,
            sourceAtk: player.atk,
          }),
        ]
      : []),
    ...(sigSkill.hitPoison
      ? [
          makePoisonDot({
            stacks: sigSkill.hitPoison.stacks,
            pctMaxHpPerStack: SIGNATURE_HIT_POISON_PCT_MAX_HP_PER_STACK,
            sourceAtk: player.atk,
          }),
        ]
      : []),
    ...(sigSkill.hitBleed
      ? [
          makeBleedDot({
            stacks: sigSkill.hitBleed.stacks,
            flatPerStack: 0,
            sourceAtk: player.atk,
          }),
        ]
      : []),
  ];
  const activeSkillCritSpdMult =
    state.buffs.playerSpdTurnsLeft > 0 ? state.buffs.playerSpdMult : 1;
  const sigSkillCritSpdBuff = sigSkill.critSpeed
    ? {
        playerSpdMult: Math.max(
          activeSkillCritSpdMult,
          sigSkill.critSpeed.mult,
        ),
        playerSpdTurnsLeft: Math.max(
          state.buffs.playerSpdTurnsLeft,
          sigSkill.critSpeed.turns,
        ),
      }
    : null;
  const activeSkillEnemySpdMult =
    state.buffs.enemySpdTurnsLeft > 0 ? state.buffs.enemySpdMult : 1;
  const sigSkillEnemySlow = sigSkill.critChill
    ? {
        enemySpdMult: Math.min(
          activeSkillEnemySpdMult,
          sigSkill.critChill.mult,
        ),
        enemySpdTurnsLeft: Math.max(
          state.buffs.enemySpdTurnsLeft,
          sigSkill.critChill.turns,
        ),
      }
    : null;
  const activeSkillEnemyDefDebuffPct =
    state.buffs.enemyDefDebuffTurnsLeft > 0
      ? state.buffs.enemyDefDebuffPct
      : 0;
  const sigSkillEnemyDefDebuff = sigSkill.critDefDebuff
    ? {
        enemyDefDebuffPct: Math.max(
          activeSkillEnemyDefDebuffPct,
          sigSkill.critDefDebuff.pct,
        ),
        enemyDefDebuffTurnsLeft: Math.max(
          state.buffs.enemyDefDebuffTurnsLeft,
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
  if (nextMagicVulnStacks > state.stacks.enemyMagicVulnStacks) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[흉조] 적에게 마법취약 +1 (${nextMagicVulnStacks}/${MAGIC_VULN_STACK_CAP})`,
    });
  }
  if (sigSkillCritSpdBuff) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${sigSkill.critSpeed?.label ?? "군림"}] 결정타 — 속도가 솟구친다!`,
      turn: "player",
    });
  }
  if (directSkillSignature.poison) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${directSkillSignature.poison.label}] ${state.enemy.name}에게 중독 ${directSkillSignature.poison.stacks}스택을 남겼다.`,
      turn: "player",
    });
  }
  if (sigSkill.critPoison) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[독니] ${state.enemy.name}을(를) 중독시켰다!`,
      turn: "player",
    });
  }
  if (sigSkill.hitPoison) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${sigSkill.hitPoison.label}] ${state.enemy.name}에게 중독 ${sigSkill.hitPoison.stacks}스택을 남겼다.`,
      turn: "player",
    });
  }
  if (sigSkill.hitBleed) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${sigSkill.hitBleed.label}] ${state.enemy.name}에게 출혈 ${sigSkill.hitBleed.stacks}스택을 남겼다.`,
      turn: "player",
    });
  }
  if (sigSkill.critChill) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: formatChillSlowLog(state.enemy.name, sigSkill.critChill),
      turn: "player",
    });
  }
  if (sigSkill.critDefDebuff) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: formatDefDebuffLog(state.enemy.name, sigSkill.critDefDebuff),
      turn: "player",
    });
  }
  if (sigSkill.hitShock) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: formatShockAppliedLog(state.enemy.name, sigSkill.hitShock),
      turn: "player",
    });
  }
  // heal 효과: damage 없는 회복형 스킬 (회복/강화회복) — player_attack kind 로 통일.
  const resolvedSelfHealBase =
    result.selfHeal +
    Math.floor(
      (actualSkillDamage *
        Math.max(0, result.healFromActualDamagePct)) /
        100,
    );
  const resolvedSelfHeal = Math.floor(
    resolvedSelfHealBase * tier6UnityMult,
  );
  if (resolvedSelfHeal > 0 && result.castSkillName) {
    const before = nextPlayerHp;
    nextPlayerHp = Math.min(state.playerMaxHp, nextPlayerHp + resolvedSelfHeal);
    const actual = nextPlayerHp - before;
    if (actual > 0) {
      const overflowSuffix =
        resolvedSelfHeal > actual ? ` (산출 ${resolvedSelfHeal})` : "";
      nextLog = appendLog(nextLog, {
        kind: "player_attack",
        text: `${result.castSkillName}! HP ${actual} 회복했다.${overflowSuffix}`,
      });
      const sigHealShield = healToShield(player.equipSignatures, {
        actualHeal: actual,
        calculatedHeal: resolvedSelfHeal,
        maxHp: state.playerMaxHp,
      });
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
  if (result.guaranteedEvadesToAdd > 0 && result.castSkillName) {
    nextLog = appendLog(nextLog, {
      kind: "player_attack",
      text: `${result.castSkillName}! 확정 회피를 준비했다.`,
    });
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${result.castSkillName}] 다음 공격 ${result.guaranteedEvadesToAdd}회를 반드시 회피한다.`,
      turn: "player",
    });
  }
  if (result.ironWallReflectToApply && result.castSkillName) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${result.castSkillName}] 철벽 반사 ${result.ironWallReflectToApply.charges}회 준비`,
      turn: "player",
    });
  }
  const lawGain = addLawInscriptionGain(
    state.stacks.lawInscriptions,
    result.lawInscriptionGain,
  );
  const nextLawInscriptions = result.lawInscriptionsToConsume
    ? emptyLawInscriptionState()
    : lawGain.state;
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
      turn: "player",
    });
  }
  if (lawConsumeText) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: lawConsumeText,
      turn: "player",
    });
  }
  if (result.lawInscriptionComplete) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: "공격·환류·침식·수호가 하나로 이어져 완성 각인이 발동했다.",
      turn: "player",
    });
  }
  const refreshedTripleWard = result.refreshTripleWards
    ? refreshTripleWardState(
        state.stacks.tripleWard,
        aggregateEquippedPassives(state.v2Skills.equipped).tripleWardRank,
      )
    : state.stacks.tripleWard;
  if (result.refreshTripleWards && result.castSkillName) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${result.castSkillName}] 삼중 결계 ${refreshedTripleWard.physical}회 재전개`,
      turn: "player",
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
      turn: "player",
    });
  }
  for (const text of mutationTransitionLogLines(
    result.castSkillName,
    result.mutationTransition,
  )) {
    nextLog = appendLog(nextLog, { kind: "info", text, turn: "player" });
  }
  if (sigMpRefund && sigMpRefundAmount > 0 && result.castSkillName) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${sigMpRefund.label}] 마나 ${sigMpRefundAmount} 환급`,
      turn: "player",
    });
  }
  const nextSelfBuffs = applyV2BuffsToMap(tickedSelfBuffs, result.selfBuffsToApply);
  const nextEnemyDebuffs = applyV2BuffsToMap(tickedEnemyDebuffs, result.enemyDebuffsToApply);
  const dotsToApplyToTarget = applyPoisonDamageToDots(
    result.dotsToApplyToTarget,
    player,
  );
  // PR-8 — dot effect 결과를 적 측 v2Dots 에 박음. 같은 label refresh.
  const dotsBeforeBleedHunt = applyV2DotsToTarget(
    applyV2DotsToTarget(state.enemyV2Dots, dotsToApplyToTarget),
    sigSkillTargetDots,
  );
  const nextEnemyDots = applyBleedChangeToDots(
    dotsBeforeBleedHunt,
    result.bleedChangeToApply,
  );
  const bleedBeforeChange = dotsBeforeBleedHunt.find(
    (dot) => dot.tag === "bleed" && dot.turns > 0,
  );
  const bleedAfterChange = nextEnemyDots.find(
    (dot) => dot.tag === "bleed" && dot.turns > 0,
  );
  if (
    result.bleedChangeToApply &&
    bleedBeforeChange &&
    bleedAfterChange &&
    (bleedBeforeChange.stacks !== bleedAfterChange.stacks ||
      bleedBeforeChange.turns !== bleedAfterChange.turns)
  ) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: bleedChangeLogText(
        result.bleedChangeToApply,
        bleedAfterChange.turns,
      ),
      turn: "player",
    });
  }
  for (const b of result.selfBuffsToApply) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${result.castSkillName ?? "강화"}] ${STAT_LABELS[b.stat]} +${b.pct}% (${b.turns}행동)`,
      turn: "player",
    });
  }
  for (const d of result.enemyDebuffsToApply) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${[result.castSkillName, statusNameForDebuffStat(d.stat)].filter(Boolean).join(" + ") || "약화"}] ${STAT_LABELS[d.stat]} -${d.pct}% (대상 행동 ${d.turns}회)`,
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
      text: `[${result.castSkillName ?? "운기"}] 행동마다 HP +${result.selfRegenToApply.pctMaxHpPerTurn}% (${result.selfRegenToApply.turns}행동)`,
      turn: "player",
    });
  }
  const critBuffForLog = result.selfBuffPctToApply.find((b) => b.target === "crit");
  if (critBuffForLog) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${result.castSkillName ?? "집중"}] 치명타 확률 +${critBuffForLog.pct}%p (${critBuffForLog.turns}행동)`,
      turn: "player",
    });
  }
  const evaBuffForLog = result.selfBuffPctToApply.find((b) => b.target === "evasion");
  if (evaBuffForLog) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${result.castSkillName ?? "회피"}] 회피도 +${evaBuffForLog.pct}% (${evaBuffForLog.turns}행동)`,
      turn: "player",
    });
  }
  const dmgReduceBuffForLog = result.selfBuffPctToApply.find(
    (b) => b.target === "damageReduction",
  );
  if (dmgReduceBuffForLog) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${result.castSkillName ?? "방어"}] 받는 피해 -${dmgReduceBuffForLog.pct}% (${dmgReduceBuffForLog.turns}행동)`,
      turn: "player",
    });
  }
  if (result.enemyVulnToApply) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${result.castSkillName ?? "속박"}] 적 받는 피해 +${result.enemyVulnToApply.pct}% (적 행동 ${result.enemyVulnToApply.turns}회)`,
      turn: "player",
    });
  }
  if (result.enemyMagicVulnToApply) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${result.castSkillName ?? "침식"}] 적이 받는 마법 피해 +${result.enemyMagicVulnToApply.pct}% (적 행동 ${result.enemyMagicVulnToApply.turns}회)`,
      turn: "player",
    });
  }
  if (result.enemyEvasionDownToApply) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${result.castSkillName ?? "실명"}] 적 회피도 −${result.enemyEvasionDownToApply.pct}% (적 행동 ${result.enemyEvasionDownToApply.turns}회)`,
      turn: "player",
    });
  }
  if (result.enemyAccuracyDownToApply) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${result.castSkillName ?? "암흑"}] 적 적중도 −${result.enemyAccuracyDownToApply.pct}% (적 행동 ${result.enemyAccuracyDownToApply.turns}회)`,
      turn: "player",
    });
  }
  if (result.enemyHealReduceToApply) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${result.castSkillName ?? "화상"}] 적 회복 −${result.enemyHealReduceToApply.pct}% (적 행동 ${result.enemyHealReduceToApply.turns}회)`,
      turn: "player",
    });
  }
  if (result.enemyDamageDownToApply) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${result.castSkillName ?? "쇠약"}] 적 주는 피해 −${result.enemyDamageDownToApply.pct}% (적 행동 ${result.enemyDamageDownToApply.turns}회)`,
      turn: "player",
    });
  }
  if (result.enemySkillProcDownToApply) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${result.castSkillName ?? "금제"}] 적 스킬 발동률 −${result.enemySkillProcDownToApply.pct}%p (적 행동 ${result.enemySkillProcDownToApply.turns}회)`,
      turn: "player",
    });
  }
  const provokeImmediateBasicAttacks =
    result.castSkillId
      ? Math.max(
          0,
          Math.floor(
            V2_SKILLS[result.castSkillId]?.provokeImmediateBasicAttacks ?? 0,
          ),
        )
      : 0;
  if (result.enemyDotVulnToApply) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${result.castSkillName ?? "침식"}] 적 지속/저주 피해 +${result.enemyDotVulnToApply.pct}% (적 행동 ${result.enemyDotVulnToApply.turns}회)`,
      turn: "player",
    });
  }
  // 평타 전용이던 every-N 시그니처를 직접 피해 스킬의 실제 적중에도 연결한다.
  // 다단 스킬은 양수 피해가 표시된 각 타격을 모두 세며, 한 시전에서 주기를 여러 번
  // 넘으면 그 횟수만큼 추가 기본 공격을 지급한다. 버프·회복 스킬과 완전 회피된 공격은 0회다.
  const sigEvery = everyNHitsEffect(player.equipSignatures);
  const sigEveryN = sigEvery?.hits ?? 0;
  const nextSigHitCount =
    sigEveryN > 0
      ? state.stacks.signatureHitCount + landedSkillHits
      : state.stacks.signatureHitCount;
  const signatureExtraActions =
    sigEveryN > 0
      ? Math.floor(nextSigHitCount / sigEveryN) -
        Math.floor(state.stacks.signatureHitCount / sigEveryN)
      : 0;
  if (signatureExtraActions > 0) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[${sigEvery?.label ?? "연격"}] ${landedSkillHits}회 적중 — 추가 기본 공격 ${signatureExtraActions}회!`,
      turn: "player",
    });
  }
  const transitionedBerserker = state.berserker
    ? applyBerserkerCastTransition(
        state.berserker,
        result.berserkerTransition,
      )
    : undefined;
  const nextBerserker =
    transitionedBerserker &&
    result.castSkillId &&
    V2_SKILLS[result.castSkillId]?.category === "attack"
      ? finishBerserkerPlayerAttack(transitionedBerserker)
      : transitionedBerserker;
  const tier6DotsBefore = tier6DotContext(state);
  const tier6StatusKindsBefore = tier6StatusKindCount(state);
  const tier6ShieldGain =
    healShieldAmount +
    (result.shieldToApply
      ? result.shieldToApply.hp + result.shieldToApply.mp
      : 0);
  const castDeclaration = result.castSkillId
    ? composeDuelistDeclaration(state.v2Skills.equipped, result.castSkillId)
    : null;
  const nextDuelistBuff = castDeclaration
    ? castDeclaration
    : result.castSkillId
      ? interruptDuelistRamp(state.duelistBuff)
      : state.duelistBuff;
  if (castDeclaration) {
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: duelistDeclarationSummary(castDeclaration),
      turn: "player",
    });
  }
  let nextTier7 = state.stacks.tier7;
  if (shadowCoreEquipped || nextTier7?.swordShadow) {
    nextTier7 = {
      ...nextTier7,
      shadowFollowUpPct: shadowFollowUp.pendingPct,
    };
    if (
      shadowCoreEquipped &&
      result.castSkillId &&
      isSinglePhysicalSkill &&
      dealtDirectSkillDamage > 0
    ) {
      const mechanic = V2_SKILLS[result.castSkillId]?.tier7Mechanic;
      const recordPct =
        mechanic?.kind === "shadowStrike" ? mechanic.recordPct : 50;
      nextTier7.swordShadow = recordSwordShadow({
        existing: nextTier7.swordShadow,
        sourceSkillId: result.castSkillId,
        dealtDamage: dealtDirectSkillDamage,
        recordPct,
      });
    }
    if (
      result.castSkillId === "v2c_shadowblade_traceless" ||
      result.castSkillId === "v2c_blackmoon_flurry"
    ) {
      nextTier7.swordShadow = refineSwordShadow(
        nextTier7.swordShadow,
        15,
      );
    }
  }
  if (
    intentCoreEquipped ||
    startingRuinCharge ||
    ruinChargeAtActionStart ||
    crossCoreEquipped ||
    formulaCoreEquipped
  ) {
    nextTier7 = { ...nextTier7 };
  }
  if (
    nextTier7 &&
    intentCoreEquipped &&
    result.castSkillId &&
    isSinglePhysicalSkill &&
    result.castSkillId !== "v2c_ruinblade_ruinsword" &&
    dealtDirectSkillDamage > 0
  ) {
    const gain =
      result.castSkillId === "v2c_ruinblade_limitstrike" &&
      state.playerHp / Math.max(1, state.playerMaxHp) <= 0.4
        ? 2
        : 1;
    nextTier7.swordIntent = gainSwordIntent(
      nextTier7.swordIntent ?? 0,
      gain,
    );
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[검의] ${nextTier7.swordIntent}/3`,
      turn: "player",
    });
  }
  if (nextTier7 && startingRuinCharge) {
    nextTier7.ruinCharge = startRuinCharge({
      hp: state.playerHp,
      intent: nextTier7.swordIntent ?? 0,
    });
    nextTier7.swordIntent = 0;
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[멸검] 충전을 시작했다. 다음 행동 기회에 자동 해방한다.`,
      turn: "player",
    });
  } else if (nextTier7 && ruinChargeAtActionStart) {
    nextTier7.ruinCharge = undefined;
    nextTier7.swordIntent = 1;
    nextLog = appendLog(nextLog, {
      kind: "info",
      text: `[멸검] 충전을 해방하고 검의 1개를 되찾았다.`,
      turn: "player",
    });
  }
  if (nextTier7 && crossover) {
    nextTier7.lastCrossFamily = crossover.state.lastFamily;
    if (crossover.bonus !== "none") {
      nextLog = appendLog(nextLog, {
        kind: "info",
        text: `[교차·${crossover.bonus === "capture" ? "포획" : "추격"}] 행동 가속 ${crossover.hastePct}%`,
        turn: "player",
      });
    }
  }
  if (nextTier7 && formulaPreview) {
    nextTier7.formula = formulaPreview.next;
    if (formulaPreview.completes) {
      nextLog = appendLog(nextLog, {
        kind: "info",
        text: `[완전식] ${result.castSkillName ?? "주문"} 강화 발동.`,
        turn: "player",
      });
    }
  }
  const formulaRestore =
    formulaPreview?.completes &&
    state.v2Skills.equipped.includes("v2c_primordialsage_optimization")
      ? Math.floor(state.playerMaxMp * 0.1)
      : 0;
  state = {
    ...state,
    playerHp: nextPlayerHp,
    ...(nextBerserker ? { berserker: nextBerserker } : {}),
    enemyHp: nextEnemyHp,
    playerMp: Math.min(state.playerMaxMp, adjustedNextMp + formulaRestore),
    duelistBuff: nextDuelistBuff,
    v2SkillCooldowns: result.nextCooldowns,
    v2SelfBuffs: nextSelfBuffs,
    v2SelfDebuffs: tickedSelfDebuffs, // (PvE 는 적이 enemyDebuff 안 박아서 갱신 X — tick 만 반영)
    enemyV2Debuffs: nextEnemyDebuffs,
    enemyV2Dots: nextEnemyDots,
    buffs: hasSigSkillBuffs
      ? { ...state.buffs, ...sigSkillBuffs }
      : state.buffs,
    flags: skillCritAfterEvadeFired
      ? { ...state.flags, skillCritAfterEvadePending: false }
      : state.flags,
    stacks: {
      // PR2-B-2c — 운기/연환집중/선풍각/속박 temp 버프 갱신.
      ...applySkillTempBuffs(state.stacks, result),
      tripleWard: refreshedTripleWard,
      evadesRemaining:
        state.stacks.evadesRemaining + result.guaranteedEvadesToAdd,
      comboHitCount: nextComboHitCount,
      signatureHitCount: nextSigHitCount,
      signatureBonusAttacksLeft:
        state.stacks.signatureBonusAttacksLeft + signatureExtraActions,
      ...(sigSkill.hitShock ? { enemyShockAction: "pending" as const } : {}),
      spellCastCount: nextSpellCastCount,
      enemyMagicVulnStacks: nextMagicVulnStacks,
      fortressImpact: Math.max(
        0,
        state.stacks.fortressImpact - result.fortressImpactToConsume,
      ),
      mutationWeight: result.mutationTransition.weightAfter,
      ...(landedSkillHits > 0 && frostChill.requestedGain > 0
        ? { enemyFrostChillStacks: frostChill.next }
        : {}),
      ironWallReflectCharges:
        result.ironWallReflectToApply?.charges ??
        state.stacks.ironWallReflectCharges,
      ...((state.stacks.lawInscriptions != null ||
        player.lawInscription ||
        result.lawInscriptionsToConsume != null)
        ? { lawInscriptions: nextLawInscriptions }
        : {}),
      // PR2-B 마나 보호막 — 흡수량(maxHP%+maxMP%)을 playerShield 풀에 누적.
      playerShield:
        state.stacks.playerShield +
        healShieldAmount +
        (result.shieldToApply
          ? result.shieldToApply.hp + result.shieldToApply.mp
          : 0),
      ...(nextTier7 ? { tier7: nextTier7 } : {}),
    },
    log: nextLog,
  };
  let tier6ExtraActions = 0;
  if (result.castSkillId && state.stacks.tier6Uniques) {
    const actionId = state.turn.completedPlayerTurns + 1;
    state = applyTier6UniquePveEvent(state, player, {
      kind: "action_start",
      shield: state.stacks.playerShield,
      maxHp: state.playerMaxHp,
      origin: { actionId, eventId: state.log.length },
    });
    if (costPaid > 0) {
      state = applyTier6UniquePveEvent(state, player, {
        kind: "mp_spent",
        amount: costPaid,
        magicAtk: tier6UnityMagicAtk,
        targetHasStatus: tier6StatusKindsBefore > 0,
        origin: { actionId, eventId: state.log.length },
      });
    }
    for (let index = 0; index < tier6SkillHitDamages.length; index += 1) {
      const attacksBefore = state.playerAttacksLeft;
      state = applyTier6UniquePveEvent(state, player, {
        kind: "direct_hit",
        damage: tier6SkillHitDamages[index]!,
        crit: skillCritFired,
        attackKind: "skill",
        paidMp: index === 0 ? costPaid : 0,
        statusKinds: tier6StatusKindsBefore,
        bleedStacks: tier6DotsBefore.bleed.stacks,
        bleedRemainingDamage: tier6DotsBefore.bleed.remainingDamage,
        poisonStacks: tier6DotsBefore.poison.stacks,
        poisonRemainingDamage: tier6DotsBefore.poison.remainingDamage,
        magicAtk: tier6UnityMagicAtk,
        maxHp: state.playerMaxHp,
        origin: { actionId, eventId: state.log.length + index + 1 },
      });
      tier6ExtraActions += Math.max(0, state.playerAttacksLeft - attacksBefore);
    }
    if (resolvedSelfHeal > 0) {
      state = applyTier6UniquePveEvent(state, player, {
        kind: "heal_calculated",
        amount: resolvedSelfHeal,
        maxHp: state.playerMaxHp,
        origin: { actionId, eventId: state.log.length },
      });
    }
    if (tier6ShieldGain > 0) {
      state = applyTier6UniquePveEvent(state, player, {
        kind: "shield_gained",
        amount: tier6ShieldGain,
        maxHp: state.playerMaxHp,
        origin: { actionId, eventId: state.log.length },
      });
    }
    state = applyTier6UniquePveEvent(state, player, {
      kind: "hp_threshold",
      currentHp: state.playerHp,
      maxHp: state.playerMaxHp,
      origin: { actionId, eventId: state.log.length },
    });
  }
  if (provokeImmediateBasicAttacks > 0 && result.castSkillName) {
    state = applyImmediateProvokedEnemyBasicAttacks(
      state,
      player,
      playerName,
      provokeImmediateBasicAttacks,
      result.castSkillName,
    );
  }
  return {
    state,
    castFired: result.castSkillId != null,
    signatureExtraActions: signatureExtraActions + tier6ExtraActions,
    selfHastePct: Math.max(
      result.selfHasteToApply?.pct ?? 0,
      crossover?.hastePct ?? 0,
      formulaPreview?.completes ? 20 : 0,
    ),
    enemyDelayPct: Math.max(
      result.enemyDelayToApply?.pct ?? 0,
      crossover?.enemyDelayPct ?? 0,
      frostChill.triggered ? frostChill.delayPct : 0,
    ),
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
  // 보스 전투 여부 — 현재/최대 HP 비례 피해에 각 보스 감산 계수를 적용할 때 사용.
  if (ctx.isBoss) state = { ...state, isBoss: true };
  if (ctx.maxHpDamageMult != null) {
    state = {
      ...state,
      maxHpDamageMult: Math.max(0, ctx.maxHpDamageMult),
    };
  }
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
  const hpBarEntry = (s: BattleState): BattleLogEntry => {
    const playerResources = mergeLawInscriptionSnapshot(
      mergeTripleWardResourceSnapshot(
        mergeTier7ResourceSnapshot(
          activeTier6ResourceSnapshot(s.stacks.tier6Uniques),
          s.stacks.tier7,
        ),
        s.stacks.tripleWard,
      ),
      s.stacks.lawInscriptions,
    );
    const enemyResources = mergeFrostChillSnapshot(
      undefined,
      s.stacks.enemyFrostChillStacks,
    );
    return {
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
    playerMagicBarrier: s.playerMagicBarrier,
    playerMagicBarrierMax: s.playerMagicBarrierMax,
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
    let shockSkipsEnemyAction = false;
    // PR-5b 회귀: enemy phase 가 player 로 전환되면 enemy cast flag reset (offlineSim 과 동작 일치).
    if (state.phase === "player") {
      v2CastedThisEnemyPhase = false;
    }
    if (state.phase === "enemy" && !v2CastedThisEnemyPhase) {
      const shockEntry = enterShockAction(state.stacks.enemyShockAction);
      if (state.stacks.enemyShockAction !== shockEntry.next) {
        state = {
          ...state,
          stacks: { ...state.stacks, enemyShockAction: shockEntry.next },
        };
      }
      if (shockEntry.skip) {
        shockSkipsEnemyAction = true;
        v2CastedThisEnemyPhase = true;
        state = {
          ...state,
          log: appendLog(state.log, {
            kind: "info",
            text: `[감전] ${state.enemy.name}이(가) 움직이지 못했다.`,
            turn: "enemy",
          }),
        };
      }
    }
    if (state.phase === "player") {
      // v2 스킬 cast (PR-4b) — MP 차감 + cooldown set + 효과 적용 (damage/heal/buff/debuff).
      // 매 player phase 진입 시 1회 — buff/debuff turn -1 tick + cast.
      if (!v2CastedThisPlayerPhase) {
        v2CastedThisPlayerPhase = true;
        // 0) PR-8 — player 가 받는 DoT tick (적이 박은 dot). DEF/보호막 무시. lethal 처리.
        // 일반 공격 레인과 섞이지 않도록 status_damage 효과 행으로 기록한다.
        const playerDotTick = tickV2Dots(state.playerV2Dots, state.playerMaxHp);
        const playerDotDamage = statusDamageAfterReduction(
          playerDotTick.totalDmg,
          player.statusDamageReductionPct,
        );
        if (playerDotDamage > 0) {
          const before = state.playerHp;
          const newHp = Math.max(0, before - playerDotDamage);
          const dotLog = distributeV2DotTicks(
            playerDotTick.ticks,
            playerDotDamage,
          ).reduce(
            (log, tick) =>
              appendLog(log, {
                kind: "info",
                effect: "status_damage",
                text: `${playerName}이(가) ${v2DotLogCause(tick)} ${tick.damage} 피해를 입었다.`,
              }),
            state.log,
          );
          state = {
            ...state,
            playerV2Dots: playerDotTick.nextDots,
            log: dotLog,
          };
          const survival = applyBerserkerHostileDamage(
            state,
            player,
            newHp,
            "player",
          );
          state = survival.state;
          if (survival.triggered && state.berserker) {
            state = {
              ...state,
              berserker: finishBerserkerCurrentActionGuard(state.berserker),
            };
          }
          const dotEnduranceFires =
            state.playerHp <= 0 &&
            !!player.enduranceActive &&
            !state.flags.enduranceTriggered;
          if (dotEnduranceFires) {
            state = {
              ...state,
              playerHp: 1,
              flags: { ...state.flags, enduranceTriggered: true },
              log: appendLog(state.log, {
                kind: "info",
                text: `[불굴] 마지막 한 숨 — HP 1 로 버텼다!`,
                turn: "player",
              }),
            };
          }
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
        state = applyEvasionActionRecoveryPvE(state, player, playerName);
        // 1) buff/debuff tick (cast 전에 — 새 buff 는 발동턴부터 turns 만큼 유지).
        const tickedSelfBuffs = tickV2BuffMap(state.v2SelfBuffs);
        const tickedSelfDebuffs = tickV2BuffMap(state.v2SelfDebuffs);
        const tickedEnemyDebuffs = tickV2BuffMap(state.enemyV2Debuffs);
        // 2) cast 결정 + 효과 적용 (applyPlayerV2SkillCast — ATB/legacy 공유 추출).
        const cast = applyPlayerV2SkillCast(state, player, {
          selfBuffs: tickedSelfBuffs,
          selfDebuffs: tickedSelfDebuffs,
          enemyDebuffs: tickedEnemyDebuffs,
        }, playerName);
        state = cast.state;
        if (state.phase === "ended") {
          continue;
        }
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
          if (cast.signatureExtraActions > 0) {
            // 스킬 다단 적중으로 얻은 추가 기본 공격은 같은 플레이어 페이즈에서 평타 행동으로
            // 이어진다. 스킬 시전 훅은 이미 소비했으므로 보너스 행동에서 중복 시전하지 않는다.
            state = {
              ...state,
              phase: "player",
              playerAttacksLeft: cast.signatureExtraActions,
              turn: { ...state.turn, firstAttackPending: true },
            };
          } else {
            continue;
          }
        }
      }
    } else if (state.phase === "enemy" && !shockSkipsEnemyAction) {
      // PR-5b — enemy 의 v2 스킬 cast (player cast hook 미러). monster.v2Skills 미지정이면 no-op.
      v2CastedThisPlayerPhase = false;
      if (!v2CastedThisEnemyPhase) {
        v2CastedThisEnemyPhase = true;
        const tickedEnemySelfBuffs = tickV2BuffMap(state.enemyV2SelfBuffs);
        const tickedEnemyDebuffsLocal = tickV2BuffMap(state.enemyV2Debuffs);
        const tickedPlayerDebuffs = tickV2BuffMap(state.v2SelfDebuffs);
        let result = resolveV2SkillCast({
          skills: state.enemyV2Skills,
          cooldowns: state.enemyV2SkillCooldowns,
          procRoll: Math.random() * 100,
          procChanceBonus:
            state.stacks.enemySkillProcDownTurns > 0
              ? -state.stacks.enemySkillProcDownPct
              : 0,
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
            characterElement: state.enemy.element,
          },
          target: {
            def: effectiveMutationDef(
              player.def,
              state.stacks.mutationWeight,
              player.stoneskinDefPctPerWeight ?? 0,
            ),
            magicDef: player.magicDef,
            selfBuffs: state.v2SelfBuffs,
            selfDebuffs: tickedPlayerDebuffs,
            // PR2-B — 상대(플레이어)의 처단/스택 payoff 대상 = 시전자 player.
            currentHp: state.playerHp,
            maxHp: state.playerMaxHp,
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
        const guaranteedEvade = evadeIncomingEnemySkill(state, player, result);
        state = guaranteedEvade.state;
        result = guaranteedEvade.result;
        if (state.phase === "ended") {
          state = {
            ...state,
            enemyMp: result.nextMp,
            enemyV2SkillCooldowns: result.nextCooldowns,
          };
          continue;
        }
        const legacyFortressReaction = resolveFortressReaction({
          landed: result.enemyDamage > 0,
          defenderDef: effectiveMutationDef(
            player.def,
            state.stacks.mutationWeight,
            player.stoneskinDefPctPerWeight ?? 0,
          ),
          impact: state.stacks.fortressImpact,
          impactOnHit: player.fortressImpactOnHit ?? false,
          ironWallReflectCharges: state.stacks.ironWallReflectCharges,
        });
        // 시전 별도 로그 폐기 — damage/heal 로그에 prefix 로 스킬명 포함.
        // 적의 v2 damage 는 일반 적 공격과 같은 enemy_attack kind 로 통일.
        const resolvedEnemySkill = resolveIncomingEnemySkillWithBarrier(
          state,
          player,
          result,
        );
        const mitigation = resolvedEnemySkill.mitigation;
        nextLog = appendEnemySkillMitigationLogs(nextLog, mitigation);
        const enemySkillMagicBarrier = resolvedEnemySkill.barrier;
        const enemySkillShieldBefore = state.stacks.playerShield;
        const enemySkillShieldAbsorbed = Math.min(
          enemySkillShieldBefore,
          enemySkillMagicBarrier.hpBoundDamage,
        );
        const enemySkillDamageToHp =
          enemySkillMagicBarrier.hpBoundDamage - enemySkillShieldAbsorbed;
        const enemySkillAfterShield = enemySkillDamageToHp;
        const nextPlayerShield =
          enemySkillShieldBefore - enemySkillShieldAbsorbed;
        const legacyEnemySkillReflection = resolveEnemySkillReflection(
          state,
          player,
          result,
          mitigation,
          enemySkillDamageToHp,
          enemySkillShieldAbsorbed,
          legacyFortressReaction,
        );
        const legacyReactiveDefenseCharges = consumeReactiveDefenseCharges(
          {
            evasion: state.stacks.skillEvasionTurns,
            damageReduction: state.stacks.skillDmgReduceTurns,
            reflect: state.stacks.skillReflectBoostTurns,
          },
          {
            evasionUsed:
              result.enemyDamage > 0 && state.stacks.skillEvasionTurns > 0,
            landed: result.enemyDamage > 0,
            reflectEligible: legacyEnemySkillReflection.genericReflectEligible,
          },
        );
        if (result.enemyDamage > 0 && result.castSkillName) {
          if (enemySkillShieldAbsorbed > 0) {
            nextLog = appendLog(nextLog, {
              kind: "info",
              text: `[철벽] 보호막이 ${enemySkillShieldAbsorbed} 흡수 (남은 ${nextPlayerShield})`,
              turn: "enemy",
            });
          }
          for (const entry of magicBarrierCombatLogEntries(enemySkillMagicBarrier)) {
            nextLog = appendLog(nextLog, { ...entry, turn: "enemy" });
          }
          nextPlayerHp = Math.max(0, nextPlayerHp - enemySkillDamageToHp);
          nextLog = appendLog(nextLog, {
            kind: "enemy_attack",
            text: `${result.castSkillName}! ${enemySkillDamageToHp} 피해를 입혔다.`,
          });
          const survival = applyBerserkerHostileDamage(
            { ...state, playerHp: nextPlayerHp, log: nextLog },
            player,
            nextPlayerHp,
          );
          state = survival.state;
          nextPlayerHp = state.playerHp;
          nextLog = state.log;
        }
        if (legacyFortressReaction.impact > state.stacks.fortressImpact) {
          nextLog = appendLog(nextLog, {
            kind: "info",
            text: `[충격 방벽] 충격 +1 (현재 ${legacyFortressReaction.impact}/3)`,
            turn: "enemy",
          });
        }
        if (legacyEnemySkillReflection.damage > 0) {
          nextEnemyHp = Math.max(
            0,
            nextEnemyHp - legacyEnemySkillReflection.damage,
          );
          nextLog = appendLog(nextLog, {
            kind: "player_attack",
            text: `[${legacyEnemySkillReflection.labels.join(" + ")}] ${state.enemy.name}에게 ${legacyEnemySkillReflection.damage} 반사 피해.`,
            turn: "enemy",
          });
        }
        if (legacyFortressReaction.ironWallReflected) {
          nextLog = appendLog(nextLog, {
            kind: "info",
            text: `[철벽 태세] 철벽 반사 ${legacyFortressReaction.ironWallReflectCharges}회 남음`,
            turn: "enemy",
          });
        }
        const enemySkillEnduranceFires =
          nextPlayerHp <= 0 &&
          !!player.enduranceActive &&
          !state.flags.enduranceTriggered;
        if (enemySkillEnduranceFires) {
          nextPlayerHp = 1;
          nextLog = appendLog(nextLog, {
            kind: "info",
            text: `[불굴] 마지막 한 숨 — HP 1 로 버텼다!`,
            turn: "enemy",
          });
        }
        // 적의 self heal — enemy_attack kind (적 측 행동). 화상(enemyHealReduce)이 있으면 회복 감소.
        //   디버프 없으면(0) Math.floor 미적용 → byte-identical. (라이브 ATB 는 적 cast 미발동이라 inert)
        if (
          nextEnemyHp > 0 &&
          result.selfHeal > 0 &&
          result.castSkillName
        ) {
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
        if (nextEnemyHp > 0 && result.selfHpCost > 0) {
          nextEnemyHp = Math.max(1, nextEnemyHp - result.selfHpCost);
        }
        const nextEnemySelfBuffs = applyV2BuffsToMap(tickedEnemySelfBuffs, result.selfBuffsToApply);
        // 적대 상태는 장비 1회 방어를 먼저, 그 다음 정화결계를 소비한다.
        const sigStatusBlock = statusBlockOnce(player.equipSignatures);
        const hasHostileStatus =
          result.enemyDebuffsToApply.length > 0 ||
          result.dotsToApplyToTarget.length > 0;
        const statusBlockTargetEffects =
          hasHostileStatus &&
          !!sigStatusBlock &&
          !state.flags.statusBlockUsed;
        const purificationBlockTargetEffects =
          hasHostileStatus &&
          !statusBlockTargetEffects &&
          mitigation.tripleWard.purification > 0;
        const blockHostileStatus =
          statusBlockTargetEffects || purificationBlockTargetEffects;
        const nextTripleWard = purificationBlockTargetEffects
          ? consumePurificationWard(mitigation.tripleWard).state
          : mitigation.tripleWard;
        // enemyDebuff effect (적이 player 에 거는 약화) → state.v2SelfDebuffs 갱신.
        const nextPlayerDebuffs = blockHostileStatus
          ? tickedPlayerDebuffs
          : applyV2BuffsToMap(tickedPlayerDebuffs, result.enemyDebuffsToApply);
        // PR-8 — enemy cast 의 dot 결과 → state.playerV2Dots 박힘 (target=player).
        const nextPlayerDots = blockHostileStatus
          ? state.playerV2Dots
          : applyV2DotsToTarget(state.playerV2Dots, result.dotsToApplyToTarget);
        for (const b of result.selfBuffsToApply) {
          nextLog = appendLog(nextLog, {
            kind: "info",
            text: `[${result.castSkillName ?? "강화"}] ${STAT_LABELS[b.stat]} +${b.pct}% (${b.turns}행동)`,
            turn: "enemy",
          });
        }
        for (const d of blockHostileStatus ? [] : result.enemyDebuffsToApply) {
          nextLog = appendLog(nextLog, {
            kind: "info",
            text: `[${[result.castSkillName, statusNameForDebuffStat(d.stat)].filter(Boolean).join(" + ") || "약화"}] ${STAT_LABELS[d.stat]} -${d.pct}% (${d.turns}행동)`,
            turn: "enemy",
          });
        }
        if (statusBlockTargetEffects && sigStatusBlock) {
          nextLog = appendLog(nextLog, {
            kind: "info",
            text: `[${sigStatusBlock.label}] 상태이상을 막았다.`,
            turn: "enemy",
          });
        }
        if (purificationBlockTargetEffects) {
          nextLog = appendLog(nextLog, {
            kind: "info",
            text: `[${TRIPLE_WARD_LABELS.purification}] 상태이상을 막았다. (${nextTripleWard.purification}회 남음)`,
            turn: "enemy",
          });
        }
        for (const dot of blockHostileStatus ? [] : result.dotsToApplyToTarget) {
          nextLog = appendLog(nextLog, {
            kind: "info",
            text: `[${[result.castSkillName, dot.label].filter(Boolean).join(" + ")}] +${dot.stacks}스택 (${dot.turns}회)`,
            turn: "enemy",
          });
        }
        const countered =
          enemySkillDamageToHp > 0 && result.castSkillName
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
          playerMagicBarrier: enemySkillMagicBarrier.durabilityLeft,
          enemyHp: nextEnemyHp,
          enemyMp: result.nextMp,
          enemyV2SkillCooldowns: result.nextCooldowns,
          enemyV2SelfBuffs: nextEnemySelfBuffs,
          enemyV2Debuffs: tickedEnemyDebuffsLocal,
          v2SelfDebuffs: nextPlayerDebuffs,
          playerV2Dots: nextPlayerDots,
          flags: {
            ...state.flags,
            enduranceTriggered:
              state.flags.enduranceTriggered || enemySkillEnduranceFires,
            statusBlockUsed:
              state.flags.statusBlockUsed || statusBlockTargetEffects,
          },
          stacks: {
            ...state.stacks,
            tripleWard: nextTripleWard,
            playerShield: nextPlayerShield,
            skillEvasionTurns: legacyReactiveDefenseCharges.evasion,
            skillDmgReduceTurns:
              legacyReactiveDefenseCharges.damageReduction,
            skillReflectBoostTurns: legacyReactiveDefenseCharges.reflect,
            fortressImpact: legacyFortressReaction.impact,
            ironWallReflectCharges:
              legacyFortressReaction.ironWallReflectCharges,
          },
          log: nextLog,
        };
        state = applyTrackedSetShieldAbsorptionPve(
          state,
          player,
          enemySkillShieldAbsorbed,
        );
        if (
          state.stacks.tier6Uniques &&
          enemySkillShieldBefore > 0 &&
          nextPlayerShield <= 0 &&
          enemySkillShieldAbsorbed > 0
        ) {
          state = applyTier6UniquePveEvent(state, player, {
            kind: "shield_broken",
            shieldBefore: enemySkillShieldBefore,
            overflowDamage: enemySkillAfterShield,
            maxHp: state.playerMaxHp,
            origin: {
              actionId: state.turn.enemyPhasesCompleted + 1,
              eventId: state.log.length,
            },
          });
        }
        if (state.stacks.tier6Uniques) {
          state = applyTier6UniquePveEvent(state, player, {
            kind: "hp_threshold",
            currentHp: state.playerHp,
            maxHp: state.playerMaxHp,
            origin: {
              actionId: state.turn.enemyPhasesCompleted + 1,
              eventId: state.log.length,
            },
          });
        }
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
        if (state.enemyHp <= 0) {
          state = {
            ...state,
            enemyHp: 0,
            log: appendLog(state.log, {
              kind: "info",
              text: `${state.enemy.name}을(를) 쓰러뜨렸다!`,
              turn: "enemy",
            }),
            outcome: "win",
            phase: "ended",
          };
          continue;
        }
        if (state.berserker) {
          state = {
            ...state,
            berserker: finishBerserkerCurrentActionGuard(state.berserker),
          };
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
      enemySkillFiredThisTurn || shockSkipsEnemyAction,
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
        endReason: "timeout",
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
        endReason: "timeout",
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
