import { RARE_MAP_CAP } from "@/adventure/data/v2/rareMaps";

export const AUTO_HUNT_LEVEL_TARGET = 100;
export const AUTO_HUNT_STOP_SAVE_KEY = "auto-hunt-stop-config.v1";

export type AutoHuntStopConfig = {
  hpPotionTargetPct: number;
  mpPotionTargetPct: number;
  potionEnabled: boolean;
  potionThreshold: number;
  rareMapEnabled: boolean;
  // 보유 레어맵(희귀 장소 포함)이 보유 한도에 닿으면 정지 — 가득 차면 새 지도 굴림이 생략된다.
  rareMapFullEnabled: boolean;
  level100Enabled: boolean;
};

export type AutoHuntStopReason = "potion" | "rare_map" | "rare_map_full" | "level_100";

export type AutoHuntStopSnapshot = {
  hpCharges: number;
  mpCharges: number;
  hasMp: boolean;
  rareMapFound: boolean;
  /** 전투 후 보유 중인 레어맵 수(종류 무관). 알 수 없으면 0. */
  rareMapCount: number;
  level: number;
};

const MAX_POTION_THRESHOLD = 9_999_999;

export const DEFAULT_AUTO_HUNT_STOP_CONFIG: AutoHuntStopConfig = {
  hpPotionTargetPct: 100,
  mpPotionTargetPct: 100,
  potionEnabled: false,
  potionThreshold: 100,
  rareMapEnabled: false,
  rareMapFullEnabled: false,
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
    rareMapFullEnabled: raw.rareMapFullEnabled === true,
    level100Enabled: raw.level100Enabled === true,
  };
}

export function getAutoHuntStopReason(
  config: AutoHuntStopConfig,
  snapshot: AutoHuntStopSnapshot,
): AutoHuntStopReason | null {
  if (config.rareMapEnabled && snapshot.rareMapFound) return "rare_map";
  if (config.rareMapFullEnabled && snapshot.rareMapCount >= RARE_MAP_CAP) {
    return "rare_map_full";
  }
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
