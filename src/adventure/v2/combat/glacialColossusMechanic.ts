export const GLACIAL_CHILL_THRESHOLD = 10;
export const GLACIAL_CHILL_SLOW_PER_STACK = 0.07;

export type GlacialChillTransition = {
  stacks: number;
  freezePending: 0 | 1;
  triggered: boolean;
  appliedGain: number;
};

function whole(value: unknown, max: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(0, Math.floor(value)))
    : 0;
}

export function glacialChillSpeedMultiplier(stacks: unknown): number {
  return (
    1 -
    whole(stacks, GLACIAL_CHILL_THRESHOLD - 1) *
      GLACIAL_CHILL_SLOW_PER_STACK
  );
}

export function resolveGlacialChillGain(input: {
  current: unknown;
  gain: unknown;
  freezePending: unknown;
}): GlacialChillTransition {
  const freezePending = whole(input.freezePending, 1) as 0 | 1;
  if (freezePending === 1) {
    return {
      stacks: 0,
      freezePending,
      triggered: false,
      appliedGain: 0,
    };
  }

  const current = whole(input.current, GLACIAL_CHILL_THRESHOLD - 1);
  const appliedGain = whole(input.gain, 2);
  if (current + appliedGain >= GLACIAL_CHILL_THRESHOLD) {
    return {
      stacks: 0,
      freezePending: 1,
      triggered: true,
      appliedGain,
    };
  }
  return {
    stacks: current + appliedGain,
    freezePending: 0,
    triggered: false,
    appliedGain,
  };
}

export function rescaleReservedPlayerTick(input: {
  currentTick: number;
  playerNextTick: number;
  previousStacks: unknown;
  nextStacks: unknown;
}): number {
  const currentTick = Number.isFinite(input.currentTick)
    ? input.currentTick
    : 0;
  const playerNextTick = Number.isFinite(input.playerNextTick)
    ? Math.max(currentTick, input.playerNextTick)
    : currentTick;
  const remaining = playerNextTick - currentTick;
  return (
    currentTick +
    (remaining * glacialChillSpeedMultiplier(input.previousStacks)) /
      glacialChillSpeedMultiplier(input.nextStacks)
  );
}
