import { tagNewLogEntries } from "./engine.atbLog";
import { resolveForcedEnemyMagicHit } from "./engine.enemyPhase";
import { type BattleLogEntry, type BattleState, type PlayerCombat } from "./engineState";
import { appendLog } from "./engineSupport";
import {
  SKYWARD_CRYSTAL_EYE_EXPOSURE_DAMAGE_PCT,
  SKYWARD_CRYSTAL_EYE_STACK_CAP,
  addSkywardCrystalEyeHit,
  fireSkywardCrystalEyeArtillery,
  skywardCrystalEyeBasePowerPct,
} from "./skywardCrystalEyeMechanic";

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


export function settleSkywardCrystalEyeAfterPlayerAction(
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


export function settleSkywardCrystalEyeExposureDamage(args: {
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


export const SKYWARD_CRYSTAL_EYE_ARTILLERY_MAGIC_DEF_PIERCE_PCT = 50;

export const SKYWARD_CRYSTAL_EYE_ARTILLERY_ACCURACY_BONUS = 250;


export function fireSkywardCrystalEyeAtbArtillery(args: {
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
