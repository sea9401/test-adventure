export const TRACKING_THREAT_MAX = 100;
export const TRACKING_DAMAGE_THREAT_SCALE = 500;
export const TRACKING_DIRECT_HIT_THREAT = 4;
export const TRACKING_ELIMINATION_HIT_MULTIPLIER = 2;
export const TRACKING_ELIMINATION_PHYSICAL_DEFENSE_PIERCE_PCT = 50;

function nonNegativeInteger(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

export function trackingThreatGain(input: {
  damage: number;
  bossMaxHp: number;
  directHits: number;
}): number {
  const maxHp = Math.max(1, nonNegativeInteger(input.bossMaxHp));
  return (
    Math.floor(
      (nonNegativeInteger(input.damage) * TRACKING_DAMAGE_THREAT_SCALE) /
        maxHp,
    ) +
    nonNegativeInteger(input.directHits) * TRACKING_DIRECT_HIT_THREAT
  );
}

export function accumulateTrackingThreat(input: {
  current: number;
  gain: number;
}): number {
  return Math.min(
    TRACKING_THREAT_MAX,
    nonNegativeInteger(input.current) + nonNegativeInteger(input.gain),
  );
}

export type TrackingThreatResolution = {
  threat: number;
  triggered: boolean;
};

export function resolveTrackingThreatAfterPlayerAction(input: {
  current: number;
  gain: number;
  bossAlive: boolean;
}): TrackingThreatResolution {
  if (!input.bossAlive) return { threat: 0, triggered: false };
  const total =
    nonNegativeInteger(input.current) + nonNegativeInteger(input.gain);
  if (total < TRACKING_THREAT_MAX) {
    return { threat: total, triggered: false };
  }
  return {
    threat: Math.min(
      TRACKING_THREAT_MAX - 1,
      total - TRACKING_THREAT_MAX,
    ),
    triggered: true,
  };
}
