export const WOODCUTTING_TREE_FALL_MS = 700;
export const WOODCUTTING_STRIKE_POINT = 0.66;
const WOODCUTTING_IMPACT_WINDOW = 0.16;

export type WoodcuttingAnimationFrame = {
  progress: number;
  cycle: number;
  chopCount: number;
  damage: number;
  impact: number;
  fall: number;
};

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function easeOutCubic(value: number): number {
  const t = clamp01(value);
  return 1 - (1 - t) ** 3;
}

export function woodcuttingAnimationFrame(
  elapsedMs: number,
  durationMs: number,
  chops: number,
  reducedMotion = false,
): WoodcuttingAnimationFrame {
  const safeDuration = Math.max(1, Math.floor(Number(durationMs) || 1));
  const safeElapsed = Math.max(0, Number(elapsedMs) || 0);
  const safeChops = Math.max(1, Math.floor(Number(chops) || 1));
  const progress = clamp01(safeElapsed / safeDuration);
  const chopDuration = safeDuration / safeChops;
  const currentChop = Math.min(safeChops, Math.floor(safeElapsed / chopDuration));
  const cycle =
    safeElapsed >= safeDuration
      ? 1
      : reducedMotion
        ? 0.22
        : (safeElapsed % chopDuration) / chopDuration;
  const registeredHit = safeElapsed >= safeDuration || cycle >= WOODCUTTING_STRIKE_POINT ? 1 : 0;
  const chopCount = Math.min(safeChops, currentChop + registeredHit);
  const damage = reducedMotion ? progress : chopCount / safeChops;
  const impactWindow = clamp01(
    (cycle - WOODCUTTING_STRIKE_POINT) / WOODCUTTING_IMPACT_WINDOW,
  );
  const impact =
    !reducedMotion &&
    cycle >= WOODCUTTING_STRIKE_POINT &&
    cycle <= WOODCUTTING_STRIKE_POINT + WOODCUTTING_IMPACT_WINDOW
      ? 1 - easeOutCubic(impactWindow)
      : 0;
  const fall = easeOutCubic(
    clamp01((safeElapsed - safeDuration) / WOODCUTTING_TREE_FALL_MS),
  );
  return { progress, cycle, chopCount, damage, impact, fall };
}
