export const FROST_CHILL_THRESHOLD = 5;
export const BASE_FREEZE_DELAY_PCT = 30;

export type FrostChillTransition = {
  previous: number;
  requestedGain: number;
  next: number;
  triggered: boolean;
  consumed: 0 | 5;
  damagePct: number;
  delayPct: number;
};

function nonNegativeInteger(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0;
}

export function normalizeFrostChill(value: unknown): number {
  return Math.min(FROST_CHILL_THRESHOLD - 1, nonNegativeInteger(value));
}

export function resolveFrostChillGain(
  current: unknown,
  gain: unknown,
  mastery: { damagePct?: number; delayPct?: number } = {},
): FrostChillTransition {
  const previous = normalizeFrostChill(current);
  const requestedGain = nonNegativeInteger(gain);
  const triggered = previous + requestedGain >= FROST_CHILL_THRESHOLD;
  if (!triggered) {
    return {
      previous,
      requestedGain,
      next: previous + requestedGain,
      triggered: false,
      consumed: 0,
      damagePct: 0,
      delayPct: 0,
    };
  }

  const damagePct = nonNegativeInteger(mastery.damagePct);
  const delayPct = Math.max(
    BASE_FREEZE_DELAY_PCT,
    nonNegativeInteger(mastery.delayPct),
  );
  return {
    previous,
    requestedGain,
    next: 0,
    triggered: true,
    consumed: FROST_CHILL_THRESHOLD,
    damagePct,
    delayPct,
  };
}

export function freezeRawDamage(args: {
  int: number;
  maxMp: number;
  damagePct: number;
}): number {
  const int = Number.isFinite(args.int) ? Math.max(0, args.int) : 0;
  const maxMp = Number.isFinite(args.maxMp) ? Math.max(0, args.maxMp) : 0;
  const damagePct = Number.isFinite(args.damagePct)
    ? Math.max(0, args.damagePct)
    : 0;
  return Math.round((int * 0.7 + maxMp * 0.04 + 180) * (1 + damagePct / 100));
}

export function frostChillSnapshot(
  value: unknown,
): Record<string, string> | null {
  const stacks = normalizeFrostChill(value);
  return stacks > 0 ? { frostChill: `한기 ${stacks}/5` } : null;
}

export function mergeFrostChillSnapshot(
  base: Record<string, number | string> | null | undefined,
  value: unknown,
): Record<string, number | string> | undefined {
  const frostChill = frostChillSnapshot(value);
  if (!base && !frostChill) return undefined;
  return { ...(base ?? {}), ...(frostChill ?? {}) };
}

export function formatFrostChillGainLog(gain: unknown, next: unknown): string {
  return `한기 +${nonNegativeInteger(gain)} (${normalizeFrostChill(next)}/5)`;
}

export function formatFrostChillTriggerLog(): string {
  return "한기 5스택을 소비해 빙결이 발생했다.";
}
