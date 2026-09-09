export type HolyPowerState = { power: number; sanctuaryTurns: number };
export type HolyPowerAction = "sanctuary" | "judgment";

const bounded = (value: number | undefined, max: number): number =>
  Number.isFinite(value) ? Math.max(0, Math.min(max, Math.floor(value!))) : 0;

export function normalizeHolyPower(value?: Partial<HolyPowerState>): HolyPowerState {
  return { power: bounded(value?.power, 100), sanctuaryTurns: bounded(value?.sanctuaryTurns, 4) };
}

export function castHolyPower(value: Partial<HolyPowerState> | undefined, action: HolyPowerAction): HolyPowerState {
  const state = normalizeHolyPower(value);
  return action === "sanctuary" ? { ...state, sanctuaryTurns: 4 } : { ...state, power: 0 };
}

export function tickHolyPower(value: Partial<HolyPowerState>) {
  const state = normalizeHolyPower(value);
  if (state.sanctuaryTurns === 0) return { state, healPct: 0, gained: 0 };
  const power = Math.min(100, state.power + 10);
  return { state: { power, sanctuaryTurns: state.sanctuaryTurns - 1 }, healPct: 4, gained: power - state.power };
}

/** 공통 차수 감쇠 전 카탈로그 값이 아닌, 합의된 실제 ATK/STR/SPI 계수. */
export function holyJudgmentCoefficient(value?: Partial<HolyPowerState>): number {
  return 2 + normalizeHolyPower(value).power * 0.03;
}

export function mergeHolyPowerSnapshot(
  base: Record<string, number | string> | undefined,
  value?: Partial<HolyPowerState>,
): Record<string, number | string> | undefined {
  if (!value) return base;
  const state = normalizeHolyPower(value);
  return { ...base, holyPower: `${state.power}/100`, sanctuary: `${state.sanctuaryTurns}행동` };
}
