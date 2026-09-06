import { mergeTier7ResourceSnapshot, type BattleLogEntry, type BattleState } from "./engineState";
import { mergeFrostChillSnapshot } from "./frostChill";
import { GLACIAL_CHILL_THRESHOLD } from "./glacialColossusMechanic";
import { immortalBerserkerDisplay } from "./immortalBerserkerMechanic";
import { invincibleFortressResourceSnapshot } from "./invincibleFortressMechanic";
import { mergeLawInscriptionSnapshot } from "./lawInscription";
import { skywardCrystalEyeResourceSnapshot } from "./skywardCrystalEyeMechanic";
import { activeTier6ResourceSnapshot } from "./tier6UniqueEffects";
import { TOXIC_BLOOD_MAX_STACKS, TOXIC_RECOVERY_LOCK_ACTIONS } from "./toxicBloodLordMechanic";
import { TRACKING_THREAT_MAX } from "./trackingWeaponMechanic";
import { mergeTripleWardResourceSnapshot } from "./tripleWard";

export function hpBarEntry(state: BattleState, tick?: number): BattleLogEntry {
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


// prevLogLen 이후 새 엔트리에 ATB 틱만 찍는다(turn 미변경). 번들 틱(DoT/사망 로그)처럼
//   tagNewLogEntries 밖에서 추가돼 turn 정렬은 그대로 둬야 하는 엔트리용 — t 누락 방지.
export function stampTick(
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


export function tagNewLogEntries(
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
