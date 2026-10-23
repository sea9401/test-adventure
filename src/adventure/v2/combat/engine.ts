import { settlePainPve } from "./darkPriestAdapters";
import { withCombatRandom } from "./combatRandom";
import { advanceTurn } from "./engine.turn";
import { playerResourceSnapshot } from "./playerResourceSnapshot";
export { applyEnemyV2SkillCast } from "./engine.enemySkills";
export { applyPlayerV2SkillCast } from "./engine.playerSkills";
export {
applyBerserkerHostileDamage,
applyCounterIfAny,
applyEnemyDamage,
applyPhaseTriggerIfAny,
applyPlayerOnHitDots,
applyPotionEffect,
finishEnemyAttack,
finishPlayerTurn,
initialBattleState,
playerFacingEnemyDef,
recordEnemyDamage,
rollPlayerAttackCount,
rollPlayerAttackCountWithBleed
} from "./engine.pveOperations";
export { advanceTurn } from "./engine.turn";
export {
BOSS_TURN_CAP,
DEF_IGNORE_FRACTION,
NORMAL_MONSTER_EXECUTION_HP_FRACTION,
NORMAL_MONSTER_EXECUTION_HP_PCT,
type BattleResolution,
type ResolveContext
} from "./engineResolutionTypes";
export {
appendLog,
appendSkillCastLog,
applyEvasionActionRecoveryPvE,
applyHealShieldIfAny,
playerPveEvasionReductionPct,
setBattleLogCollection
} from "./engineSupport";
export { beginUnexploredPlayerAttack,finishUnexploredEnemyAction,finishUnexploredFrostEnemyAction,finishUnexploredPlayerAttack,hasUnexploredEffect,recordUnexploredEnemyHit,recordUnexploredEnemySkillHits,sumMagicBarrierDamage,unexploredDefensePve,unyieldingDamagePve } from "./unexploredSetPveAdapter";
// PvE 전투 진행과 공개 API. 개별 행동·스킬 처리는 하위 모듈에서 담당한다.

import { type PotionId } from "@/adventure/data/potions";
import { V2_CORE_LOOP_V2 } from "@/adventure/data/v2/coreLoopConfig";
import { DAMAGE_FLOOR_FRACTION, damageBetween, tickV2BuffMap } from "./combatShared";
import { resolveBattleAtb } from "./engine.atb";
import { applyLegacyEnemyPhaseSkillCast, tickLegacyPlayerDotsAtPhaseStart } from "./engine.legacyPhaseStart";
import { applyPlayerV2SkillCast } from "./engine.playerSkills";
import { finishPlayerTurn, initialBattleState, rollPlayerAttackCountWithBleed } from "./engine.pveOperations";
import { BOSS_TURN_CAP, type BattleResolution, type ResolveContext } from "./engineResolutionTypes";
import { type BattleLogEntry, type BattleState, type PlayerAction, type PlayerCombat } from "./engineState";
import { appendLog, applyEvasionActionRecoveryPvE } from "./engineSupport";
import { mergeFrostChillSnapshot } from "./frostChill";
import { enterShockAction } from "./shockAction";

export { BOSS_MAX_HP_DAMAGE_MULT, BOSS_PCT_HP_DAMAGE_MULT, COMBO_FINISHER_PERIOD } from "./engineState";

export type {
BattleBuffs,
BattleFlags,
BattleLogEntry,
BattleOutcome,
BattlePhase,
BattleStacks,
BattleState,
BattleTurnState,
BossMechanicBattleState,
BossMechanicContext,
EquippedAPSkill,
PlayerAction,
PlayerCombat
} from "./engineState";

// 데미지 최소 비율(DAMAGE_FLOOR_FRACTION)·평타 데미지(damageBetween)는 combatShared 로 이전
//   (패턴 "평타 바닥" 모델이 같은 공식을 써야 해서 더 하위 레이어로 내림). 여기선 재노출만.
export { DAMAGE_FLOOR_FRACTION,damageBetween };

// 한 턴 진행 — 현재 phase 측이 행동하고 결과를 다음 BattleState로 반환.
// player phase는 action(공격 또는 물약)으로 분기. attack이면 attackCount 만큼 연속 공격.
// phase === "ended" 이면 그대로 반환.


// 그 시점 HP 스냅샷 — 매 턴 종료 시 + 전투 종료 시 로그 마지막에 박는다.
function hpBarEntry(s: BattleState): BattleLogEntry {
  const playerResources = playerResourceSnapshot(s.stacks, s.unexploredSetRuntime, s.unexploredBossRuntime);
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
  let generatedBasicsThisPlayerPhase = false;

  while (state.phase !== "ended") {
    if (ctx.logMode === "summary") state = { ...state, log: [] };
    let action: PlayerAction = { kind: "attack" };
    // 이 iteration 의 enemy 페이즈에서 몹이 스킬을 실제 발동했는지 — true 면 평타 생략(더블어택 fix).
    let enemySkillFiredThisTurn = false;
    let shockSkipsEnemyAction = false;
    if (state.phase !== "player") generatedBasicsThisPlayerPhase = false;
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
        // 0) PR-8 — player 가 받는 DoT tick (적이 박은 dot). lethal 이면 즉시 종료.
        state = tickLegacyPlayerDotsAtPhaseStart(state, player, playerName);
        if (state.phase === "ended") continue;
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
          state = settlePainPve(state, player);
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
          state = finishPlayerTurn(ended, player, playerName, {
            deferColonyRegeneration: cast.signatureExtraActions > 0,
            deferPainSettlement: cast.signatureExtraActions > 0,
          });
          if (cast.signatureExtraActions > 0 && state.phase !== "ended") {
            generatedBasicsThisPlayerPhase = true;
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
        const enemyCast = applyLegacyEnemyPhaseSkillCast(state, player);
        state = enemyCast.state;
        enemySkillFiredThisTurn = enemyCast.skillFired;
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
      generatedBasicsThisPlayerPhase ? "extra_basic" : undefined,
    );
    if (action.kind === "use_potion" && state.phase === "player") {
      generatedBasicsThisPlayerPhase = true;
    }
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
          text: `${BOSS_TURN_CAP}턴 경과, 보스를 쓰러뜨리지 못했다.`,
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
  const result = withCombatRandom(ctx.random, () => V2_CORE_LOOP_V2 || ctx.damageMeter
    ? resolveBattleAtb(player, enemy, playerName, ctx)
    : resolveBattleLegacy(player, enemy, playerName, ctx));
  return ctx.logMode === "summary"
    ? { ...result, finalState: { ...result.finalState, log: [] } }
    : result;
}


export { applyPassiveCounterOnHitIfAny } from "./engine.passiveCounter";
