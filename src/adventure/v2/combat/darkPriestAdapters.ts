import { recordCombatDamage } from "./combatDiagnostics";
import type { BattleState, PlayerCombat, BattleLogEntry } from "./engineState";
import type { PvPBattleState } from "./engine-pvp";
import { appendLog } from "./engineSupport";
import { applyBerserkerHostileDamage } from "./pveHostileDamage";
import { resolvePvPHostileDamageSurvival, appendPvPSurvivalLogs } from "./pvpHostileDamage";
import { distributeBoostedHits } from "./hitDistribution";
import { deferPainHits, createPain, PAIN_CORE, repayPain, type PainState, type castPainRitual } from "./darkPriest";
type Cast = ReturnType<typeof castPainRitual> | undefined;
export function initialPain(equipped: readonly string[], maxHp: number) { return equipped.includes(PAIN_CORE) ? { pain: createPain(maxHp) } : {}; }
export function painDeferLog(amount: number, remaining: number, actor: { side?: "p1" | "p2"; turn?: "player" | "enemy" }): BattleLogEntry {
  return { kind: "info", text: `[고통 유예] ${amount} 유예 (고통 ${remaining})`, ...actor, painEvent: { kind: "defer", amount, remaining } };
}
function castLog(result: NonNullable<Cast>, actor: { side?: "p1" | "p2"; turn?: "player" | "enemy" }): BattleLogEntry {
  const sanctuary = result.state.sanctuary === 4;
  return { kind: "info", ...actor, text: sanctuary ? "[검은 성역] 4행동 상환 유예 · 종료 시 남은 고통 전액 상환" : `[고통 의식] 고통 ${result.spent} 소비${result.damageMult > 1 ? ` · 위력 +${Math.round((result.damageMult - 1) * 100)}%` : ""}${result.enhanced ? " · 순환 강화 소비" : ""}${result.state.next ? ` · 다음 ${result.state.next === "absolve" ? "사죄" : "단죄"} 강화` : ""}`, painEvent: { kind: sanctuary ? "sanctuary" : "consume", amount: result.spent, remaining: result.state.debt } };
}
export function applyPainCastPve(state: BattleState, result: Cast): BattleState {
  return result ? { ...state, stacks: { ...state.stacks, pain: result.state }, log: appendLog(state.log, castLog(result, { turn: "player" })) } : state;
}
export function applyPainCastPvp(state: PvPBattleState, who: "p1" | "p2", result: Cast): PvPBattleState {
  return result ? { ...state, [who]: { ...state[who], stacks: { ...state[who].stacks, pain: result.state } }, log: appendLog(state.log, castLog(result, { side: who })) } : state;
}
function repaymentLog(state: PainState, damage: number, expired: boolean, actor: { side?: "p1" | "p2"; turn?: "player" | "enemy" }): BattleLogEntry {
  return { kind: "info", ...actor, text: `[${expired ? "검은 성역 종료" : "고통 상환"}] HP ${damage} 감소 (고통 ${state.debt})`, painEvent: { kind: "repay", amount: damage, remaining: state.debt } };
}
export function settlePainPve(state: BattleState, player: PlayerCombat): BattleState {
  if (!state.stacks.pain || state.playerHp <= 0) return state;
  const tick = repayPain(state.stacks.pain);
  let next: BattleState = { ...state, stacks: { ...state.stacks, pain: tick.state } };
  if (tick.damage <= 0) return next;
  next = { ...next, log: appendLog(next.log, repaymentLog(tick.state, tick.damage, tick.expired, { turn: "player" })) };
  recordCombatDamage("pain_repayment", "player", next.playerHp, tick.damage);
  next = applyBerserkerHostileDamage(next, player, next.playerHp - tick.damage, "player").state;
  if (next.playerHp <= 0 && player.enduranceActive && !next.flags.enduranceTriggered) {
    next = { ...next, playerHp: 1, flags: { ...next.flags, enduranceTriggered: true }, log: appendLog(next.log, { kind: "info", text: "[불굴] 고통 상환을 HP 1로 버텼다.", turn: "player" }) };
  }
  return next.playerHp <= 0 ? { ...next, phase: "ended", outcome: "lose", log: appendLog(next.log, { kind: "info", text: "고통을 감당하지 못하고 쓰러졌다.", turn: "player" }) } : next;
}
export function settlePainPvp(state: PvPBattleState, who: "p1" | "p2"): PvPBattleState {
  const side = state[who];
  if (!side.stacks.pain || side.hp <= 0) return state;
  const tick = repayPain(side.stacks.pain);
  let next = { ...state, [who]: { ...side, stacks: { ...side.stacks, pain: tick.state } } };
  if (tick.damage <= 0) return next;
  recordCombatDamage("pain_repayment", who, side.hp, tick.damage);
  const survival = resolvePvPHostileDamageSurvival(next[who], side.hp - tick.damage);
  next = { ...next, [who]: survival.side, log: appendLog(next.log, repaymentLog(tick.state, tick.damage, tick.expired, { side: who })) };
  next = appendPvPSurvivalLogs(next, who, side.name, survival);
  if (next[who].hp > 0) return next;
  return { ...next, phase: "ended", outcome: next.p1.hp <= 0 && next.p2.hp <= 0 ? "draw" : who === "p1" ? "p2_win" : "p1_win", log: appendLog(next.log, { kind: "info", text: `${side.name}이(가) 고통을 감당하지 못하고 쓰러졌다.`, side: who }) };
}

/** 공유 피해 경감 뒤 타격별 보호막·고통 유예를 적용한다. */
export function deferPainPveSkill(state: BattleState, hits: number[], damage: number, shield: number, log: BattleLogEntry[]): [BattleState, BattleLogEntry[], number] {
  const hit = deferPainHits(state.stacks.pain, distributeBoostedHits(hits, damage), shield, false);
  if (hit.deferred <= 0) return [state, log, hit.immediate];
  return [
    { ...state, stacks: { ...state.stacks, pain: hit.state } },
    appendLog(log, painDeferLog(hit.deferred, hit.state!.debt, { turn: "enemy" })),
    hit.immediate,
  ];
}
