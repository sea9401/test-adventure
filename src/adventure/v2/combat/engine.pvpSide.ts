import { type PvPBattleState, type PvPPhase, type PvPSide } from "./engine.pvpState";

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
