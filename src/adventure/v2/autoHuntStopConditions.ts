"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_AUTO_HUNT_STOP_CONFIG,
  normalizeAutoHuntStopConfig,
  type AutoHuntStopConfig,
} from "@/adventure/v2/autoHuntStopPolicy";
export {
  AUTO_HUNT_LEVEL_TARGET,
  DEFAULT_AUTO_HUNT_STOP_CONFIG,
  getAutoHuntStopReason,
  normalizeAutoHuntStopConfig,
  type AutoHuntStopConfig,
  type AutoHuntStopReason,
  type AutoHuntStopSnapshot,
} from "@/adventure/v2/autoHuntStopPolicy";

const STORAGE_KEY = "v2-auto-hunt-stop.v1";

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
