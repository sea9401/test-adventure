import { stampTick } from "./engine.atbLog";
import { resolveForcedEnemyPhysicalHit } from "./engine.enemyPhase";
import { type BattleLogEntry, type BattleState, type PlayerCombat } from "./engineState";
import { appendLog } from "./engineSupport";
import {
  TRACKING_ELIMINATION_HIT_MULTIPLIER,
  TRACKING_ELIMINATION_PHYSICAL_DEFENSE_PIERCE_PCT,
  TRACKING_THREAT_MAX,
  accumulateTrackingThreat,
  resolveTrackingThreatAfterPlayerAction,
  trackingThreatGain,
} from "./trackingWeaponMechanic";

export function appendTrackingLog(
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


export function trackingDirectHits(
  log: readonly BattleLogEntry[],
  start: number,
): number {
  return log.slice(start).reduce((sum, entry) => {
    if (entry.kind !== "player_attack") return sum;
    return sum + Math.max(0, Math.floor(entry.directHits ?? 1));
  }, 0);
}


export function settleTrackingAfterPlayerAction(args: {
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


export function accumulateTrackingFromEnemyAction(
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
