import { combatRandom, withCombatRandom } from "./combatRandom";
import { recordCombatDamage, recordCombatDotDamage, recordCombatMetric } from "./combatDiagnostics";
// PvE 전투 진행과 공개 API. 개별 행동·스킬 처리는 하위 모듈에서 담당한다.

import { type PotionId } from "@/adventure/data/potions";
import { STAT_LABELS } from "@/adventure/data/stats";
import { V2_CORE_LOOP_V2 } from "@/adventure/data/v2/coreLoopConfig";
import { statusNameForDebuffStat } from "@/adventure/data/v2/statusEffects";
import { BLEED_MAX_STACKS } from "@/adventure/data/v2/v2CombatConstants";
import { V2_SKILLS } from "@/adventure/data/v2/v2Skills";
import { finishBerserkerCurrentActionGuard } from "./berserkerCombat";
import {
  applyV2BuffsToMap,
  applyV2DotsToTarget,
  DAMAGE_FLOOR_FRACTION,
  damageBetween,
  distributeV2DotTicks,
  healingAfterReceivedMultiplier,
  resolveV2SkillCast,
  statusDamageAfterReduction,
  tickV2BuffMap,
  tickV2Dots,
  v2DotLogCause,
} from "./combatShared";
import { resolveBattleAtb } from "./engine.atb";
import { resolveEnemyPhase } from "./engine.enemyPhase";
import {
  appendEnemySkillMitigationLogs,
  evadeIncomingEnemySkill,
  resolveEnemySkillReflection,
  resolveIncomingEnemySkillWithBarrier,
} from "./engine.enemySkills";
import { resolvePlayerPhase } from "./engine.playerPhase";
import { applyPlayerV2SkillCast } from "./engine.playerSkills";
import {
  applyBerserkerHostileDamage,
  applyEnemyDamage,
  applyPassiveCounterOnHitIfAny,
  applyPhaseTriggerIfAny,
  applyTrackedSetShieldAbsorptionPve,
  decrementTimedEffects,
  finishPlayerTurn,
  initialBattleState,
  rollEnemyAttackCount,
  rollPlayerAttackCountWithBleed,
} from "./engine.pveOperations";
import { BOSS_TURN_CAP, type BattleResolution, type ResolveContext } from "./engineResolutionTypes";
import {
  BOSS_MAX_HP_DAMAGE_MULT,
  mergeTier7ResourceSnapshot,
  type BattleLogEntry,
  type BattleState,
  type PlayerAction,
  type PlayerCombat,
} from "./engineState";
import { appendLog, appendSkillCastLog, applyEvasionActionRecoveryPvE } from "./engineSupport";
import { consumeReactiveDefenseCharges, resolveFortressReaction } from "./fortressKnight";
import { mergeFrostChillSnapshot } from "./frostChill";
import { mergeLawInscriptionSnapshot } from "./lawInscription";
import { magicBarrierCombatLogEntries } from "./magicBarrier";
import { effectiveMutationDef } from "./mutationCombat";
import { enterShockAction } from "./shockAction";
import { statusBlockOnce } from "./signatureEffects";
import { activeTier6ResourceSnapshot } from "./tier6UniqueEffects";
import { applyTier6UniquePveEvent } from "./tier6UniquePveAdapter";
import {
  consumePurificationWard,
  mergeTripleWardResourceSnapshot,
  TRIPLE_WARD_LABELS,
} from "./tripleWard";
export { applyEnemyV2SkillCast } from "./engine.enemySkills";
export { applyPlayerV2SkillCast } from "./engine.playerSkills";
export {
  applyBerserkerHostileDamage,
  applyCounterIfAny,
  applyEnemyDamage,
  applyPassiveCounterOnHitIfAny,
  applyPhaseTriggerIfAny,
  applyPlayerOnHitDots,
  applyPotionEffect,
  finishEnemyAttack,
  finishPlayerTurn,
  initialBattleState,
  playerFacingEnemyDef,
  recordEnemyDamage,
  rollPlayerAttackCount,
  rollPlayerAttackCountWithBleed,
} from "./engine.pveOperations";
export {
  BOSS_TURN_CAP,
  DEF_IGNORE_FRACTION,
  NORMAL_MONSTER_EXECUTION_HP_FRACTION,
  NORMAL_MONSTER_EXECUTION_HP_PCT,
  type BattleResolution,
  type ResolveContext,
} from "./engineResolutionTypes";
export {
  appendLog,
  appendSkillCastLog,
  applyEvasionActionRecoveryPvE,
  applyHealShieldIfAny,
  playerPveEvasionReductionPct,
  setBattleLogCollection,
} from "./engineSupport";

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
  BossMechanicBattleState,
  BossMechanicContext,
  EquippedAPSkill,
  PlayerAction,
  PlayerCombat,
} from "./engineState";


// 데미지 최소 비율(DAMAGE_FLOOR_FRACTION)·평타 데미지(damageBetween)는 combatShared 로 이전
//   (패턴 "평타 바닥" 모델이 같은 공식을 써야 해서 더 하위 레이어로 내림). 여기선 재노출만.
export { DAMAGE_FLOOR_FRACTION, damageBetween };


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
      recordCombatDotDamage(enemyDotTick.ticks, "enemy", state.enemyHp, enemyDotDamage);
      const damagedState = applyEnemyDamage(state, enemyDotDamage, null);
      const newHp = damagedState.enemyHp;
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
      const bleedTickHealBase =
        actualBleedDamage > 0 && bleedTickHealPct > 0
          ? Math.floor((state.playerMaxHp * bleedTickHealPct) / 100)
          : 0;
      const bleedTickHeal = healingAfterReceivedMultiplier(
        bleedTickHealBase,
        player.receivedHealMult,
      );
      const nextPlayerHp = Math.min(
        state.playerMaxHp,
        state.playerHp + bleedTickHeal,
      );
      const actualBleedTickHeal = nextPlayerHp - state.playerHp;
      recordCombatMetric("healing", "bleed_hunt", "player", actualBleedTickHeal);
      if (actualBleedTickHeal > 0) {
        dotLog = appendLog(dotLog, {
          kind: "info",
          text: `[피의 양식] HP ${actualBleedTickHeal} 회복했다.`,
          turn: "enemy",
        });
      }
      state = applyPhaseTriggerIfAny({
        ...damagedState,
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
    if (ctx.logMode === "summary") state = { ...state, log: [] };
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
          recordCombatDotDamage(playerDotTick.ticks, "player", state.playerHp, playerDotDamage);
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
            recordCombatMetric("survival_restoration", "endurance", "player", 1);
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
          diagnosticActor: "enemy",
          skills: state.enemyV2Skills,
          cooldowns: state.enemyV2SkillCooldowns,
          procRoll: combatRandom() * 100,
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
        if (result.castSkillId && result.castSkillName) {
          state = {
            ...state,
            log: appendSkillCastLog(
              state.log,
              result.castSkillId,
              result.castSkillName,
              { turn: "enemy" },
            ),
          };
        }
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
        // 구조화된 시전 경계와 별개로 damage/heal 로그에도 스킬명을 포함한다.
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
          recordCombatDamage(result.castSkillId ?? "enemy_skill", "player", nextPlayerHp, enemySkillDamageToHp, enemySkillShieldAbsorbed + enemySkillMagicBarrier.absorbedDamage);
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
            enemyHpDamage: enemySkillDamageToHp,
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
          recordCombatDamage("reflect", "enemy", nextEnemyHp, legacyEnemySkillReflection.damage);
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
          recordCombatMetric("survival_restoration", "endurance", "player", 1);
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
          recordCombatMetric("healing", result.castSkillId ?? "enemy_skill", "enemy", actual);
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
  const result = withCombatRandom(ctx.random, () => V2_CORE_LOOP_V2 || ctx.damageMeter
    ? resolveBattleAtb(player, enemy, playerName, ctx)
    : resolveBattleLegacy(player, enemy, playerName, ctx));
  return ctx.logMode === "summary"
    ? { ...result, finalState: { ...result.finalState, log: [] } }
    : result;
}
