export const MINING_SETTLE_MS = 550;

export type MiningAnimationFrame = {
  cycle: number;
  strikeCount: number;
  damage: number;
  impact: number;
};

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function miningAnimationFrame(
  elapsedMs: number,
  durationMs: number,
  strikes: number,
): MiningAnimationFrame {
  const safeDuration = Math.max(1, durationMs);
  const safeStrikes = Math.max(1, Math.floor(strikes));
  const elapsed = Math.max(0, Math.min(safeDuration, elapsedMs));
  const progress = clamp01(elapsed / safeDuration);
  const scaled = progress * safeStrikes;
  const cycle = progress >= 1 ? 1 : scaled - Math.floor(scaled);
  const strikeCount = Math.min(safeStrikes, Math.floor(scaled + 0.38));
  const damage = strikeCount / safeStrikes;
  const impactCenter = 0.38;
  const impact = Math.max(0, 1 - Math.abs(cycle - impactCenter) / 0.11);
  return { cycle, strikeCount, damage, impact };
}
