"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export const AUTO_HUNT_LEVEL_TARGET = 100;

export type AutoHuntStopConfig = {
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

const STORAGE_KEY = "v2-auto-hunt-stop.v1";
const MAX_POTION_THRESHOLD = 9_999_999;

export const DEFAULT_AUTO_HUNT_STOP_CONFIG: AutoHuntStopConfig = {
  potionEnabled: false,
  potionThreshold: 100,
  rareMapEnabled: false,
  level100Enabled: false,
};

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

function loadAutoHuntStopConfig(): AutoHuntStopConfig {
  if (typeof window === "undefined") return DEFAULT_AUTO_HUNT_STOP_CONFIG;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw
      ? normalizeAutoHuntStopConfig(JSON.parse(raw))
      : DEFAULT_AUTO_HUNT_STOP_CONFIG;
  } catch {
    return DEFAULT_AUTO_HUNT_STOP_CONFIG;
  }
}

function saveAutoHuntStopConfig(config: AutoHuntStopConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {}
}

export function useAutoHuntStopConfig() {
  const [config, setConfig] = useState<AutoHuntStopConfig>(
    DEFAULT_AUTO_HUNT_STOP_CONFIG,
  );
  const [hydrated, setHydrated] = useState(false);
  const configRef = useRef(config);

  useEffect(() => {
    const loaded = loadAutoHuntStopConfig();
    configRef.current = loaded;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage 클라이언트 하이드레이션
    setConfig(loaded);
    setHydrated(true);
  }, []);

  useEffect(() => {
    configRef.current = config;
    if (hydrated) saveAutoHuntStopConfig(config);
  }, [config, hydrated]);

  const updateConfig = useCallback((patch: Partial<AutoHuntStopConfig>) => {
    const next = normalizeAutoHuntStopConfig({
      ...configRef.current,
      ...patch,
    });
    configRef.current = next;
    setConfig(next);
  }, []);

  return { config, configRef, updateConfig };
}
