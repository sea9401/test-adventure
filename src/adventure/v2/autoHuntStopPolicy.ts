export const AUTO_HUNT_LEVEL_TARGET = 100;

export type AutoHuntStopConfig = {
  hpPotionTargetPct: number;
  mpPotionTargetPct: number;
  potionEnabled: boolean;
  potionThreshold: number;
  rareMapEnabled: boolean;
  level100Enabled: boolean;
};

export type AutoHuntStopReason = "potion" | "rare_map" | "level_100";

export type AutoHuntStopSnapshot = {
  hpCharges: number;
  mpCharges: number;
  hasMp: boolean;
  rareMapFound: boolean;
  level: number;
};

const MAX_POTION_THRESHOLD = 9_999_999;

export const DEFAULT_AUTO_HUNT_STOP_CONFIG: AutoHuntStopConfig = {
  hpPotionTargetPct: 100,
  mpPotionTargetPct: 100,
  potionEnabled: false,
  potionThreshold: 100,
  rareMapEnabled: false,
  level100Enabled: false,
};

function normalizePotionTargetPct(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_AUTO_HUNT_STOP_CONFIG.hpPotionTargetPct;
  }
  return Math.min(100, Math.max(0, Math.floor(value)));
}

function normalizePotionThreshold(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_AUTO_HUNT_STOP_CONFIG.potionThreshold;
  }
  return Math.min(MAX_POTION_THRESHOLD, Math.max(0, Math.floor(value)));
}

export function normalizeAutoHuntStopConfig(
  value: unknown,
): AutoHuntStopConfig {
  if (!value || typeof value !== "object") {
    return DEFAULT_AUTO_HUNT_STOP_CONFIG;
  }
  const raw = value as Partial<Record<keyof AutoHuntStopConfig, unknown>>;
  return {
    hpPotionTargetPct: normalizePotionTargetPct(raw.hpPotionTargetPct),
    mpPotionTargetPct: normalizePotionTargetPct(raw.mpPotionTargetPct),
    potionEnabled: raw.potionEnabled === true,
    potionThreshold: normalizePotionThreshold(raw.potionThreshold),
    rareMapEnabled: raw.rareMapEnabled === true,
    level100Enabled: raw.level100Enabled === true,
  };
}

export function getAutoHuntStopReason(
  config: AutoHuntStopConfig,
  snapshot: AutoHuntStopSnapshot,
): AutoHuntStopReason | null {
  if (config.rareMapEnabled && snapshot.rareMapFound) return "rare_map";
  if (config.level100Enabled && snapshot.level >= AUTO_HUNT_LEVEL_TARGET) {
    return "level_100";
  }
  if (
    config.potionEnabled &&
    (snapshot.hpCharges <= config.potionThreshold ||
      (snapshot.hasMp && snapshot.mpCharges <= config.potionThreshold))
  ) {
    return "potion";
  }
  return null;
}
