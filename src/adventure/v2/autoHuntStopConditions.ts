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
const SETTINGS_ENDPOINT = "/api/v2/me/auto-hunt-settings";

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

async function persistAutoHuntStopConfig(
  config: AutoHuntStopConfig,
): Promise<void> {
  await fetch(SETTINGS_ENDPOINT, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ config }),
  }).catch(() => undefined);
}

export function useAutoHuntStopConfig() {
  const [config, setConfig] = useState<AutoHuntStopConfig>(
    DEFAULT_AUTO_HUNT_STOP_CONFIG,
  );
  const [hydrated, setHydrated] = useState(false);
  const configRef = useRef(config);
  const updatedLocallyRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const localConfig = loadAutoHuntStopConfig();
    configRef.current = localConfig;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage 클라이언트 하이드레이션
    setConfig(localConfig);
    setHydrated(true);

    void fetch(SETTINGS_ENDPOINT, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as { config?: unknown };
      })
      .then((payload) => {
        if (cancelled || payload == null) return;
        if (payload.config == null) {
          void persistAutoHuntStopConfig(configRef.current);
          return;
        }
        if (updatedLocallyRef.current) return;
        const serverConfig = normalizeAutoHuntStopConfig(payload.config);
        configRef.current = serverConfig;
        saveAutoHuntStopConfig(serverConfig);
        setConfig(serverConfig);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
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
    updatedLocallyRef.current = true;
    configRef.current = next;
    saveAutoHuntStopConfig(next);
    setConfig(next);
    void persistAutoHuntStopConfig(next);
  }, []);

  return { config, configRef, updateConfig };
}
