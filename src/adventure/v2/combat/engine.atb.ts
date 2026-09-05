import type { Monster } from "@/adventure/data/monsters";
import type { PotionId } from "@/adventure/data/potions";
import {
  ATB_TIMELINE_TICK_CAP,
  actionInterval,
  depthSpdCorrection,
  monsterActionSpd,
  nextActor1v1,
} from "./combatTimeline";
import {
  BOSS_MAX_HP_DAMAGE_MULT,
  type BattleLogEntry,
  type BattleState,
  type PlayerAction,
  type PlayerCombat,
} from "./engineState";
import { appendLog, applyEvasionActionRecoveryPvE } from "./engineSupport";
import {
  applyBerserkerHostileDamage,
  applyPhaseTriggerIfAny,
  finishEnemyAttack,
  finishPlayerTurn,
  initialBattleState,
  recordEnemyDamage,
  rollPlayerAttackCountWithBleed,
} from "./engine.pveOperations";
import { applyEnemyV2SkillCast } from "./engine.enemySkills";
import { applyPlayerV2SkillCast } from "./engine.playerSkills";
import { type BattleResolution, type ResolveContext } from "./engineResolutionTypes";
import { finishBerserkerCurrentActionGuard } from "./berserkerCombat";
import {
  releaseSwordShadowAfterEnemyAction,
  resolveForcedEnemyMagicHit,
  resolveForcedEnemyPhysicalHit,
  resolveEnemyPhase,
} from "./engine.enemyPhase";
import { resolvePlayerPhase } from "./engine.playerPhase";
import {
  decrementTimedBuffs,
  distributeV2DotTicks,
  statusDamageAfterReduction,
  healingAfterReceivedMultiplier,
  tickV2BuffMap,
  tickV2Dots,
  v2DotLogCause,
} from "./combatShared";
import { V2_ATB_SKILLS } from "@/adventure/data/v2/coreLoopConfig";
import { V2_SKILLS } from "@/adventure/data/v2/v2Skills";
import { BLEED_MAX_STACKS } from "@/adventure/data/v2/v2CombatConstants";
import { magicBarrierCombatLogEntries, resolveMagicBarrierDamage } from "./magicBarrier";
import { activeTier6ResourceSnapshot } from "./tier6UniqueEffects";
import { consumeDuelistCritHaste } from "./duelistCombat";
import { enterShockAction } from "./shockAction";
import {
  consumePurificationWard,
  mergeTripleWardResourceSnapshot,
  TRIPLE_WARD_LABELS,
} from "./tripleWard";
import { mergeLawInscriptionSnapshot } from "./lawInscription";
import { mergeTier7ResourceSnapshot } from "./engineState";
import { mergeFrostChillSnapshot } from "./frostChill";
import { weightSpeedMultiplier } from "./mutationCombat";
import { recordChargeHpLoss } from "./ruinBladeCombat";
import { statusBlockOnce } from "./signatureEffects";
import {
  TRACKING_ELIMINATION_HIT_MULTIPLIER,
  TRACKING_ELIMINATION_PHYSICAL_DEFENSE_PIERCE_PCT,
  TRACKING_THREAT_MAX,
  accumulateTrackingThreat,
  resolveTrackingThreatAfterPlayerAction,
  trackingThreatGain,
} from "./trackingWeaponMechanic";
import {
  TOXIC_BLOOD_MAX_STACKS,
  TOXIC_RECOVERY_LOCK_ACTIONS,
  consumeToxicRecoveryAction,
  resolveToxicBloodGain,
  toxicBloodRawDotDamage,
  toxicBloodRawExplosionDamage,
  toxicBloodRecoveryMultiplier,
} from "./toxicBloodLordMechanic";
import {
  GLACIAL_CHILL_THRESHOLD,
  GLACIAL_FIELD_INTERVAL_TICKS,
  glacialChillSpeedMultiplier,
  rescaleReservedPlayerTick,
  resolveGlacialChillGain,
} from "./glacialColossusMechanic";
import {
  INVINCIBLE_FORTRESS_BARRIER_HP,
  advanceInvincibleFortressBarrier,
  invincibleFortressEnrageMultipliers,
  invincibleFortressResourceSnapshot,
  normalizeInvincibleFortressState,
  settleInvincibleFortressDamage,
  type InvincibleFortressDamageEvent,
} from "./invincibleFortressMechanic";
import {
  SKYWARD_CRYSTAL_EYE_EXPOSURE_DAMAGE_PCT,
  SKYWARD_CRYSTAL_EYE_STACK_CAP,
  addSkywardCrystalEyeHit,
  advanceSkywardCrystalEyeTimers,
  fireSkywardCrystalEyeArtillery,
  normalizeSkywardCrystalEyeState,
  skywardCrystalEyeBasePowerPct,
  skywardCrystalEyeResourceSnapshot,
} from "./skywardCrystalEyeMechanic";
import {
  advanceImmortalBerserkerEnemyAction,
  immortalBerserkerDisplay,
  immortalBerserkerMultipliers,
  normalizeImmortalBerserkerState,
  settleImmortalBerserkerDamage,
} from "./immortalBerserkerMechanic";

export const ATB_TICK_CAP = ATB_TIMELINE_TICK_CAP;
export const ATB_ACTION_GUARD = 1000;

function hpBarEntry(state: BattleState, tick?: number): BattleLogEntry {
  const playerResources = mergeLawInscriptionSnapshot(
    mergeTripleWardResourceSnapshot(
      mergeTier7ResourceSnapshot(
        activeTier6ResourceSnapshot(state.stacks.tier6Uniques),
        state.stacks.tier7,
      ),
      state.stacks.tripleWard,
    ),
    state.stacks.lawInscriptions,
  );
  const bossResources: Record<string, number | string> | undefined =
    state.bossMechanic?.kind === "invincible_fortress"
      ? invincibleFortressResourceSnapshot(
          state.bossMechanic,
          state.bossSharedMaxHp ?? state.enemy.hp,
        )
      : state.bossMechanic?.kind === "skyward_crystal_eye"
        ? skywardCrystalEyeResourceSnapshot(state.bossMechanic)
      : state.bossMechanic?.kind === "immortal_berserker"
        ? (() => {
            const display = immortalBerserkerDisplay(
              state.bossMechanic,
              state.bossSharedMaxHp ?? state.enemy.hp,
              state.enemyHp,
            );
            return {
              immortalLife: `${display.lifeIndex + 1}/3`,
              immortalLifeHp: `${display.lifeHp.toLocaleString("ko-KR")} / ${display.lifeMaxHp.toLocaleString("ko-KR")}`,
              immortalRegeneration:
                display.regenUsesRemaining > 0
                  ? `${display.regenActionsRemaining}행동 · ${display.regenUsesRemaining}회`
                  : "소진",
              immortalEnrage:
                display.lifeIndex === 0
                  ? "없음"
                  : `공격 +${Math.round((display.atkMult - 1) * 100)}% · 속도 +${Math.round((display.spdMult - 1) * 100)}%`,
            };
          })()
      : state.bossMechanic?.kind === "tracking_weapon"
      ? {
          trackingThreat: `${state.bossMechanic.trackingThreat}/${TRACKING_THREAT_MAX}`,
        }
      : state.bossMechanic?.kind === "glacial_colossus" &&
          state.bossMechanic.glacialChillStacks > 0
        ? {
            glacialChill: `${state.bossMechanic.glacialChillStacks}/${GLACIAL_CHILL_THRESHOLD}`,
          }
        : state.bossMechanic?.kind === "glacial_colossus" &&
            state.bossMechanic.glacialFreezePending === 1
          ? { glacialFreeze: "1/1" }
      : state.bossMechanic?.kind === "toxic_blood_lord" &&
          state.bossMechanic.toxicBloodStacks > 0
        ? {
            toxicBlood: `${state.bossMechanic.toxicBloodStacks}/${TOXIC_BLOOD_MAX_STACKS}`,
          }
        : state.bossMechanic?.kind === "toxic_blood_lord" &&
            state.bossMechanic.toxicRecoveryLockActions > 0
          ? {
              toxicRecoveryLock: `${state.bossMechanic.toxicRecoveryLockActions}/${TOXIC_RECOVERY_LOCK_ACTIONS}`,
            }
      : undefined;
  const enemyResources = mergeFrostChillSnapshot(
    bossResources,
    state.stacks.enemyFrostChillStacks,
  );
  return {
    kind: "hp_bar",
    text: "",
    turn: "player",
    ...(tick != null ? { t: tick } : {}),
    playerHp: state.playerHp,
    playerMaxHp: state.playerMaxHp,
    enemyHp: state.enemyHp,
    enemyMaxHp: state.enemy.hp,
    playerMp: state.playerMp,
    playerMaxMp: state.playerMaxMp,
    enemyMp: state.enemyMp,
    enemyMaxMp: state.enemyMaxMp,
    playerMagicBarrier: state.playerMagicBarrier,
    playerMagicBarrierMax: state.playerMagicBarrierMax,
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
}

function rollEnemyAttackCount(enemy: Monster): number {
  const chance = enemy.bonusAttackChancePct ?? 0;
  if (chance <= 0) return 1;
  const guaranteed = Math.floor(chance / 100);
  const remainder = chance - guaranteed * 100;
  return 1 + guaranteed + (Math.random() * 100 < remainder ? 1 : 0);
}

export function effectivePlayerSpd(
  player: PlayerCombat,
  state: BattleState,
): number {
  const buffed = state.buffs.playerSpdTurnsLeft > 0
    ? player.spd * state.buffs.playerSpdMult
    : player.spd;
  const weighted = buffed * weightSpeedMultiplier(state.stacks.mutationWeight);
  return state.bossMechanic?.kind === "glacial_colossus"
    ? weighted *
        glacialChillSpeedMultiplier(state.bossMechanic.glacialChillStacks)
    : weighted;
}

function effectiveEnemyTimelineSpd(
  state: BattleState,
  depthCorr: number,
): number {
  const base = monsterActionSpd(state.enemy, depthCorr);
  return state.buffs.enemySpdTurnsLeft > 0
    ? base * state.buffs.enemySpdMult
    : base;
}

function applyInvincibleFortressTierToEnemy(
  state: BattleState,
  baseEnemy: Monster,
): BattleState {
  const mechanic = state.bossMechanic;
  if (!mechanic || mechanic.kind !== "invincible_fortress") return state;
  const multipliers = invincibleFortressEnrageMultipliers(
    mechanic.activeBarrierIndex === null ? mechanic.enrageTier : 0,
  );
  return {
    ...state,
    enemy: {
      ...state.enemy,
      atk: baseEnemy.atk * multipliers.atkMult,
      spd: baseEnemy.spd * multipliers.spdMult,
    },
  };
}

function applyImmortalBerserkerLifeToEnemy(
  state: BattleState,
  baseEnemy: Monster,
): BattleState {
  const mechanic = state.bossMechanic;
  if (!mechanic || mechanic.kind !== "immortal_berserker") return state;
  const multipliers = immortalBerserkerMultipliers(mechanic.lifeIndex);
  return {
    ...state,
    enemy: {
      ...state.enemy,
      atk: baseEnemy.atk * multipliers.atkMult,
      spd: baseEnemy.spd * multipliers.spdMult,
    },
  };
}

function withoutPrematureVictoryLog(
  before: BattleState,
  after: BattleState,
): BattleLogEntry[] {
  return [
    ...after.log.slice(0, before.log.length),
    ...after.log.slice(before.log.length).filter(
      (entry) => !entry.text.includes("쓰러뜨렸다"),
    ),
  ];
}

function appendInvincibleFortressDamageEvents(
  initialLog: BattleLogEntry[],
  events: readonly InvincibleFortressDamageEvent[],
  turn: "player" | "enemy",
  tick?: number,
): BattleLogEntry[] {
  let log = initialLog;
  const timing = tick === undefined ? {} : { t: tick };
  for (const event of events) {
    if (event.kind === "barrier_started") {
      log = appendLog(log, {
        kind: "info",
        effect: "status",
        text: `방벽 시험 시작 — ${event.barrierIndex + 1}/4`,
        turn,
        ...timing,
      });
      continue;
    }
    if (event.kind === "barrier_damage") {
      const remainingBarrier = Math.max(
        0,
        INVINCIBLE_FORTRESS_BARRIER_HP - event.totalDamage,
      );
      log = appendLog(log, {
        kind: "info",
        effect: "extra_damage",
        text: `방벽 피해 +${event.damage.toLocaleString("ko-KR")} · 남은 ${remainingBarrier.toLocaleString("ko-KR")} / ${INVINCIBLE_FORTRESS_BARRIER_HP.toLocaleString("ko-KR")}`,
        turn,
        ...timing,
      });
      continue;
    }
    log = appendLog(
      appendLog(log, {
        kind: "info",
        effect: "status",
        text: `방벽 파괴 — 누적 ${event.totalDamage.toLocaleString("ko-KR")}`,
        turn,
        ...timing,
      }),
      {
        kind: "info",
        effect: "status",
        text: `광폭 ${event.tier}단계 적용`,
        turn,
        ...timing,
      },
    );
  }
  return log;
}

function settleInvincibleFortressAfterPlayerDamage(args: {
  before: BattleState;
  after: BattleState;
  tick: number;
}): BattleState {
  const mechanic = args.before.bossMechanic;
  if (!mechanic || mechanic.kind !== "invincible_fortress") {
    return args.after;
  }
  const incomingDamage = Math.max(
    0,
    args.before.enemyHp - args.after.enemyHp,
  );
  if (incomingDamage <= 0) return args.after;
  const settled = settleInvincibleFortressDamage({
    state: mechanic,
    currentHp: args.before.enemyHp,
    incomingDamage,
    maxHp: args.before.bossSharedMaxHp ?? args.before.enemy.hp,
  });
  const log = appendInvincibleFortressDamageEvents(
    args.after.log,
    settled.barrierEvents,
    "player",
    args.tick,
  );

  const prematureVictory =
    args.after.outcome === "win" && settled.bodyHp > 0;
  if (prematureVictory) {
    const attacksLeft = Math.max(0, args.before.playerAttacksLeft - 1);
    return {
      ...args.after,
      enemyHp: settled.bodyHp,
      bossMechanic: settled.state,
      log: [
        ...withoutPrematureVictoryLog(args.before, { ...args.after, log }),
      ],
      phase: attacksLeft > 0 ? "player" : "enemy",
      outcome: null,
      playerAttacksLeft: attacksLeft,
      turn: {
        ...args.after.turn,
        completedPlayerTurns:
          attacksLeft > 0
            ? args.before.turn.completedPlayerTurns
            : args.after.turn.completedPlayerTurns,
      },
    };
  }
  return {
    ...args.after,
    enemyHp: settled.bodyHp,
    bossMechanic: settled.state,
    log,
  };
}

function settleImmortalBerserkerAfterPlayerDamage(args: {
  before: BattleState;
  after: BattleState;
  tick: number;
}): BattleState {
  const mechanic = args.before.bossMechanic;
  if (!mechanic || mechanic.kind !== "immortal_berserker") {
    return args.after;
  }
  const incomingDamage = Math.max(0, args.before.enemyHp - args.after.enemyHp);
  if (incomingDamage <= 0) return args.after;
  const settled = settleImmortalBerserkerDamage({
    state: mechanic,
    currentHp: args.before.enemyHp,
    incomingDamage,
    maxHp: args.before.bossSharedMaxHp ?? args.before.enemy.hp,
  });
  let log = args.after.log;
  if (settled.revived) {
    log = withoutPrematureVictoryLog(args.before, { ...args.after, log });
    const ordinal = settled.state.lifeIndex === 1 ? "첫 번째" : "두 번째";
    const multipliers = immortalBerserkerMultipliers(settled.state.lifeIndex);
    log = appendLog(log, {
      kind: "info",
      effect: "status",
      text: `${ordinal} 부활 · 생명 ${settled.state.lifeIndex + 1}/3`,
      turn: "player",
      t: args.tick,
    });
    log = appendLog(log, {
      kind: "info",
      effect: "status",
      text: `광폭 · 공격력 +${Math.round((multipliers.atkMult - 1) * 100)}% · 행동 속도 +${Math.round((multipliers.spdMult - 1) * 100)}%`,
      turn: "player",
      t: args.tick,
    });
  }
  const playerDefeated =
    args.after.playerHp <= 0 || args.after.outcome === "lose";
  return {
    ...args.after,
    enemyHp: settled.hp,
    bossMechanic: {
      ...settled.state,
      immortalBodyDamage:
        mechanic.immortalBodyDamage + settled.appliedDamage,
      immortalHealing: mechanic.immortalHealing,
      immortalRevivalCount:
        mechanic.immortalRevivalCount + (settled.revived ? 1 : 0),
    },
    log,
    ...(settled.revived && !playerDefeated
      ? {
          phase: "enemy" as const,
          outcome: null,
          playerAttacksLeft: 0,
          turn: {
            ...args.after.turn,
            completedPlayerTurns:
              args.before.turn.completedPlayerTurns + 1,
            doubleStrikeUsedThisTurn: false,
            lightspeedUsedThisTurn: false,
            critThisTurn: false,
            riposteUsedThisTurn: false,
            firstAttackPending: true,
            galeChainsThisTurn: 0,
            weakpointUsedThisTurn: false,
            fatedChainTriggeredThisTurn: false,
          },
        }
      : {}),
  };
}

function settleImmortalBerserkerAfterEnemyAction(
  state: BattleState,
  baseEnemy: Monster,
  tick: number,
): BattleState {
  const mechanic = state.bossMechanic;
  if (
    !mechanic ||
    mechanic.kind !== "immortal_berserker" ||
    state.enemyHp <= 0
  ) {
    return state;
  }
  const advanced = advanceImmortalBerserkerEnemyAction({
    state: mechanic,
    currentHp: state.enemyHp,
    maxHp: state.bossSharedMaxHp ?? state.enemy.hp,
  });
  let log = state.log;
  if (advanced.regenerationTriggered) {
    log = appendLog(log, {
      kind: "info",
      effect: "status",
      text: `재생 +${advanced.healed.toLocaleString("ko-KR")}`,
      turn: "enemy",
      t: tick,
    });
  }
  return applyImmortalBerserkerLifeToEnemy(
    {
      ...state,
      enemyHp: advanced.hp,
      bossMechanic: {
        ...advanced.state,
        immortalBodyDamage: mechanic.immortalBodyDamage,
        immortalHealing: mechanic.immortalHealing + advanced.healed,
        immortalRevivalCount: mechanic.immortalRevivalCount,
      },
      log,
    },
    baseEnemy,
  );
}

// prevLogLen 이후 새 엔트리에 ATB 틱만 찍는다(turn 미변경). 번들 틱(DoT/사망 로그)처럼
//   tagNewLogEntries 밖에서 추가돼 turn 정렬은 그대로 둬야 하는 엔트리용 — t 누락 방지.
function stampTick(
  state: BattleState,
  prevLogLen: number,
  tick: number,
): BattleState {
  if (state.log.length <= prevLogLen) return state;
  // 새 tail 만 매핑(전체 로그 재스캔 회피 — 긴 전투에서 O(n²) 방지). 이미 t 있으면 보존.
  const tail = state.log
    .slice(prevLogLen)
    .map((entry) => (entry.t != null ? entry : { ...entry, t: tick }));
  return { ...state, log: [...state.log.slice(0, prevLogLen), ...tail] };
}

function tagNewLogEntries(
  state: BattleState,
  prevLogLen: number,
  turn: "player" | "enemy",
  tick?: number,
): BattleState {
  if (state.log.length <= prevLogLen) return state;
  return {
    ...state,
    log: state.log.map((entry, idx) => {
      if (idx < prevLogLen) return entry;
      const withTurn = entry.turn ? entry : { ...entry, turn };
      // ATB 틱 스탬프(UI 윈도우 그룹화용) — 이미 찍혔으면 보존.
      return tick != null && withTurn.t == null
        ? { ...withTurn, t: tick }
        : withTurn;
    }),
  };
}

function appendTrackingLog(
  state: BattleState,
  text: string,
  tick: number,
): BattleState {
  return {
    ...state,
    log: appendLog(state.log, {
      kind: "info",
      text,
      turn: "enemy",
      t: tick,
    }),
  };
}

function trackingDirectHits(
  log: readonly BattleLogEntry[],
  start: number,
): number {
  return log.slice(start).reduce((sum, entry) => {
    if (entry.kind !== "player_attack") return sum;
    return sum + Math.max(0, Math.floor(entry.directHits ?? 1));
  }, 0);
}

export function skywardCrystalEyeStackGainFromLogs(
  log: readonly BattleLogEntry[],
  start: number,
): number {
  return log.slice(start).reduce((sum, entry) => {
    if (entry.kind !== "player_attack" || entry.directHits == null) return sum;
    const directHits = Math.max(0, Math.floor(entry.directHits));
    const criticalHits = Math.min(
      directHits,
      Math.max(0, Math.floor(entry.criticalDirectHits ?? 0)),
    );
    return sum + directHits + criticalHits;
  }, 0);
}

function settleSkywardCrystalEyeAfterPlayerAction(
  state: BattleState,
  logStart: number,
  tick: number,
): BattleState {
  const mechanic = state.bossMechanic;
  if (!mechanic || mechanic.kind !== "skyward_crystal_eye") return state;
  const gain = skywardCrystalEyeStackGainFromLogs(state.log, logStart);
  if (gain <= 0) return state;
  let nextMechanic = mechanic;
  for (let stack = 0; stack < gain; stack += 1) {
    nextMechanic = addSkywardCrystalEyeHit(nextMechanic, false);
  }
  const actualGain = nextMechanic.disruptionStacks - mechanic.disruptionStacks;
  if (actualGain <= 0) return { ...state, bossMechanic: nextMechanic };
  return {
    ...state,
    bossMechanic: nextMechanic,
    log: appendLog(state.log, {
      kind: "info",
      effect: "status",
      text: `조준 붕괴 +${actualGain} · ${nextMechanic.disruptionStacks}/${SKYWARD_CRYSTAL_EYE_STACK_CAP}`,
      turn: "player",
      t: tick,
    }),
  };
}

function settleSkywardCrystalEyeExposureDamage(args: {
  before: BattleState;
  after: BattleState;
  tick: number;
}): BattleState {
  const mechanic = args.before.bossMechanic;
  if (
    !mechanic ||
    mechanic.kind !== "skyward_crystal_eye" ||
    mechanic.coreExposureTicksRemaining <= 0 ||
    args.after.phase === "ended"
  ) {
    return args.after;
  }
  const baseDamage = Math.max(0, args.before.enemyHp - args.after.enemyHp);
  const bonusDamage = Math.min(
    args.after.enemyHp,
    Math.floor(baseDamage * (SKYWARD_CRYSTAL_EYE_EXPOSURE_DAMAGE_PCT / 100)),
  );
  if (bonusDamage <= 0) return args.after;
  const enemyHp = args.after.enemyHp - bonusDamage;
  let log = appendLog(args.after.log, {
    kind: "player_attack",
    effect: "extra_damage",
    text: `[핵 노출] ${bonusDamage} 추가 피해.`,
    turn: "player",
    t: args.tick,
  });
  if (enemyHp <= 0) {
    log = appendLog(log, {
      kind: "info",
      text: `${args.after.enemy.name}을(를) 쓰러뜨렸다!`,
      turn: "player",
      t: args.tick,
    });
  }
  return {
    ...args.after,
    enemyHp,
    log,
    ...(enemyHp <= 0 ? { phase: "ended" as const, outcome: "win" as const } : {}),
  };
}

const SKYWARD_CRYSTAL_EYE_ARTILLERY_MAGIC_DEF_PIERCE_PCT = 50;
const SKYWARD_CRYSTAL_EYE_ARTILLERY_ACCURACY_BONUS = 250;

function fireSkywardCrystalEyeAtbArtillery(args: {
  state: BattleState;
  player: PlayerCombat;
  playerName: string;
  tick: number;
}): BattleState {
  const mechanic = args.state.bossMechanic;
  if (!mechanic || mechanic.kind !== "skyward_crystal_eye") return args.state;
  const stacks = mechanic.disruptionStacks;
  const fired = fireSkywardCrystalEyeArtillery(mechanic);
  const basePowerPct = skywardCrystalEyeBasePowerPct(
    args.state.enemyHp,
    args.state.bossSharedMaxHp ?? args.state.enemy.hp,
  );
  let state: BattleState = {
    ...args.state,
    bossMechanic: fired.state,
    log: appendLog(args.state.log, {
      kind: "info",
      effect: "status",
      text: `천공 포격 발사 · 조준 붕괴 ${stacks}/${SKYWARD_CRYSTAL_EYE_STACK_CAP} · 위력 ${fired.powerPct}%`,
      turn: "enemy",
      t: args.tick,
    }),
  };
  const logStart = state.log.length;
  const shot = resolveForcedEnemyMagicHit(state, args.player, args.playerName, {
    attackName: "천공 포격",
    multiplier: (basePowerPct / 100) * (fired.powerPct / 100),
    magicDefensePiercePct: SKYWARD_CRYSTAL_EYE_ARTILLERY_MAGIC_DEF_PIERCE_PCT,
    accuracyBonus: SKYWARD_CRYSTAL_EYE_ARTILLERY_ACCURACY_BONUS,
    allowCritical: false,
    consumeEnemyAction: false,
  });
  state = shot.state;
  if (state.bossMechanic?.kind === "skyward_crystal_eye") {
    state = {
      ...state,
      bossMechanic: {
        ...state.bossMechanic,
        lastArtilleryDamage: shot.damageToHp,
      },
      skywardCrystalEyeArtilleryEvents: [
        ...(state.skywardCrystalEyeArtilleryEvents ?? []),
        {
          tick: args.tick,
          stacks,
          powerPct: fired.powerPct,
          basePowerPct,
          damage: shot.damageToHp,
          coreExposed: fired.coreExposed,
        },
      ],
    };
  }
  state = tagNewLogEntries(state, logStart, "enemy", args.tick);
  state = {
    ...state,
    log: appendLog(state.log, {
      kind: "info",
      effect: "status",
      text: `천공 포격 실제 피해 ${shot.damageToHp.toLocaleString("ko-KR")}`,
      turn: "enemy",
      t: args.tick,
    }),
  };
  if (fired.coreExposed && state.phase !== "ended") {
    state = {
      ...state,
      log: appendLog(state.log, {
        kind: "info",
        effect: "status",
        text: "완전 조준 붕괴 — 핵 노출 250틱 · 받는 피해 +25%",
        turn: "enemy",
        t: args.tick,
      }),
    };
  }
  return state;
}

function settleTrackingAfterPlayerAction(args: {
  state: BattleState;
  player: PlayerCombat;
  playerName: string;
  enemyHpBefore: number;
  logStart: number;
  tick: number;
}): BattleState {
  const mechanic = args.state.bossMechanic;
  if (!mechanic || mechanic.kind !== "tracking_weapon") return args.state;

  const playerDamage = Math.max(0, args.enemyHpBefore - args.state.enemyHp);
  const directHits = trackingDirectHits(args.state.log, args.logStart);
  const gain = trackingThreatGain({
    damage: playerDamage,
    bossMaxHp: args.state.enemy.hp,
    directHits,
  });
  if (args.state.enemyHp <= 0) {
    return {
      ...args.state,
      bossMechanic: { ...mechanic, trackingThreat: 0 },
    };
  }

  if (args.state.playerHp <= 0) {
    const trackingThreat = accumulateTrackingThreat({
      current: mechanic.trackingThreat,
      gain,
    });
    return {
      ...args.state,
      bossMechanic: { ...mechanic, trackingThreat },
    };
  }

  const resolution = resolveTrackingThreatAfterPlayerAction({
    current: mechanic.trackingThreat,
    gain,
    bossAlive: true,
  });
  const displayThreat = resolution.triggered
    ? TRACKING_THREAT_MAX
    : resolution.threat;
  let state: BattleState = {
    ...args.state,
    bossMechanic: { ...mechanic, trackingThreat: resolution.threat },
  };
  if (gain > 0) {
    state = appendTrackingLog(
      state,
      `추적 +${gain} · 현재 ${displayThreat}/${TRACKING_THREAT_MAX}`,
      args.tick,
    );
  }
  if (resolution.triggered) {
    state = appendTrackingLog(
      state,
      `[추적 ${TRACKING_THREAT_MAX}/${TRACKING_THREAT_MAX}] 조준이 완료되어 추적 병기가 연속 공격을 개시한다.`,
      args.tick,
    );
  } else if (mechanic.trackingThreat < 70 && displayThreat >= 70) {
    state = appendTrackingLog(
      state,
      `[추적 ${displayThreat}/${TRACKING_THREAT_MAX}] 붉은 조준선이 더욱 선명하게 고정된다.`,
      args.tick,
    );
  } else if (mechanic.trackingThreat < 40 && displayThreat >= 40) {
    state = appendTrackingLog(
      state,
      `[추적 ${displayThreat}/${TRACKING_THREAT_MAX}] 조준 장치가 공격 궤적을 따라 움직인다.`,
      args.tick,
    );
  }
  if (!resolution.triggered) return state;

  state = appendTrackingLog(
    state,
    "추적 완료 — 추적 섬멸 발동 (방어력 50% 관통 · 일반 보호막 무시)",
    args.tick,
  );
  const enemyHpBeforeCounter = state.enemyHp;
  let counterDamage = 0;
  for (
    let hit = 0;
    hit < 2 && state.playerHp > 0 && state.enemyHp > 0;
    hit += 1
  ) {
    const logStart = state.log.length;
    const resolved = resolveForcedEnemyPhysicalHit(
      state,
      args.player,
      args.playerName,
      {
        attackName: "추적 섬멸",
        multiplier: TRACKING_ELIMINATION_HIT_MULTIPLIER,
        armorPierce: 0,
        physicalDefensePiercePct:
          TRACKING_ELIMINATION_PHYSICAL_DEFENSE_PIERCE_PCT,
        bypassPlayerShield: true,
        allowCritical: false,
        applyStatus: false,
        consumeEnemyAction: false,
      },
    );
    state = stampTick(resolved.state, logStart, args.tick);
    counterDamage += resolved.damageToHp;
  }

  const counterReactionDamage = Math.max(
    0,
    enemyHpBeforeCounter - state.enemyHp,
  );
  const reactionGain = trackingThreatGain({
    damage: counterReactionDamage,
    bossMaxHp: state.enemy.hp,
    directHits: 0,
  });
  const trackingThreat =
    state.enemyHp <= 0
      ? 0
      : accumulateTrackingThreat({
          current: resolution.threat,
          gain: reactionGain,
        });
  state = {
    ...state,
    bossMechanic: {
      ...mechanic,
      trackingThreat,
      trackingCounterCount: mechanic.trackingCounterCount + 1,
      trackingCounterDamage: mechanic.trackingCounterDamage + counterDamage,
    },
  };
  state = appendTrackingLog(
    state,
    `추적 섬멸 총피해 ${counterDamage}`,
    args.tick,
  );
  if (trackingThreat > 0) {
    state = appendTrackingLog(
      state,
      `잔여 추적 ${trackingThreat}/${TRACKING_THREAT_MAX}`,
      args.tick,
    );
  }
  return state;
}

function accumulateTrackingFromEnemyAction(
  state: BattleState,
  enemyHpBefore: number,
): BattleState {
  const mechanic = state.bossMechanic;
  if (!mechanic || mechanic.kind !== "tracking_weapon") return state;
  if (state.enemyHp <= 0) {
    return {
      ...state,
      bossMechanic: { ...mechanic, trackingThreat: 0 },
    };
  }
  const gain = trackingThreatGain({
    damage: Math.max(0, enemyHpBefore - state.enemyHp),
    bossMaxHp: state.enemy.hp,
    directHits: 0,
  });
  if (gain <= 0) return state;
  return {
    ...state,
    bossMechanic: {
      ...mechanic,
      trackingThreat: accumulateTrackingThreat({
        current: mechanic.trackingThreat,
        gain,
      }),
    },
  };
}

function appendGlacialLog(
  state: BattleState,
  text: string,
  turn: "player" | "enemy",
  tick: number,
): BattleState {
  return {
    ...state,
    log: appendLog(state.log, {
      kind: "info",
      effect: "status",
      text,
      turn,
      t: tick,
    }),
  };
}

function appendGlacialThresholdWarning(
  state: BattleState,
  previousStacks: number,
  displayStacks: number,
  tick: number,
): BattleState {
  if (previousStacks < 7 && displayStacks >= 7) {
    return appendGlacialLog(
      state,
      `[한기 ${displayStacks}/${GLACIAL_CHILL_THRESHOLD}] 온몸에 서리가 번져 움직임을 붙잡는다.`,
      "enemy",
      tick,
    );
  }
  if (previousStacks < 4 && displayStacks >= 4) {
    return appendGlacialLog(
      state,
      `[한기 ${displayStacks}/${GLACIAL_CHILL_THRESHOLD}] 냉기장이 짙어지며 움직임이 무거워진다.`,
      "enemy",
      tick,
    );
  }
  return state;
}

function settleGlacialChillAfterEnemyAction(args: {
  state: BattleState;
  player: PlayerCombat;
  logStart: number;
  previousStacks: number;
  currentTick: number;
  playerNextTick: number;
}): { state: BattleState; playerNextTick: number } {
  const mechanic = args.state.bossMechanic;
  if (
    !mechanic ||
    mechanic.kind !== "glacial_colossus" ||
    mechanic.glacialFreezePending === 1 ||
    args.state.playerHp <= 0 ||
    args.state.enemyHp <= 0
  ) {
    return { state: args.state, playerNextTick: args.playerNextTick };
  }
  const hpDamage = args.state.log.slice(args.logStart).reduce(
    (sum, entry) =>
      entry.kind === "enemy_attack"
        ? sum + Math.max(0, entry.enemyHpDamage ?? 0)
        : sum,
    0,
  );
  const auraResolution = resolveGlacialChillGain({
    current: mechanic.glacialChillStacks,
    gain: 1,
    freezePending: mechanic.glacialFreezePending,
  });
  let stateBeforeGain = args.state;
  let hitBlocked = false;
  if (!auraResolution.triggered && hpDamage > 0) {
    const signatureBlock = statusBlockOnce(args.player.equipSignatures);
    if (signatureBlock && !args.state.flags.statusBlockUsed) {
      hitBlocked = true;
      stateBeforeGain = appendGlacialLog(
        {
          ...args.state,
          flags: { ...args.state.flags, statusBlockUsed: true },
        },
        `[${signatureBlock.label}] 상태이상을 막았다.`,
        "enemy",
        args.currentTick,
      );
    } else {
      const ward = consumePurificationWard(args.state.stacks.tripleWard);
      if (ward.consumed) {
        hitBlocked = true;
        stateBeforeGain = appendGlacialLog(
          {
            ...args.state,
            stacks: {
              ...args.state.stacks,
              tripleWard: ward.state,
            },
          },
          `[${TRIPLE_WARD_LABELS.purification}] 상태이상을 막았다. (${ward.remaining}회 남음)`,
          "enemy",
          args.currentTick,
        );
      }
    }
  }
  const resolution =
    auraResolution.triggered || hpDamage <= 0 || hitBlocked
      ? auraResolution
      : resolveGlacialChillGain({
          current: mechanic.glacialChillStacks,
          gain: 2,
          freezePending: mechanic.glacialFreezePending,
        });
  const displayStacks = resolution.triggered
    ? GLACIAL_CHILL_THRESHOLD
    : resolution.stacks;
  let state: BattleState = {
    ...stateBeforeGain,
    bossMechanic: {
      ...mechanic,
      glacialChillStacks: resolution.stacks,
      glacialFreezePending: resolution.freezePending,
      glacialFreezeCount:
        mechanic.glacialFreezeCount + (resolution.triggered ? 1 : 0),
    },
  };
  state = appendGlacialLog(
    state,
    `[한기] +${resolution.appliedGain} · 현재 ${displayStacks}/${GLACIAL_CHILL_THRESHOLD}`,
    "enemy",
    args.currentTick,
  );
  if (resolution.triggered) {
    state = appendGlacialLog(
      state,
      `[한기 ${GLACIAL_CHILL_THRESHOLD}/${GLACIAL_CHILL_THRESHOLD}] 한기가 한계에 도달해 다음 행동이 봉쇄된다.`,
      "enemy",
      args.currentTick,
    );
    state = appendGlacialLog(
      state,
      "[빙결] 다음 행동이 봉쇄된다.",
      "enemy",
      args.currentTick,
    );
    return { state, playerNextTick: args.playerNextTick };
  }
  state = appendGlacialThresholdWarning(
    state,
    mechanic.glacialChillStacks,
    displayStacks,
    args.currentTick,
  );

  return {
    state,
    playerNextTick: rescaleReservedPlayerTick({
      currentTick: args.currentTick,
      playerNextTick: args.playerNextTick,
      previousStacks: args.previousStacks,
      nextStacks: resolution.stacks,
    }),
  };
}

function applyGlacialFieldChill(args: {
  state: BattleState;
  currentTick: number;
  playerNextTick: number;
}): { state: BattleState; playerNextTick: number; applied: boolean } {
  const mechanic = args.state.bossMechanic;
  if (
    !mechanic ||
    mechanic.kind !== "glacial_colossus" ||
    mechanic.glacialFreezePending === 1
  ) {
    return {
      state: args.state,
      playerNextTick: args.playerNextTick,
      applied: false,
    };
  }

  const resolution = resolveGlacialChillGain({
    current: mechanic.glacialChillStacks,
    gain: 1,
    freezePending: mechanic.glacialFreezePending,
  });
  const displayStacks = resolution.triggered
    ? GLACIAL_CHILL_THRESHOLD
    : resolution.stacks;
  let state = appendGlacialLog(
    {
      ...args.state,
      bossMechanic: {
        ...mechanic,
        glacialChillStacks: resolution.stacks,
        glacialFreezePending: resolution.freezePending,
        glacialFreezeCount:
          mechanic.glacialFreezeCount + (resolution.triggered ? 1 : 0),
      },
    },
    `[혹한의 전장] 한기 +1 · 현재 ${displayStacks}/${GLACIAL_CHILL_THRESHOLD}`,
    "enemy",
    args.currentTick,
  );
  if (resolution.triggered) {
    state = appendGlacialLog(
      state,
      `[한기 ${GLACIAL_CHILL_THRESHOLD}/${GLACIAL_CHILL_THRESHOLD}] 한기가 한계에 도달해 다음 행동이 봉쇄된다.`,
      "enemy",
      args.currentTick,
    );
    state = appendGlacialLog(
      state,
      "[빙결] 다음 행동이 봉쇄된다.",
      "enemy",
      args.currentTick,
    );
    return { state, playerNextTick: args.playerNextTick, applied: true };
  }

  state = appendGlacialThresholdWarning(
    state,
    mechanic.glacialChillStacks,
    displayStacks,
    args.currentTick,
  );

  return {
    state,
    playerNextTick: rescaleReservedPlayerTick({
      currentTick: args.currentTick,
      playerNextTick: args.playerNextTick,
      previousStacks: mechanic.glacialChillStacks,
      nextStacks: resolution.stacks,
    }),
    applied: true,
  };
}

function consumeGlacialFrozenPlayerAction(
  state: BattleState,
  tick: number,
): BattleState {
  const mechanic = state.bossMechanic;
  if (
    !mechanic ||
    mechanic.kind !== "glacial_colossus" ||
    mechanic.glacialFreezePending !== 1
  ) {
    return state;
  }
  return appendGlacialLog(
    {
      ...state,
      phase: "player",
      bossMechanic: {
        ...mechanic,
        glacialChillStacks: 0,
        glacialFreezePending: 0,
        glacialSkippedActionCount: mechanic.glacialSkippedActionCount + 1,
      },
    },
    "[빙결] 몸이 얼어붙어 행동할 수 없다.",
    "player",
    tick,
  );
}

function appendToxicBloodLog(
  state: BattleState,
  text: string,
  turn: "player" | "enemy",
  tick: number,
): BattleState {
  return {
    ...state,
    log: appendLog(state.log, {
      kind: "info",
      effect: "status_damage",
      text,
      turn,
      t: tick,
    }),
  };
}

function applyToxicBloodStatusDamage(args: {
  state: BattleState;
  player: PlayerCombat;
  rawDamage: number;
  label: string;
  turn: "player" | "enemy";
  tick: number;
}): BattleState {
  const mechanic = args.state.bossMechanic;
  if (!mechanic || mechanic.kind !== "toxic_blood_lord") return args.state;

  const barrier = resolveMagicBarrierDamage({
    rawDamage: args.rawDamage,
    durability: args.state.playerMagicBarrier ?? 0,
    absorbPct: args.player.magicBarrierAbsorbPct,
    efficiencyPct: args.player.magicBarrierEfficiencyPct,
    eligible: true,
    mitigateBody: (bodyRawDamage) =>
      statusDamageAfterReduction(
        bodyRawDamage,
        args.player.statusDamageReductionPct,
      ),
  });
  const hpBefore = args.state.playerHp;
  let next: BattleState = {
    ...args.state,
    playerMagicBarrier: barrier.durabilityLeft,
  };
  const damageLogIndex = next.log.length;
  next = appendToxicBloodLog(
    next,
    `${args.label} ${barrier.hpBoundDamage}`,
    args.turn,
    args.tick,
  );
  for (const entry of magicBarrierCombatLogEntries(barrier)) {
    next = {
      ...next,
      log: appendLog(next.log, {
        ...entry,
        turn: args.turn,
        t: args.tick,
      }),
    };
  }

  const survival = applyBerserkerHostileDamage(
    next,
    args.player,
    hpBefore - barrier.hpBoundDamage,
    args.turn,
  );
  next = survival.state;
  if (survival.triggered && next.berserker) {
    next = {
      ...next,
      berserker: finishBerserkerCurrentActionGuard(next.berserker),
    };
  }
  const enduranceFires =
    next.playerHp <= 0 &&
    !!args.player.enduranceActive &&
    !next.flags.enduranceTriggered;
  if (enduranceFires) {
    next = {
      ...next,
      playerHp: 1,
      flags: { ...next.flags, enduranceTriggered: true },
      log: appendLog(next.log, {
        kind: "info",
        text: `[불굴] 마지막 한 숨 — HP 1 로 버텼다!`,
        turn: args.turn,
        t: args.tick,
      }),
    };
  }

  const actualDamage = Math.max(0, hpBefore - Math.max(0, next.playerHp));
  const damageLog = next.log[damageLogIndex];
  if (damageLog?.text === `${args.label} ${barrier.hpBoundDamage}`) {
    next = {
      ...next,
      log: [
        ...next.log.slice(0, damageLogIndex),
        { ...damageLog, text: `${args.label} ${actualDamage}` },
        ...next.log.slice(damageLogIndex + 1),
      ],
    };
  }
  if (next.stacks.tier7?.ruinCharge && actualDamage > 0) {
    next = {
      ...next,
      stacks: {
        ...next.stacks,
        tier7: {
          ...next.stacks.tier7,
          ruinCharge: {
            ...recordChargeHpLoss(
              next.stacks.tier7.ruinCharge,
              actualDamage,
            ),
            deathBypassTriggered:
              next.stacks.tier7.ruinCharge.deathBypassTriggered ||
              survival.triggered,
          },
        },
      },
    };
  }
  const currentMechanic = next.bossMechanic;
  if (currentMechanic?.kind === "toxic_blood_lord") {
    next = {
      ...next,
      bossMechanic: {
        ...currentMechanic,
        toxicDamageTaken: currentMechanic.toxicDamageTaken + actualDamage,
      },
    };
  }
  if (next.playerHp > 0) return next;
  return {
    ...next,
    playerHp: 0,
    log: appendLog(next.log, {
      kind: "info",
      text: `플레이어가 쓰러졌다.`,
      turn: args.turn,
      t: args.tick,
    }),
    phase: "ended",
    outcome: "lose",
  };
}

function settleToxicBloodAfterEnemyAction(args: {
  state: BattleState;
  player: PlayerCombat;
  logStart: number;
  tick: number;
}): BattleState {
  const mechanic = args.state.bossMechanic;
  if (!mechanic || mechanic.kind !== "toxic_blood_lord") return args.state;
  if (args.state.playerHp <= 0 || args.state.enemyHp <= 0) return args.state;

  const attacks = args.state.log.slice(args.logStart);
  const hpDamage = attacks.reduce(
    (sum, entry) =>
      entry.kind === "enemy_attack"
        ? sum + Math.max(0, entry.enemyHpDamage ?? 0)
        : sum,
    0,
  );
  if (hpDamage <= 0) return args.state;

  const gain = attacks.some(
    (entry) =>
      entry.kind === "enemy_attack" && entry.heavyBlowFired === true,
  )
    ? 2
    : 1;
  const resolution = resolveToxicBloodGain({
    current: mechanic.toxicBloodStacks,
    gain,
  });
  const displayStacks = resolution.exploded
    ? TOXIC_BLOOD_MAX_STACKS
    : resolution.stacks;
  let state: BattleState = {
    ...args.state,
    bossMechanic: {
      ...mechanic,
      toxicBloodStacks: resolution.stacks,
      toxicExplosionCount:
        mechanic.toxicExplosionCount + (resolution.exploded ? 1 : 0),
    },
  };
  state = appendToxicBloodLog(
    state,
    `[독혈] +${gain} · 현재 ${displayStacks}/${TOXIC_BLOOD_MAX_STACKS}`,
    "enemy",
    args.tick,
  );
  if (resolution.exploded) {
    state = appendToxicBloodLog(
      state,
      `[독혈 ${TOXIC_BLOOD_MAX_STACKS}/${TOXIC_BLOOD_MAX_STACKS}] 축적된 독혈이 한꺼번에 파열된다.`,
      "enemy",
      args.tick,
    );
  } else if (mechanic.toxicBloodStacks < 7 && displayStacks >= 7) {
    state = appendToxicBloodLog(
      state,
      `[독혈 ${displayStacks}/${TOXIC_BLOOD_MAX_STACKS}] 축적된 독혈이 불길하게 맥동한다. 폭발이 임박했다.`,
      "enemy",
      args.tick,
    );
  } else if (mechanic.toxicBloodStacks < 4 && displayStacks >= 4) {
    state = appendToxicBloodLog(
      state,
      `[독혈 ${displayStacks}/${TOXIC_BLOOD_MAX_STACKS}] 검붉은 독혈이 상처 깊숙이 스며든다.`,
      "enemy",
      args.tick,
    );
  }
  if (!resolution.exploded) return state;

  state = applyToxicBloodStatusDamage({
    state,
    player: args.player,
    rawDamage: toxicBloodRawExplosionDamage(state.playerMaxHp),
    label: "[독혈 폭발] 최대 체력 비례 피해",
    turn: "enemy",
    tick: args.tick,
  });
  if (state.playerHp <= 0) return state;
  const survivedMechanic = state.bossMechanic;
  if (survivedMechanic?.kind !== "toxic_blood_lord") return state;
  state = {
    ...state,
    bossMechanic: {
      ...survivedMechanic,
      toxicRecoveryLockActions: TOXIC_RECOVERY_LOCK_ACTIONS,
    },
  };
  return appendToxicBloodLog(
    state,
    `[회복 억제] 받는 회복량 -50% · ${TOXIC_RECOVERY_LOCK_ACTIONS}회 행동`,
    "enemy",
    args.tick,
  );
}

function tickToxicBloodOnPlayerAction(
  state: BattleState,
  player: PlayerCombat,
  tick: number,
): BattleState {
  const mechanic = state.bossMechanic;
  if (!mechanic || mechanic.kind !== "toxic_blood_lord") return state;
  const rawDamage = toxicBloodRawDotDamage(
    state.playerMaxHp,
    mechanic.toxicBloodStacks,
  );
  if (rawDamage <= 0) return state;
  return applyToxicBloodStatusDamage({
    state,
    player,
    rawDamage,
    label: `[독혈 ${mechanic.toxicBloodStacks}중첩] 지속 피해`,
    turn: "player",
    tick,
  });
}

function consumeToxicRecoveryAfterPlayerAction(
  state: BattleState,
  actionsAtStart: number,
  tick: number,
): BattleState {
  const mechanic = state.bossMechanic;
  if (
    !mechanic ||
    mechanic.kind !== "toxic_blood_lord" ||
    actionsAtStart <= 0
  ) {
    return state;
  }
  const nextActions = consumeToxicRecoveryAction(actionsAtStart);
  let next: BattleState = {
    ...state,
    bossMechanic: {
      ...mechanic,
      toxicRecoveryLockActions: nextActions,
    },
  };
  if (nextActions === 0) {
    next = appendToxicBloodLog(
      next,
      "[회복 억제] 해제",
      "player",
      tick,
    );
  }
  return next;
}

function playerWithToxicRecoveryMultiplier(
  state: BattleState,
  player: PlayerCombat,
): PlayerCombat {
  const mechanic = state.bossMechanic;
  if (!mechanic || mechanic.kind !== "toxic_blood_lord") return player;
  const toxicMultiplier = toxicBloodRecoveryMultiplier({
    stacks: mechanic.toxicBloodStacks,
    recoveryLockActions: mechanic.toxicRecoveryLockActions,
  });
  if (toxicMultiplier === 1) return player;
  return {
    ...player,
    receivedHealMult: (player.receivedHealMult ?? 1) * toxicMultiplier,
  };
}

// 플레이어 행동 진입 시 — 버프/디버프 tick + 추가타 큐 반영. DoT 는 별도 helper 에서 먼저 처리한다.
function tickPlayerBundleEntry(state: BattleState): BattleState {
  return {
    ...state,
    buffs:
      state.turn.completedPlayerTurns > 0
        ? decrementTimedBuffs(state.buffs)
        : state.buffs,
    v2SelfBuffs: tickV2BuffMap(state.v2SelfBuffs),
    v2SelfDebuffs: tickV2BuffMap(state.v2SelfDebuffs),
    playerAttacksLeft: state.playerAttacksLeft + state.turn.queuedExtraAttacks,
    turn: { ...state.turn, queuedExtraAttacks: 0 },
  };
}

// 적 행동 진입 시 — 적 버프/디버프 tick. DoT 는 별도 helper 에서 먼저 처리한다.
function tickEnemyBundleEntry(state: BattleState): BattleState {
  return {
    ...state,
    enemyV2SelfBuffs: tickV2BuffMap(state.enemyV2SelfBuffs),
    enemyV2Debuffs: tickV2BuffMap(state.enemyV2Debuffs),
  };
}

function tickEnemyTargetDebuffs(state: BattleState): BattleState {
  const s = state.stacks;
  return {
    ...state,
    stacks: {
      ...s,
      enemyVulnTurns: Math.max(0, s.enemyVulnTurns - 1),
      enemyMagicVulnTurns: Math.max(
        0,
        (s.enemyMagicVulnTurns ?? 0) - 1,
      ),
      enemyEvasionDownTurns: Math.max(0, s.enemyEvasionDownTurns - 1),
      enemyAccuracyDownTurns: Math.max(0, s.enemyAccuracyDownTurns - 1),
      enemyHealReduceTurns: Math.max(0, s.enemyHealReduceTurns - 1),
      enemyDamageDownTurns: Math.max(0, s.enemyDamageDownTurns - 1),
      enemySkillProcDownTurns: Math.max(0, s.enemySkillProcDownTurns - 1),
      enemyDotVulnTurns: Math.max(0, s.enemyDotVulnTurns - 1),
    },
  };
}

// 플레이어 행동 시작 — 플레이어에게 걸린 DoT 가 DEF/보호막을 무시하고 먼저 틱한다.
// 로그는 플레이어 행동 묶음(tick)에 붙인다.
export function tickPlayerDotsOnAction(
  state: BattleState,
  player: PlayerCombat,
  playerName: string,
): BattleState {
  const pTick = tickV2Dots(state.playerV2Dots, state.playerMaxHp);
  const barrier = resolveMagicBarrierDamage({
    rawDamage: pTick.totalDmg,
    durability: state.playerMagicBarrier ?? 0,
    absorbPct: player.magicBarrierAbsorbPct,
    efficiencyPct: player.magicBarrierEfficiencyPct,
    eligible: true,
    mitigateBody: (bodyRawDamage) =>
      statusDamageAfterReduction(
        bodyRawDamage,
        player.statusDamageReductionPct,
      ),
  });
  const damage = barrier.hpBoundDamage;
  if (damage <= 0 && barrier.absorbedDamage <= 0) {
    return { ...state, playerV2Dots: pTick.nextDots };
  }
  let dotLog = distributeV2DotTicks(pTick.ticks, damage).reduce(
    (log, tick) =>
      appendLog(log, {
        kind: "info",
        effect: "status_damage",
        text: `${playerName}이(가) ${v2DotLogCause(tick)} ${tick.damage} 피해를 입었다.`,
        turn: "player",
      }),
    state.log,
  );
  for (const entry of magicBarrierCombatLogEntries(barrier)) {
    dotLog = appendLog(dotLog, { ...entry, turn: "player" });
  }
  let next: BattleState = {
    ...state,
    playerMagicBarrier: barrier.durabilityLeft,
    playerV2Dots: pTick.nextDots,
    log: dotLog,
  };
  const survival = applyBerserkerHostileDamage(
    next,
    player,
    state.playerHp - damage,
    "player",
  );
  next = survival.state;
  if (survival.triggered && next.berserker) {
    next = {
      ...next,
      berserker: finishBerserkerCurrentActionGuard(next.berserker),
    };
  }
  const enduranceFires =
    next.playerHp <= 0 &&
    !!player.enduranceActive &&
    !next.flags.enduranceTriggered;
  if (enduranceFires) {
    next = {
      ...next,
      playerHp: 1,
      flags: { ...next.flags, enduranceTriggered: true },
      log: appendLog(next.log, {
        kind: "info",
        text: `[불굴] 마지막 한 숨 — HP 1 로 버텼다!`,
        turn: "player",
      }),
    };
  }
  if (next.stacks.tier7?.ruinCharge) {
    next = {
      ...next,
      stacks: {
        ...next.stacks,
        tier7: {
          ...next.stacks.tier7,
          ruinCharge: {
            ...recordChargeHpLoss(
              next.stacks.tier7.ruinCharge,
              Math.min(state.playerHp, damage),
            ),
            deathBypassTriggered:
              next.stacks.tier7.ruinCharge.deathBypassTriggered ||
              survival.triggered,
          },
        },
      },
    };
  }
  if (next.playerHp > 0) return next;
  return {
    ...next,
    log: appendLog(next.log, {
      kind: "info",
      text: `플레이어가 쓰러졌다.`,
      turn: "player",
    }),
    phase: "ended",
    outcome: "lose",
  };
}

// 적 행동 시작 — 적에게 걸린 DoT 가 먼저 틱한다. 로그는 적 행동 묶음(tick)에 붙인다.
function tickEnemyDotsOnAction(
  state: BattleState,
  player: PlayerCombat,
): BattleState {
  const bleedBeforeTick = state.enemyV2Dots.find(
    (dot) => dot.tag === "bleed" && dot.turns > 0,
  );
  const eTick = tickV2Dots(
    state.enemyV2Dots,
    state.enemy.hp,
    state.maxHpDamageMult ??
      (state.isBoss ? BOSS_MAX_HP_DAMAGE_MULT : 1),
  );
  const damageBeforeReduction =
    eTick.totalDmg > 0 && state.stacks.enemyDotVulnTurns > 0
      ? Math.floor(
          eTick.totalDmg * (1 + state.stacks.enemyDotVulnPct / 100),
        )
      : eTick.totalDmg;
  const damage = statusDamageAfterReduction(
    damageBeforeReduction,
    state.enemy.statusDamageReductionPct,
  );
  if (damage <= 0) return { ...state, enemyV2Dots: eTick.nextDots };
  const actualEnemyDotDamage = Math.min(state.enemyHp, damage);
  const actualBleedDamage =
    distributeV2DotTicks(eTick.ticks, actualEnemyDotDamage).find(
      (tick) => tick.tag === "bleed",
    )?.damage ?? 0;
  let dotLog = distributeV2DotTicks(eTick.ticks, damage).reduce(
    (log, tick) =>
      appendLog(log, {
        kind: "info",
        effect: "status_damage",
        text: `${state.enemy.name}이(가) ${v2DotLogCause(tick)} ${tick.damage} 피해를 입었다.`,
        turn: "enemy",
      }),
    state.log,
  );
  const bleedTickHealPct =
    bleedBeforeTick && bleedBeforeTick.stacks >= BLEED_MAX_STACKS
      ? state.v2Skills.equipped.reduce((sum, skillId) => {
          const mechanic = V2_SKILLS[skillId]?.passive
            ? V2_SKILLS[skillId]?.bleedHunt
            : undefined;
          return sum + Math.max(0, mechanic?.bleedTickHealMaxHpPct ?? 0);
        }, 0)
      : 0;
  const bleedTickHealRaw =
    actualBleedDamage > 0 && bleedTickHealPct > 0
      ? Math.floor((state.playerMaxHp * bleedTickHealPct) / 100)
      : 0;
  const bleedTickHeal = healingAfterReceivedMultiplier(
    bleedTickHealRaw,
    player.receivedHealMult,
  );
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
  const damagedState = recordEnemyDamage(state, damage);
  let enemyHp = Math.max(0, state.enemyHp - damage);
  let bossMechanic = state.bossMechanic;
  if (bossMechanic?.kind === "invincible_fortress") {
    const settled = settleInvincibleFortressDamage({
      state: bossMechanic,
      currentHp: state.enemyHp,
      incomingDamage: damage,
      maxHp: state.bossSharedMaxHp ?? state.enemy.hp,
    });
    enemyHp = settled.bodyHp;
    bossMechanic = settled.state;
    dotLog = appendInvincibleFortressDamageEvents(
      dotLog,
      settled.barrierEvents,
      "enemy",
    );
  } else if (bossMechanic?.kind === "immortal_berserker") {
    const settled = settleImmortalBerserkerDamage({
      state: bossMechanic,
      currentHp: state.enemyHp,
      incomingDamage: damage,
      maxHp: state.bossSharedMaxHp ?? state.enemy.hp,
    });
    enemyHp = settled.hp;
    bossMechanic = {
      ...settled.state,
      immortalBodyDamage:
        bossMechanic.immortalBodyDamage + settled.appliedDamage,
      immortalHealing: bossMechanic.immortalHealing,
      immortalRevivalCount:
        bossMechanic.immortalRevivalCount + (settled.revived ? 1 : 0),
    };
    if (settled.revived) {
      const ordinal = settled.state.lifeIndex === 1 ? "첫 번째" : "두 번째";
      const multipliers = immortalBerserkerMultipliers(settled.state.lifeIndex);
      dotLog = appendLog(dotLog, {
        kind: "info",
        effect: "status",
        text: `${ordinal} 부활 · 생명 ${settled.state.lifeIndex + 1}/3`,
        turn: "enemy",
      });
      dotLog = appendLog(dotLog, {
        kind: "info",
        effect: "status",
        text: `광폭 · 공격력 +${Math.round((multipliers.atkMult - 1) * 100)}% · 행동 속도 +${Math.round((multipliers.spdMult - 1) * 100)}%`,
        turn: "enemy",
      });
    }
  }
  const next = applyPhaseTriggerIfAny({
    ...damagedState,
    playerHp: nextPlayerHp,
    enemyV2Dots: eTick.nextDots,
    enemyHp,
    bossMechanic,
    log: dotLog,
  });
  if (next.enemyHp > 0) return next;
  return {
    ...next,
    log: appendLog(next.log, {
      kind: "info",
      text: `${next.enemy.name}을(를) 쓰러뜨렸다!`,
      turn: "enemy",
    }),
    phase: "ended",
    outcome: "win",
  };
}

function forceAtbLoss(
  state: BattleState,
  turns: number,
  consumed: Partial<Record<PotionId, number>>,
): BattleResolution {
  return {
    outcome: "lose",
    endReason: "timeout",
    finalState: {
      ...state,
      log: appendLog(
        appendLog(state.log, {
          kind: "info",
          text: `${ATB_TICK_CAP}틱 경과 — 적을 쓰러뜨리지 못했다.`,
        }),
        hpBarEntry(state),
      ),
      phase: "ended",
      outcome: "lose",
    },
    potionsConsumed: consumed,
    turns,
    ...(state.enemyDamageDealtTotal == null
      ? {}
      : { damageDealtTotal: state.enemyDamageDealtTotal }),
  };
}

function continueDamageMeterAfterEnemyDefeat(
  state: BattleState,
  ctx: ResolveContext,
  turn: "player" | "enemy",
  tick: number,
): BattleState {
  if (
    !ctx.damageMeter?.continueAfterDefeat ||
    state.outcome !== "win" ||
    state.enemyHp > 0 ||
    state.playerHp <= 0
  ) {
    return state;
  }
  return {
    ...state,
    enemyHp: Math.max(1, Math.floor(ctx.damageMeter.refillHp)),
    phase: turn,
    outcome: null,
    log: appendLog(state.log, {
      kind: "info",
      text: "피해 계측 구간 돌파 — 전투를 계속합니다.",
      turn,
      t: tick,
    }),
  };
}

export function resolveBattleAtb(
  player: PlayerCombat,
  enemy: Monster,
  playerName: string,
  ctx: ResolveContext,
): BattleResolution {
  const potions: Partial<Record<PotionId, number>> = { ...ctx.potions };
  const consumed: Partial<Record<PotionId, number>> = {};
  // ATB: SPD-derived extra-attack disabled; speed advantage is expressed through action frequency instead.
  // Phase-1 limitation: spec/trait extraAttack sources that are already merged into this field are disabled too.
  const atbPlayer: PlayerCombat = { ...player, extraAttackChancePct: 0 };
  // 몬스터 SPD 깊이 보정 — 깊이는 전투 내내 불변이라 1회 계산. 비-던전 전투(depth 미지정)=0.
  const depthCorr = depthSpdCorrection(ctx.depth ?? 1);
  let state = initialBattleState(
    atbPlayer,
    enemy,
    playerName,
    ctx.v2Skills,
    ctx.initialEnemyHp,
  );
  state = { ...state, usesAtb: true };
  if (ctx.bossMechanic?.kind === "tracking_weapon") {
    state = {
      ...state,
      bossMechanic: {
        kind: "tracking_weapon",
        trackingThreat: accumulateTrackingThreat({
          current: 0,
          gain: ctx.bossMechanic.initialThreat,
        }),
        trackingCounterCount: 0,
        trackingCounterDamage: 0,
      },
    };
  } else if (ctx.bossMechanic?.kind === "toxic_blood_lord") {
    state = {
      ...state,
      bossMechanic: {
        kind: "toxic_blood_lord",
        toxicBloodStacks: 0,
        toxicRecoveryLockActions: 0,
        toxicExplosionCount: 0,
        toxicDamageTaken: 0,
      },
    };
  } else if (ctx.bossMechanic?.kind === "glacial_colossus") {
    state = {
      ...state,
      bossMechanic: {
        kind: "glacial_colossus",
        glacialChillStacks: 0,
        glacialFreezePending: 0,
        glacialFreezeCount: 0,
        glacialSkippedActionCount: 0,
      },
    };
  } else if (ctx.bossMechanic?.kind === "invincible_fortress") {
    const sharedMaxHp = Math.max(1, Math.floor(ctx.bossMechanic.sharedMaxHp));
    state = {
      ...state,
      bossSharedMaxHp: sharedMaxHp,
      bossMechanic: normalizeInvincibleFortressState(
        ctx.bossMechanic.initialState,
        sharedMaxHp,
        state.enemyHp,
      ),
    };
    state = applyInvincibleFortressTierToEnemy(state, enemy);
  } else if (ctx.bossMechanic?.kind === "skyward_crystal_eye") {
    const sharedMaxHp = Math.max(1, Math.floor(ctx.bossMechanic.sharedMaxHp));
    state = {
      ...state,
      bossSharedMaxHp: sharedMaxHp,
      bossMechanic: normalizeSkywardCrystalEyeState(
        ctx.bossMechanic.initialState,
      ),
    };
  } else if (ctx.bossMechanic?.kind === "immortal_berserker") {
    const sharedMaxHp = Math.max(1, Math.floor(ctx.bossMechanic.sharedMaxHp));
    const normalized = normalizeImmortalBerserkerState(
      ctx.bossMechanic.initialState,
      sharedMaxHp,
      state.enemyHp,
    );
    state = {
      ...state,
      bossSharedMaxHp: sharedMaxHp,
      bossMechanic: {
        ...normalized,
        immortalBodyDamage: 0,
        immortalHealing: 0,
        immortalRevivalCount: 0,
      },
    };
    state = applyImmortalBerserkerLifeToEnemy(state, enemy);
  }
  if (ctx.isBoss) state = { ...state, isBoss: true };
  if (ctx.maxHpDamageMult != null) {
    state = {
      ...state,
      maxHpDamageMult: Math.max(0, ctx.maxHpDamageMult),
    };
  }
  if (ctx.damageMeter) {
    state = { ...state, enemyDamageDealtTotal: 0 };
  }
  const openingExtra: BattleLogEntry[] = ctx.openingNote
    ? [{ kind: "info", text: ctx.openingNote, turn: "player" }]
    : [];
  if (
    state.bossMechanic?.kind === "invincible_fortress" &&
    state.bossMechanic.activeBarrierIndex !== null
  ) {
    openingExtra.push({
      kind: "info",
      effect: "status",
      text: `방벽 시험 시작 — ${state.bossMechanic.activeBarrierIndex + 1}/4`,
      turn: "player",
      t: 0,
    });
  }
  if (state.bossMechanic?.kind === "skyward_crystal_eye") {
    openingExtra.push({
      kind: "info",
      effect: "status",
      text: `천공 포격 조준 시작 · ${state.bossMechanic.aimTicksRemaining}틱`,
      turn: "enemy",
      t: 0,
    });
  }
  // ATB 는 고정 "턴"이 없다 — turn_marker 미발행. BattleLogList 가 행동 주체(액터 묶음)
  // 단위로 박스를 끊어(PvP ATB 와 동일) 타임라인이 자연히 읽힌다: 빠른 빌드는 적 행동 사이에
  // 플레이어 공격이 더 자주 나타난다. (레거시는 turn_marker 유지 → 턴 박스.)
  state = {
    ...state,
    phase: "player",
    log: [
      ...state.log.map((entry) => ({ ...entry, turn: "player" as const })),
      ...openingExtra,
    ],
    playerAttacksLeft: rollPlayerAttackCountWithBleed(state, atbPlayer),
    turn: { ...state.turn, firstAttackPending: true },
  };

  let playerNextTick = 0;
  let enemyNextTick =
    state.bossMechanic?.kind === "invincible_fortress" &&
    state.bossMechanic.activeBarrierIndex !== null
      ? state.bossMechanic.barrierTicksRemaining
      : actionInterval(effectiveEnemyTimelineSpd(state, depthCorr));
  let fortressClockTick = 0;
  let skywardClockTick = 0;
  let skywardArtilleryNextTick =
    state.bossMechanic?.kind === "skyward_crystal_eye"
      ? state.bossMechanic.aimTicksRemaining
      : Number.POSITIVE_INFINITY;
  let glacialFieldNextTick =
    state.bossMechanic?.kind === "glacial_colossus"
      ? GLACIAL_FIELD_INTERVAL_TICKS
      : Number.POSITIVE_INFINITY;
  let actions = 0;
  let turns = 0;
  let lastTick = 0; // 최종 hp_bar 스탬프용(루프 밖)
  while (state.phase !== "ended") {
    const nextTick = Math.min(
      playerNextTick,
      enemyNextTick,
      skywardArtilleryNextTick,
      glacialFieldNextTick,
    );
    lastTick = nextTick;
    if (nextTick > ATB_TICK_CAP) {
      if (state.bossMechanic?.kind === "skyward_crystal_eye") {
        state = {
          ...state,
          bossMechanic: advanceSkywardCrystalEyeTimers(
            state.bossMechanic,
            Math.max(0, ATB_TICK_CAP - skywardClockTick),
          ),
        };
        skywardClockTick = ATB_TICK_CAP;
      }
      return forceAtbLoss(state, turns, consumed);
    }
    if (
      nextTick > ATB_TICK_CAP ||
      (!ctx.damageMeter && actions >= ATB_ACTION_GUARD) ||
      turns >= (ctx.maxTurns ?? Number.POSITIVE_INFINITY)
    ) {
      return forceAtbLoss(state, turns, consumed);
    }

    if (state.bossMechanic?.kind === "skyward_crystal_eye") {
      state = {
        ...state,
        bossMechanic: advanceSkywardCrystalEyeTimers(
          state.bossMechanic,
          Math.max(0, nextTick - skywardClockTick),
        ),
      };
      skywardClockTick = nextTick;
    }

    if (
      state.bossMechanic?.kind === "invincible_fortress" &&
      state.bossMechanic.activeBarrierIndex !== null
    ) {
      const barrierDamage = state.bossMechanic.barrierDamage;
      const advanced = advanceInvincibleFortressBarrier({
        state: state.bossMechanic,
        elapsedTicks: Math.max(0, nextTick - fortressClockTick),
        maxHp: state.bossSharedMaxHp ?? state.enemy.hp,
      });
      state = { ...state, bossMechanic: advanced.state };
      fortressClockTick = nextTick;
      if (advanced.completedTier !== null) {
        state = applyInvincibleFortressTierToEnemy(state, enemy);
        state = {
          ...state,
          log: appendLog(
            appendLog(state.log, {
              kind: "info",
              effect: "status",
              text: `방벽 시험 종료 — 누적 ${barrierDamage.toLocaleString("ko-KR")}`,
              turn: "enemy",
              t: nextTick,
            }),
            {
              kind: "info",
              effect: "status",
              text: `광폭 ${advanced.completedTier}단계 적용`,
              turn: "enemy",
              t: nextTick,
            },
          ),
        };
        enemyNextTick =
          nextTick + actionInterval(effectiveEnemyTimelineSpd(state, depthCorr));
        state = {
          ...state,
          log: appendLog(state.log, hpBarEntry(state, nextTick)),
        };
        continue;
      }
    }

    const glacialFieldFiresNow =
      glacialFieldNextTick <= playerNextTick &&
      glacialFieldNextTick <= enemyNextTick &&
      glacialFieldNextTick <= skywardArtilleryNextTick;
    if (glacialFieldFiresNow) {
      glacialFieldNextTick += GLACIAL_FIELD_INTERVAL_TICKS;
      const field = applyGlacialFieldChill({
        state,
        currentTick: nextTick,
        playerNextTick,
      });
      state = field.state;
      playerNextTick = field.playerNextTick;
      if (field.applied) {
        state = {
          ...state,
          log: appendLog(state.log, hpBarEntry(state, nextTick)),
        };
      }
      continue;
    }

    const playerActsNow =
      playerNextTick <= enemyNextTick &&
      playerNextTick <= skywardArtilleryNextTick;
    const artilleryFiresNow =
      !playerActsNow && skywardArtilleryNextTick <= enemyNextTick;
    if (artilleryFiresNow) {
      actions += 1;
      state = fireSkywardCrystalEyeAtbArtillery({
        state,
        player: atbPlayer,
        playerName,
        tick: nextTick,
      });
      skywardArtilleryNextTick =
        state.bossMechanic?.kind === "skyward_crystal_eye"
          ? nextTick + state.bossMechanic.aimTicksRemaining
          : Number.POSITIVE_INFINITY;
      if (state.phase !== "ended") {
        state = {
          ...state,
          log: appendLog(state.log, hpBarEntry(state, nextTick)),
        };
      }
      continue;
    }
    const actor = playerActsNow
      ? "player"
      : nextActor1v1(playerNextTick, enemyNextTick);
    actions += 1;
    if (actor === "player") {
      if (
        state.bossMechanic?.kind === "glacial_colossus" &&
        state.bossMechanic.glacialFreezePending === 1
      ) {
        state = consumeGlacialFrozenPlayerAction(state, nextTick);
        playerNextTick =
          nextTick + actionInterval(effectivePlayerSpd(atbPlayer, state));
        state = {
          ...state,
          log: appendLog(state.log, hpBarEntry(state, nextTick)),
        };
        continue;
      }
      state = {
        ...state,
        phase: "player",
        playerAttacksLeft:
          state.turn.firstAttackPending
            ? rollPlayerAttackCountWithBleed(state, atbPlayer)
            : state.playerAttacksLeft,
      };
      const playerBundleStart = state.log.length;
      const playerEnemyHpBefore = state.enemyHp;
      const fortressCompletedBarriersBeforePlayerAction =
        state.bossMechanic?.kind === "invincible_fortress"
          ? state.bossMechanic.completedBarrierCount
          : null;
      const toxicRecoveryActionsAtStart =
        state.bossMechanic?.kind === "toxic_blood_lord"
          ? state.bossMechanic.toxicRecoveryLockActions
          : 0;
      state = tickToxicBloodOnPlayerAction(state, atbPlayer, nextTick);
      state = tagNewLogEntries(state, playerBundleStart, "player", nextTick);
      if (state.phase === "ended") {
        turns += 1;
        break;
      }
      const actionPlayer = playerWithToxicRecoveryMultiplier(state, atbPlayer);
      state = tickPlayerDotsOnAction(
        state,
        actionPlayer,
        playerName,
      );
      state = tagNewLogEntries(state, playerBundleStart, "player", nextTick);
      state = continueDamageMeterAfterEnemyDefeat(
        state,
        ctx,
        "player",
        nextTick,
      );
      if (state.phase === "ended") {
        turns += 1;
        break;
      }
      state = applyEvasionActionRecoveryPvE(state, actionPlayer, playerName);
      state = tickPlayerBundleEntry(state);
      // 번들 진입 로그가 t 없이 남으면 최종 hp_bar 만 t 를 가져 외톨이 박스가 생긴다.
      // 여기서 같은 nextTick 으로 채워 같은 윈도우에 묶음.
      state = stampTick(state, playerBundleStart, nextTick);
      // 바람(원소술사) — 시전 시 내 다음 행동 틱 가속 %. 행동 루프 밖(아래 틱 증가)에서 쓰므로 분기 밖 선언.
      let castSelfHastePct = 0;
      if (state.phase !== "ended") {
        // v2 스킬 시전(V2_ATB_SKILLS) — cast 가 발동하면 그 행동(틱)은 시전으로 소진되고 평타
        //   루프를 건너뛴다(legacy "1틱 1행동: 강타 OR 평타" 미러). buff/debuff tick 은 위
        //   tickPlayerBundleEntry 가 self 측을 이미 했으므로(enemyV2Debuffs 는 적 번들 소유)
        //   헬퍼엔 현재 맵을 그대로 넘긴다 — 헬퍼는 tick 없이 cast+적용만 한다(이중 tick 방지).
        let castFired = false;
        if (V2_ATB_SKILLS || ctx.forceAtbSkills) {
          const prevLogLen = state.log.length;
          const beforeCast = state;
          const cast = applyPlayerV2SkillCast(state, actionPlayer, {
            selfBuffs: state.v2SelfBuffs,
            selfDebuffs: state.v2SelfDebuffs,
            enemyDebuffs: state.enemyV2Debuffs,
          }, playerName);
          state = settleInvincibleFortressAfterPlayerDamage({
            before: beforeCast,
            after: cast.state,
            tick: nextTick,
          });
          state = settleSkywardCrystalEyeExposureDamage({
            before: beforeCast,
            after: state,
            tick: nextTick,
          });
          state = settleImmortalBerserkerAfterPlayerDamage({
            before: beforeCast,
            after: state,
            tick: nextTick,
          });
          state = applyInvincibleFortressTierToEnemy(state, enemy);
          state = applyImmortalBerserkerLifeToEnemy(state, enemy);
          castFired = cast.castFired;
          castSelfHastePct = cast.selfHastePct;
          if (cast.enemyDelayPct > 0) {
            // 대지 — 적의 다음 행동(enemyNextTick 에 예약됨)을 적 인터벌의 pct% 만큼 뒤로 민다.
            enemyNextTick +=
              actionInterval(effectiveEnemyTimelineSpd(state, depthCorr)) *
              (cast.enemyDelayPct / 100);
          }
          if (state.phase === "ended") {
            // 도발 직후 강제 기본 공격 또는 그 반사로 끝난 전투 상태를 보존한다.
          } else if (state.enemyHp <= 0) {
            // 시전으로 적 처치 — 플레이어 관점 승리(ATB 평타 처치 로그와 동형).
            state = {
              ...state,
              log: appendLog(state.log, {
                kind: "info",
                text: `${state.enemy.name}을(를) 쓰러뜨렸다!`,
                turn: "player",
              }),
              outcome: "win",
              phase: "ended",
            };
          } else if (castFired) {
            // 시전 = 완료한 플레이어 턴. legacy XOR 분기와 동일하게 턴 플래그 리셋 +
            //   completedPlayerTurns +1 + finishPlayerTurn(턴 종료 효과). 평타 루프는 아래에서 스킵.
            const ended: BattleState = {
              ...state,
              phase: "enemy",
              playerAttacksLeft: rollPlayerAttackCountWithBleed(state, atbPlayer),
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
            state = finishPlayerTurn(ended, actionPlayer, playerName);
            if (cast.signatureExtraActions > 0) {
              // 스킬 적중으로 발생한 보너스 행동은 같은 ATB 시점에서 즉시 평타 행동으로
              // 처리한다. 아래 공용 평타 루프를 열기 위해 castFired 를 해제한다.
              state = {
                ...state,
                phase: "player",
                playerAttacksLeft: cast.signatureExtraActions,
                turn: { ...state.turn, firstAttackPending: true },
              };
              castFired = false;
            }
          }
          // 틱 스탬프는 cast + 처치 승리 로그 + finishPlayerTurn(재생/격노 등) 로그를 모두 포함하도록
          //   이 시점에서 한 번에 — 위 분기들이 prevLogLen 이후로 append 한 엔트리가 t 누락(외톨이 박스)
          //   되지 않게 한다(Codex PR-B 리뷰). tagNewLogEntries 는 이미 찍힌 t 는 보존(멱등).
          state = tagNewLogEntries(state, prevLogLen, "player", nextTick);
        }
        if (state.phase !== "ended" && !castFired) {
          let action: PlayerAction = { kind: "attack" };
          const picked = ctx.pickAction(state);
          if (picked.kind === "use_potion") {
            const have = potions[picked.potionId] ?? 0;
            if (have > 0) {
              potions[picked.potionId] = have - 1;
              consumed[picked.potionId] =
                (consumed[picked.potionId] ?? 0) + 1;
              action = picked;
            }
          } else {
            action = picked;
          }
          while (state.phase === "player") {
            const prevLogLen = state.log.length;
            const beforeAttack = state;
            state = resolvePlayerPhase(state, actionPlayer, playerName, action);
            state = settleInvincibleFortressAfterPlayerDamage({
              before: beforeAttack,
              after: state,
              tick: nextTick,
            });
            state = settleSkywardCrystalEyeExposureDamage({
              before: beforeAttack,
              after: state,
              tick: nextTick,
            });
            state = settleImmortalBerserkerAfterPlayerDamage({
              before: beforeAttack,
              after: state,
              tick: nextTick,
            });
            state = applyInvincibleFortressTierToEnemy(state, enemy);
            state = applyImmortalBerserkerLifeToEnemy(state, enemy);
            state = tagNewLogEntries(state, prevLogLen, "player", nextTick);
            action = { kind: "attack" };
            if (state.phase === "ended") break;
          }
        }
      }
      if (
        state.bossMechanic?.kind === "invincible_fortress" &&
        state.bossMechanic.activeBarrierIndex !== null
      ) {
        fortressClockTick = nextTick;
        enemyNextTick =
          nextTick + state.bossMechanic.barrierTicksRemaining;
      } else if (
        fortressCompletedBarriersBeforePlayerAction !== null &&
        state.bossMechanic?.kind === "invincible_fortress" &&
        state.bossMechanic.completedBarrierCount >
          fortressCompletedBarriersBeforePlayerAction
      ) {
        fortressClockTick = nextTick;
        enemyNextTick =
          nextTick + actionInterval(effectiveEnemyTimelineSpd(state, depthCorr));
      }
      state = settleTrackingAfterPlayerAction({
        state,
        player: atbPlayer,
        playerName,
        enemyHpBefore: playerEnemyHpBefore,
        logStart: playerBundleStart,
        tick: nextTick,
      });
      state = settleSkywardCrystalEyeAfterPlayerAction(
        state,
        playerBundleStart,
        nextTick,
      );
      state = consumeToxicRecoveryAfterPlayerAction(
        state,
        toxicRecoveryActionsAtStart,
        nextTick,
      );
      state = continueDamageMeterAfterEnemyDefeat(
        state,
        ctx,
        "player",
        nextTick,
      );
      // 바람 — 이번 행동 후 내 다음 행동 틱을 가속(pct% 만큼 단축). 미시전이면 0 → 무변.
      const duelistHaste = consumeDuelistCritHaste(
        actionInterval(effectivePlayerSpd(atbPlayer, state)) *
          (1 - castSelfHastePct / 100),
        atbPlayer.basicCritHastePct ?? 0,
        state.duelistCritHastePending === true,
      );
      playerNextTick += duelistHaste.interval;
      state = { ...state, duelistCritHastePending: duelistHaste.pending };
      turns += 1;
    } else {
      state = {
        ...state,
        phase: "enemy",
        turn: {
          ...state.turn,
          enemyAttacksLeft: rollEnemyAttackCount(state.enemy),
        },
      };
      const enemyBundleStart = state.log.length;
      const enemyHpBeforeAction = state.enemyHp;
      const glacialStacksBeforeAction =
        state.bossMechanic?.kind === "glacial_colossus"
          ? state.bossMechanic.glacialChillStacks
          : 0;
      const enemyTargetPlayer = playerWithToxicRecoveryMultiplier(
        state,
        atbPlayer,
      );
      state = tickEnemyDotsOnAction(state, enemyTargetPlayer);
      state = applyImmortalBerserkerLifeToEnemy(state, enemy);
      state = tagNewLogEntries(state, enemyBundleStart, "enemy", nextTick);
      state = continueDamageMeterAfterEnemyDefeat(
        state,
        ctx,
        "enemy",
        nextTick,
      );
      if (state.phase === "ended") {
        state = accumulateTrackingFromEnemyAction(
          state,
          enemyHpBeforeAction,
        );
        break;
      }
      if (
        state.bossMechanic?.kind === "invincible_fortress" &&
        state.bossMechanic.activeBarrierIndex !== null
      ) {
        const fortress = state.bossMechanic;
        state = applyInvincibleFortressTierToEnemy(state, enemy);
        fortressClockTick = nextTick;
        enemyNextTick =
          nextTick + fortress.barrierTicksRemaining;
        state = {
          ...state,
          phase: "player",
          turn: {
            ...state.turn,
            enemyAttacksLeft: 0,
            enemyPhasesCompleted: state.turn.enemyPhasesCompleted + 1,
          },
          log: appendLog(state.log, hpBarEntry(state, nextTick)),
        };
        continue;
      }
      state = tickEnemyBundleEntry(state);
      // 적 번들 진입 로그도 동일 — t 미스탬프 외톨이 박스 방지(같은 nextTick 윈도우).
      state = stampTick(state, enemyBundleStart, nextTick);
      const shockEntry = enterShockAction(state.stacks.enemyShockAction);
      if (state.stacks.enemyShockAction !== shockEntry.next) {
        state = {
          ...state,
          stacks: { ...state.stacks, enemyShockAction: shockEntry.next },
        };
      }
      if (shockEntry.skip) {
        state = {
          ...state,
          phase: "player",
          turn: {
            ...state.turn,
            enemyAttacksLeft: 0,
            enemyPhasesCompleted: state.turn.enemyPhasesCompleted + 1,
          },
          log: appendLog(state.log, {
            kind: "info",
            text: `[감전] ${state.enemy.name}이(가) 움직이지 못했다.`,
            turn: "enemy",
            t: nextTick,
          }),
        };
        state = releaseSwordShadowAfterEnemyAction(state);
        if (state.enemyHp <= 0) {
          state = {
            ...state,
            enemyHp: 0,
            phase: "ended",
            outcome: "win",
            log: appendLog(state.log, {
              kind: "info",
              text: `${state.enemy.name}을(를) 쓰러뜨렸다!`,
              turn: "player",
              t: nextTick,
            }),
          };
        }
      }
      if (state.phase !== "ended" && !shockEntry.skip) {
        // 적 v2 스킬 시전(V2_ATB_SKILLS) — cast 발동이면 이 틱은 시전으로 소진, 평타 생략(player ATB
        //   cast 미러·더블어택 방지). v2Skills 미장착 몹은 헬퍼가 즉시 no-op → 기존 전투 byte-identical.
        //   버프/디버프 tick 은 위 tickEnemyBundleEntry 가 이미 했으므로 헬퍼는 tick 없이 cast+적용만.
        let enemyCastFired = false;
        if (V2_ATB_SKILLS || ctx.forceAtbSkills) {
          const prevLogLen = state.log.length;
          const cast = applyEnemyV2SkillCast(state, enemyTargetPlayer);
          state = cast.state;
          enemyCastFired = cast.castFired;
          state = tagNewLogEntries(state, prevLogLen, "enemy", nextTick);
        }
        // Phase-1 limitation: Shadow Step is still evaluated by the helper per enemy bundle, not per individual hit.
        if (enemyCastFired && state.phase !== "ended") {
          // 시전 = 이 틱의 적 행동. 평타 루프 대신 skipBasicAttack=true 로 한기 틱·페이즈 전환만
          //   (skip 분기가 자체 finishEnemyAttack → 평타 한 번도 안 굴림, 더블어택 방지).
          const prevLogLen = state.log.length;
          state = resolveEnemyPhase(
            state,
            enemyTargetPlayer,
            playerName,
            true,
            true,
          );
          state = tagNewLogEntries(state, prevLogLen, "enemy", nextTick);
        } else if (!enemyCastFired) {
          let enteringEnemyPhase = true;
          while (state.phase === "enemy") {
            const prevLogLen = state.log.length;
            state = resolveEnemyPhase(
              state,
              enemyTargetPlayer,
              playerName,
              enteringEnemyPhase,
            );
            enteringEnemyPhase = false;
            state = tagNewLogEntries(state, prevLogLen, "enemy", nextTick);
            if (state.phase === "ended") break;
            if (state.turn.enemyAttacksLeft <= 0) state = finishEnemyAttack(state);
          }
        }
      }
      state = continueDamageMeterAfterEnemyDefeat(
        state,
        ctx,
        "enemy",
        nextTick,
      );
      if (state.phase !== "ended") state = tickEnemyTargetDebuffs(state);
      const shadowReleaseHastePct =
        state.stacks.tier7?.shadowReleaseHastePct ?? 0;
      if (shadowReleaseHastePct > 0) {
        playerNextTick = Math.max(
          nextTick + 1,
          playerNextTick -
            actionInterval(effectivePlayerSpd(atbPlayer, state)) *
              (shadowReleaseHastePct / 100),
        );
        state = {
          ...state,
          stacks: {
            ...state.stacks,
            tier7: {
              ...state.stacks.tier7,
              shadowReleaseHastePct: 0,
            },
          },
        };
      }
      state = accumulateTrackingFromEnemyAction(state, enemyHpBeforeAction);
      state = settleToxicBloodAfterEnemyAction({
        state,
        player: atbPlayer,
        logStart: enemyBundleStart,
        tick: nextTick,
      });
      const glacialSettlement = settleGlacialChillAfterEnemyAction({
        state,
        player: atbPlayer,
        logStart: enemyBundleStart,
        previousStacks: glacialStacksBeforeAction,
        currentTick: nextTick,
        playerNextTick,
      });
      state = glacialSettlement.state;
      playerNextTick = glacialSettlement.playerNextTick;
      if (!shockEntry.skip) {
        state = settleImmortalBerserkerAfterEnemyAction(
          state,
          enemy,
          nextTick,
        );
      }
      enemyNextTick += actionInterval(effectiveEnemyTimelineSpd(state, depthCorr));
    }

    if (state.phase !== "ended") {
      state = {
        ...state,
        log: appendLog(state.log, hpBarEntry(state, nextTick)),
      };
    }
  }

  return {
    outcome: state.outcome!,
    finalState: {
      ...state,
      log: appendLog(state.log, hpBarEntry(state, lastTick)),
    },
    potionsConsumed: consumed,
    turns,
    ...(state.enemyDamageDealtTotal == null
      ? {}
      : { damageDealtTotal: state.enemyDamageDealtTotal }),
  };
}
