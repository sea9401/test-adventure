// PvP 전투 진행과 공개 API. 상태·기본 행동·스킬 처리는 각각의 하위 모듈에서 담당한다.

import { type PotionId } from "@/adventure/data/potions";
import { V2_CORE_LOOP_V2 } from "@/adventure/data/v2/coreLoopConfig";
import { tickV2BuffMap } from "./combatShared";
import { appendLog } from "./engineSupport";
import { type BattleLogEntry, type PlayerAction, type PlayerCombat } from "./engineState";
import { resolveBattlePvPAtb } from "./engine.pvp-atb";
import {
  applyEvasionActionRecoveryPvP,
  decrementTimedEffects,
  endAttackerPhase,
  initialBattleStatePvP,
  setSide,
} from "./engine.pvpOperations";
import { advanceTurnPvP } from "./engine.pvpPhase";
import { castV2SkillOnAttackerTurnPvP } from "./engine.pvpSkills";
import {
  PVP_TURN_CAP,
  type PvPBattleResolution,
  type PvPBattleState,
  type PvPOutcome,
  type PvPResolveContext,
} from "./engine.pvpState";
import { mergeTier7ResourceSnapshot } from "./engineState";
import { mergeFrostChillSnapshot } from "./frostChill";
import { mergeLawInscriptionSnapshot } from "./lawInscription";
import { pickPvpInitiative } from "./pvpInitiative";
import { enterShockAction } from "./shockAction";
import { activeTier6ResourceSnapshot } from "./tier6UniqueEffects";
import { mergeTripleWardResourceSnapshot } from "./tripleWard";
export {
  actorKeys,
  applyEvasionActionRecoveryPvP,
  applyOnHitReflect,
  applyPerAttackDodge,
  applyPotionTo,
  applyPvPOnHitDots,
  applyShadowStepDodge,
  applyTrackedSetShieldAbsorptionPvP,
  attackerFacingDef,
  decrementTimedEffects,
  effectivePvPAccuracyRating,
  endAttackerPhase,
  finishPvPBerserkerAttackAction,
  initialBattleStatePvP,
  maybeApplyMartialCounter,
  maybeApplyRuneCounter,
  mitigatePvPReflectDamage,
  playerPvpEvasionReductionPct,
  releaseSwordShadowAfterPvPAction,
  rollPvPAttackCount,
  setSide,
  tickPvPSideDotsOnAction,
} from "./engine.pvpOperations";
export { castV2SkillOnAttackerTurnPvP } from "./engine.pvpSkills";
export {
  PVP_TURN_CAP,
  type PvPAttackDamageResult,
  type PvPBattleResolution,
  type PvPBattleState,
  type PvPOutcome,
  type PvPPhase,
  type PvPPhaseEndOptions,
  type PvPResolveContext,
  type PvPSide,
  type PvPSideBuffs,
  type PvPSideFlags,
  type PvPSideStacks,
} from "./engine.pvpState";
export { pvpSideDamageTakenReductionPct } from "./pvpDamageReduction";

export { applyBerserkerHostileDamagePvP } from "./pvpHostileDamage";

export { advanceTurnPvP };


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
    const playerResources = mergeFrostChillSnapshot(
      mergeLawInscriptionSnapshot(
        mergeTripleWardResourceSnapshot(
          mergeTier7ResourceSnapshot(
            activeTier6ResourceSnapshot(s.p1.stacks.tier6Uniques),
            s.p1.stacks.tier7,
          ),
          s.p1.stacks.tripleWard,
        ),
        s.p1.stacks.lawInscriptions,
      ),
      s.p1.stacks.frostChillStacks,
    );
    const enemyResources = mergeFrostChillSnapshot(
      mergeLawInscriptionSnapshot(
        mergeTripleWardResourceSnapshot(
          mergeTier7ResourceSnapshot(
            activeTier6ResourceSnapshot(s.p2.stacks.tier6Uniques),
            s.p2.stacks.tier7,
          ),
          s.p2.stacks.tripleWard,
        ),
        s.p2.stacks.lawInscriptions,
      ),
      s.p2.stacks.frostChillStacks,
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
      const forcedRuinRelease = side.stacks.tier7?.ruinCharge != null;
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
            side.turn.completedPlayerTurns > 0 && !forcedRuinRelease
              ? decrementTimedEffects(side.buffs)
              : side.buffs,
          v2SelfBuffs: forcedRuinRelease
            ? side.v2SelfBuffs
            : tickV2BuffMap(side.v2SelfBuffs),
          v2SelfDebuffs: forcedRuinRelease
            ? side.v2SelfDebuffs
            : tickV2BuffMap(side.v2SelfDebuffs),
        },
      );
      if (forcedRuinRelease) {
        state = castV2SkillOnAttackerTurnPvP(state, who).state;
      }
      if (state.phase !== "ended") {
        state = endAttackerPhase(state, who, other, {
          skipOffensiveFollowups: true,
        });
      }
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
