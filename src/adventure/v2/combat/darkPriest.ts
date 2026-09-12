/** 고통은 방어가 끝난 HP 피해의 부채다. 모든 전투 표면에서 같은 전이를 쓴다. */
export type PainState = { maxHp: number; debt: number; sanctuary: number; used: boolean; next: "absolve" | "condemn" | null };
export type PainRitual = "prayer" | "absolve" | "condemn" | "sentence" | "sanctuary";
export const PAIN_CORE = "v2c_darkpriest_blessing";
export const PAIN_CYCLE = "v2c_atonementbishop_cycle";
export const PAIN_OFFICIANT = "v2c_darksaint_officiant";
export function createPain(maxHp: number): PainState {
  return { maxHp: Math.max(1, Math.floor(maxHp)), debt: 0, sanctuary: 0, used: false, next: null };
}
export function deferPain(state: PainState | undefined, damage: number, pvp: boolean) {
  const raw = Math.max(0, Math.floor(damage));
  const deferred = state ? Math.min(Math.floor(raw * (pvp ? 0.12 : 0.2)), Math.max(0, Math.floor(state.maxHp * 0.2) - state.debt)) : 0;
  return { immediate: raw - deferred, deferred, state: state ? { ...state, debt: state.debt + deferred } : undefined };
}
/** 기존 PvE 스킬의 합산 방어 결과를 타격에 배분한 뒤, 보호막과 유예를 순서대로 처리한다. */
export function deferPainHits(state: PainState | undefined, hits: readonly number[], shield: number, pvp: boolean) {
  let remainingShield = Math.max(0, shield);
  let pain = state;
  let immediate = 0;
  let deferred = 0;
  for (const hit of hits) {
    const absorbed = Math.min(remainingShield, Math.max(0, hit));
    remainingShield -= absorbed;
    const result = deferPain(pain, hit - absorbed, pvp);
    immediate += result.immediate;
    deferred += result.deferred;
    pain = result.state;
  }
  return { state: pain, immediate, deferred };
}
export function castPainRitual(state: PainState, ritual: PainRitual, cycle: boolean, officiant: boolean) {
  if (ritual === "sanctuary") {
    const allowed = !state.used && state.debt >= Math.max(1, Math.floor(state.maxHp * 0.05));
    return { allowed, state: allowed ? { ...state, sanctuary: 4, used: true } : state, spent: 0, heal: 0, damageMult: 1, enhanced: false };
  }
  const side = ritual === "absolve" ? "absolve" : "condemn";
  const fraction = ritual === "prayer" ? 0.04 : ritual === "sentence" ? 0.1 : 0.08;
  const cap = Math.floor(state.maxHp * fraction * (state.sanctuary > 0 && officiant ? 1.25 : 1));
  const spent = Math.min(state.debt, cap);
  const enhanced = cycle && state.next === side;
  const damageMult = (ritual === "condemn" || ritual === "sentence" ? 1 + (cap > 0 ? 0.4 * spent / cap : 0) : 1) * (enhanced && side === "condemn" ? 1.15 : 1);
  const heal = Math.floor((ritual === "prayer" ? state.maxHp * 0.01 : ritual === "absolve" ? state.maxHp * 0.02 + spent * 0.25 : 0) * (enhanced && side === "absolve" ? 1.2 : 1));
  const next = cycle && spent > 0 ? (side === "absolve" ? "condemn" : "absolve") : enhanced ? null : state.next;
  return { allowed: true, state: { ...state, debt: state.debt - spent, next } as PainState, spent, heal, damageMult, enhanced };
}
export function repayPain(state: PainState) {
  const sanctuary = Math.max(0, state.sanctuary - 1);
  const expired = state.sanctuary === 1;
  const damage = sanctuary > 0 ? 0 : expired ? state.debt : Math.min(state.debt, Math.max(1, Math.floor(state.maxHp * 0.05)));
  return { state: { ...state, sanctuary, debt: state.debt - damage }, damage, expired };
}
export function painResources(state?: PainState): Record<string, number> {
  return { pain: state ? Math.floor(state.debt * 100 / state.maxHp) : 0, darkSanctuary: state?.sanctuary ?? 0, painAbsolution: state?.next === "absolve" ? 1 : 0, painCondemnation: state?.next === "condemn" ? 1 : 0, darkSanctuaryUsed: state?.used ? 1 : 0 };
}
export function mergePainSnapshot(base: Record<string, number | string> | undefined, state?: PainState) {
  if (!state) return base;
  return { ...base, pain: `${state.debt}/${Math.floor(state.maxHp * 0.2)}`, painRepayment: state.sanctuary > 0 ? `성역 종료 시 ${state.debt}` : `${Math.min(state.debt, Math.max(1, Math.floor(state.maxHp * 0.05)))}`, darkSanctuary: `${state.sanctuary}행동`, painCycle: state.next === "absolve" ? "다음 사죄 강화" : state.next === "condemn" ? "다음 단죄 강화" : "없음" };
}
