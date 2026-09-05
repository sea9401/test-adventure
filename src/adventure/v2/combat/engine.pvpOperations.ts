import { computeMpRestoreAmount, type Potion } from "@/adventure/data/potions";
import {
  applyEvasionDamageReduction,
  BLEED_MAX_STACKS,
  cappedDefReductionPct,
  EVASION_DAMAGE_REDUCTION_MAX_PCT,
  HEAVEN_DECREE_HP_PCT,
  LUCKY_STAR_DAMAGE_MULT,
  pvpEvasionDamageReductionPct,
  RAMPAGE_START_TURN,
} from "@/adventure/data/v2/v2CombatConstants";
import { aggregateEquippedPassives, V2_SKILLS } from "@/adventure/data/v2/v2Skills";
import {
  finishBerserkerCurrentActionGuard,
  finishBerserkerPlayerAttack,
  initialBerserkerCombatState,
  type BerserkerCombatState,
} from "./berserkerCombat";
import {
  applyPlayerPoisonDamageScaling,
  applyV2DotsToTarget,
  decrementTimedBuffs,
  distributeV2DotTicks,
  healingAfterReceivedMultiplier,
  makeBleedDot,
  makePoisonDot,
  potionHealAmount,
  rollAttackCount,
  statusDamageAfterReduction,
  tickV2Dots,
  v2AtkBuffMult,
  v2DefBuffMult,
  v2DotLogCause,
  type V2SkillDotApply,
} from "./combatShared";
import { appendLog } from "./engineSupport";
import { damageBetween } from "./combatShared";
import { type BattleLogEntry, type PlayerCombat } from "./engineState";
import { reducedMagicDefense } from "./engine.damageHelpers";
import { scalePositivePvPValue, scalePvPDamage, scalePvPHealing } from "./engine.pvpScaling";
import {
  type PvPBattleState,
  type PvPPhase,
  type PvPPhaseEndOptions,
  type PvPSide,
  type PvPSideBuffs,
} from "./engine.pvpState";
import { consumeReactiveDefenseCharges, resolveFortressReaction } from "./fortressKnight";
import { emptyLawInscriptionState } from "./lawInscription";
import { magicBarrierCombatLogEntries, resolveMagicBarrierDamage } from "./magicBarrier";
import { effectiveMutationDef } from "./mutationCombat";
import {
  appendPvPSurvivalLogs,
  applyBerserkerHostileDamagePvP,
  resolvePvPHostileDamageSurvival,
} from "./pvpHostileDamage";
import { type PvPInitiativeActor } from "./pvpInitiative";
import { recordChargeHpLoss } from "./ruinBladeCombat";
import { releaseSwordShadow } from "./shadowBladeCombat";
import {
  battleStartShield,
  healToShield,
  onDodgeSpeedBuff,
  resolveTrackedShieldAbsorption,
  rollEvasionActionRecovery,
  statusBlockOnce,
  trackedBattleStartShield,
  trackedShieldBreakEffect,
} from "./signatureEffects";
import { hasTier6Unique, initialTier6UniqueRuntime } from "./tier6UniqueEffects";
import { applyTier6UniquePvpEvent } from "./tier6UniquePvpAdapter";
import { consumePurificationWard, initialTripleWardState } from "./tripleWard";

export function applyTrackedSetShieldAbsorptionPvP(
  side: PvPSide,
  shieldAbsorbed: number,
  totalShieldBefore = side.stacks.playerShield + shieldAbsorbed,
): { side: PvPSide; triggered: boolean; label: string | null } {
  const effect = trackedShieldBreakEffect(side.player.equipSignatures);
  if (!effect) return { side, triggered: false, label: null };
  const resolution = resolveTrackedShieldAbsorption({
    remaining: side.stacks.trackedSetShield ?? 0,
    totalShieldBefore,
    shieldAbsorbed,
    alreadyTriggered: side.flags.trackedShieldBreakUsed ?? false,
  });
  if (!resolution.triggered) {
    return {
      side: {
        ...side,
        stacks: { ...side.stacks, trackedSetShield: resolution.remaining },
      },
      triggered: false,
      label: null,
    };
  }
  return {
    side: {
      ...side,
      flags: { ...side.flags, trackedShieldBreakUsed: true },
      buffs: {
        ...side.buffs,
        playerDmgReductionPct: Math.max(
          side.buffs.playerDmgReductionPct,
          effect.damageReductionPct,
        ),
        playerDmgReductionTurnsLeft: Math.max(
          side.buffs.playerDmgReductionTurnsLeft,
          effect.actions,
        ),
      },
      v2Dots: effect.cleanse ? [] : side.v2Dots,
      v2SelfDebuffs: effect.cleanse ? {} : side.v2SelfDebuffs,
      stacks: {
        ...side.stacks,
        trackedSetShield: 0,
        ...(effect.cleanse
          ? {
              accuracyDownPct: 0,
              accuracyDownTurns: 0,
              healReducePct: 0,
              healReduceTurns: 0,
              damageDownPct: 0,
              damageDownTurns: 0,
              skillProcDownPct: 0,
              skillProcDownTurns: 0,
              dotVulnPct: 0,
              dotVulnTurns: 0,
              magicVulnStacks: 0,
            }
          : {}),
      },
    },
    triggered: true,
    label: effect.label,
  };
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
  return Math.min(
    EVASION_DAMAGE_REDUCTION_MAX_PCT,
    pvpEvasionDamageReductionPct(
      evasionRating,
      effectivePvPAccuracyRating(opponent),
    ) + Math.max(0, actor.player.finalEvasionReductionPctAdd ?? 0),
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
  const scaled = healingAfterReceivedMultiplier(
    scalePvPHealing(state, recovery.amount),
    actor.player.receivedHealMult,
  );
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
export function attackerAtkWithMadness(attacker: PvPSide): number {
  const buffPct =
    attacker.buffs.playerAtkBuffTurnsLeft > 0 ? attacker.buffs.playerAtkBuffPct : 0;
  const bonus = buffPct > 0 ? Math.floor((attacker.player.atk * buffPct) / 100) : 0;
  return attacker.player.atk + bonus;
}


export function effectiveAttackerAtk(attacker: PvPSide, defender: PvPSide): number {
  return Math.max(
    0,
    attackerAtkWithMadness(attacker) +
      attacker.buffs.rampageAtkBonus -
      defender.buffs.opponentAtkPenalty,
  );
}


export function sideHasDot(side: PvPSide, tag: import("./combatShared").V2DotTag): boolean {
  return side.v2Dots.some((d) => d.tag === tag && d.stacks > 0 && d.turns > 0);
}


export function skillTargetDef(attacker: PvPSide, defender: PvPSide): number {
  // 평타와 같은 방어 관통·전투 중 페널티·상시 감소·부식을 그대로 사용한다.
  // attackerFacingDef 가 부식을 이미 적용하므로 이 경로에서 다시 감산하지 않는다.
  return attackerFacingDef(attacker, defender);
}


export function skillTargetMagicDef(attacker: PvPSide, defender: PvPSide): number {
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


export function applyPoisonDamageToDots(
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
      atkCoefPerStack: attacker.player.bleedOnHit?.atkCoefPerStack,
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


// 현 phase 에서 (attacker, defender) 키 결정.
export function actorKeys(phase: PvPPhase): { atkKey: "p1" | "p2"; defKey: "p1" | "p2" } {
  if (phase === "p1") return { atkKey: "p1", defKey: "p2" };
  return { atkKey: "p2", defKey: "p1" };
}


// ── 초기화 ──────────────────────────────────────────────────────────────────

export function buildSide(
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
  const trackedStartShield = trackedBattleStartShield(
    player.equipSignatures,
    player.maxHp,
  );
  const scaledTrackedStartShield = trackedStartShield
    ? scalePositivePvPValue(trackedStartShield.amount, sustainMultiplier)
    : 0;
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
      ...(trackedStartShield ? { trackedShieldBreakUsed: false } : {}),
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
      ...(trackedStartShield
        ? { trackedSetShield: scaledTrackedStartShield }
        : {}),
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
export function applyRegen(state: PvPBattleState, key: "p1" | "p2"): PvPBattleState {
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
  const amount = healingAfterReceivedMultiplier(
    scalePvPHealing(state, reducedAmount),
    side.player.receivedHealMult,
  );
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
export function dealExtraDamage(
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
  const totalHeal = healingAfterReceivedMultiplier(
    scalePvPHealing(
      state,
      luckyLifestealHeal + runeLifestealHeal + apLifestealHeal,
    ),
    player.receivedHealMult,
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
export function applyDodgeEffects(
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
  const evadeHeal = healingAfterReceivedMultiplier(
    scalePvPHealing(st, defForHeal.player.evadeHealAmount ?? 0),
    defForHeal.player.receivedHealMult,
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
  const trackedReflectShieldBreak = applyTrackedSetShieldAbsorptionPvP(
    survival.side,
    shieldAbsorbed,
  );
  let nextAttacker = trackedReflectShieldBreak.side;
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
  if (trackedReflectShieldBreak.triggered) {
    st = {
      ...st,
      log: appendLog(st.log, {
        kind: "info",
        text: `[${trackedReflectShieldBreak.label ?? "보호막 해방"}] ${attacker.name}의 해로운 효과가 해제되고 받는 피해가 감소한다.`,
        side: atkKey,
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
export function finishAttackerTurn(
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
      const heal = healingAfterReceivedMultiplier(
        scalePvPHealing(
          st,
          Math.floor((side.maxHp * s.skillRegenPct) / 100),
        ),
        side.player.receivedHealMult,
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


// 대상의 행동 시작 시 tagged DoT 를 한 번 tick. ATB 는 실제 스케줄러 행동 진입 시 이 helper 를
// 호출하고, legacy 턴제는 endAttackerPhase 의 페이즈 전환 시 호출한다.
export function tickPvPSideDotsOnAction(
  state: PvPBattleState,
  targetKey: "p1" | "p2",
): PvPBattleState {
  if (state.phase === "ended") return state;
  const target = state[targetKey];
  const sourceKey: "p1" | "p2" = targetKey === "p1" ? "p2" : "p1";
  const source = state[sourceKey];
  const bleedBeforeTick = target.v2Dots.find(
    (dot) => dot.tag === "bleed" && dot.turns > 0,
  );
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
  if (nextTarget.stacks.tier7?.ruinCharge) {
    nextTarget = {
      ...nextTarget,
      stacks: {
        ...nextTarget.stacks,
        tier7: {
          ...nextTarget.stacks.tier7,
          ruinCharge: {
            ...recordChargeHpLoss(
              nextTarget.stacks.tier7.ruinCharge,
              Math.min(target.hp, dotDamage),
            ),
            deathBypassTriggered:
              nextTarget.stacks.tier7.ruinCharge.deathBypassTriggered ||
              survival.triggered,
          },
        },
      },
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
  const effectiveDotDamage =
    barrier.absorbedDamage + Math.min(target.hp, dotDamage);
  const actualBleedDamage =
    distributeV2DotTicks(dotTick.ticks, effectiveDotDamage).find(
      (tick) => tick.tag === "bleed",
    )?.damage ?? 0;
  const bleedTickHealPct =
    bleedBeforeTick && bleedBeforeTick.stacks >= BLEED_MAX_STACKS
      ? source.v2Skills.equipped.reduce((sum, skillId) => {
          const mechanic = V2_SKILLS[skillId]?.passive
            ? V2_SKILLS[skillId]?.bleedHunt
            : undefined;
          return sum + Math.max(0, mechanic?.bleedTickHealMaxHpPct ?? 0);
        }, 0)
      : 0;
  const bleedTickHeal =
    actualBleedDamage > 0 && bleedTickHealPct > 0
      ? Math.floor((source.maxHp * bleedTickHealPct) / 100)
      : 0;
  const nextSourceHp = Math.min(source.maxHp, source.hp + bleedTickHeal);
  const actualBleedTickHeal = nextSourceHp - source.hp;
  if (actualBleedTickHeal > 0) {
    next = setSide(next, sourceKey, { ...source, hp: nextSourceHp });
    next = {
      ...next,
      log: appendLog(next.log, {
        kind: "info",
        text: `[피의 양식] ${source.name} HP ${actualBleedTickHeal} 회복했다.`,
        side: sourceKey,
      }),
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


export function releaseSwordShadowAfterPvPAction(
  state: PvPBattleState,
  actorKey: "p1" | "p2",
  shadowOwnerKey: "p1" | "p2",
): PvPBattleState {
  const owner = state[shadowOwnerKey];
  const swordShadow = owner.stacks.tier7?.swordShadow;
  if (!swordShadow) return state;
  const actor = state[actorKey];
  const released = releaseSwordShadow(swordShadow, {
    nextSingleDamagePct: 12,
  });
  const shieldAbsorbed = Math.min(
    actor.stacks.playerShield,
    released.damage,
  );
  const hpDamage = Math.min(
    actor.hp,
    Math.max(0, released.damage - shieldAbsorbed),
  );
  const survival = resolvePvPHostileDamageSurvival(
    {
      ...actor,
      stacks: {
        ...actor.stacks,
        playerShield: actor.stacks.playerShield - shieldAbsorbed,
      },
    },
    actor.hp - hpDamage,
  );
  const actorTier7 = survival.side.stacks.tier7?.ruinCharge
    ? {
        ...survival.side.stacks.tier7,
        ruinCharge: {
          ...recordChargeHpLoss(
            survival.side.stacks.tier7.ruinCharge,
            hpDamage,
          ),
          deathBypassTriggered:
            survival.side.stacks.tier7.ruinCharge.deathBypassTriggered ||
            survival.berserkerTriggered,
        },
      }
    : survival.side.stacks.tier7;
  let next = setSide(state, actorKey, {
    ...survival.side,
    stacks: {
      ...survival.side.stacks,
      ...(actorTier7 ? { tier7: actorTier7 } : {}),
    },
  });
  next = setSide(next, shadowOwnerKey, {
    ...owner,
    stacks: {
      ...owner.stacks,
      tier7: {
        ...owner.stacks.tier7,
        swordShadow: undefined,
        shadowFollowUpPct: released.followUpPct,
        shadowReleaseHastePct: swordShadow.refined ? 20 : 0,
      },
    },
  });
  next = {
    ...next,
    log: appendLog(next.log, {
      kind: "player_attack",
      text: `[검영] ${actor.name}에게 ${released.damage} 지연 피해${shieldAbsorbed > 0 ? ` (보호막 ${shieldAbsorbed} 흡수)` : ""}.`,
      side: shadowOwnerKey,
    }),
  };
  next = appendPvPSurvivalLogs(next, actorKey, actor.name, survival);
  const p1Dead = next.p1.hp <= 0;
  const p2Dead = next.p2.hp <= 0;
  if (!p1Dead && !p2Dead) {
    return state.phase === "ended"
      ? { ...next, phase: actorKey, outcome: null }
      : next;
  }
  return {
    ...next,
    phase: "ended",
    outcome: p1Dead && p2Dead ? "draw" : p1Dead ? "p2_win" : "p1_win",
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
  if (state.phase === "ended") {
    return releaseSwordShadowAfterPvPAction(state, atkKey, defKey);
  }
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
  next = releaseSwordShadowAfterPvPAction(next, atkKey, defKey);
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
    const heal = healingAfterReceivedMultiplier(
      scalePvPHealing(
        state,
        potionHealAmount(potion, side.maxHp, side.buffs.potionHealPct ?? 0),
      ),
      side.player.receivedHealMult,
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
