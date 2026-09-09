import { BLEED_MAX_STACKS } from "@/adventure/data/v2/v2CombatConstants";
import { V2_SKILLS } from "@/adventure/data/v2/v2Skills";
import { recordCombatDotDamage, recordCombatMetric } from "./combatDiagnostics";
import { distributeV2DotTicks, healingAfterReceivedMultiplier, statusDamageAfterReduction, tickV2Dots, v2DotLogCause } from "./combatShared";
import { resolveEnemyPhase } from "./engine.enemyPhase";
import { resolvePlayerPhase } from "./engine.playerPhase";
import { applyEnemyDamage, applyPhaseTriggerIfAny, decrementTimedEffects, rollEnemyAttackCount } from "./engine.pveOperations";
import { BOSS_MAX_HP_DAMAGE_MULT, type BattleState, type PlayerAction, type PlayerCombat } from "./engineState";
import { appendLog } from "./engineSupport";

export function advanceTurn(
  state: BattleState,
  player: PlayerCombat,
  playerName: string,
  action: PlayerAction = { kind: "attack" },
  // 몹이 이 enemy 페이즈에 스킬을 시전했으면 평타 생략(스킬이 평타 대체). 적 분기에서만 의미.
  skipEnemyBasicAttack: boolean = false,
  basicAttackKind?: "extra_basic",
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
    return resolvePlayerPhase(state, player, playerName, action, { kind: basicAttackKind });
  }

  return resolveEnemyPhase(
    state,
    player,
    playerName,
    enteringEnemyPhase,
    skipEnemyBasicAttack,
  );
}
