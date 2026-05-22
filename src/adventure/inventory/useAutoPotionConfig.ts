"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type AutoUseTrigger = { kind: "hp_below_pct"; pct: number };

// 1차에는 HP 회복 카테고리만. 버프 등 추가될 때 union으로 확장.
export type AutoPotionTarget = "hp_heal";

export type AutoPotionRule = {
  enabled: boolean;
  target: AutoPotionTarget;
  trigger: AutoUseTrigger;
};

export type AutoPotionConfig = { rules: AutoPotionRule[] };

const STORAGE_KEY = "auto-potion-rules.v2";

export const defaultAutoPotionConfig = (): AutoPotionConfig => ({
  rules: [
    {
      enabled: false,
      target: "hp_heal",
      trigger: { kind: "hp_below_pct", pct: 50 },
    },
  ],
});

// 기존 (potionId 기반) 룰도 target 으로 마이그레이션 — potionId는 무시.
function load(): AutoPotionConfig {
  if (typeof window === "undefined") return defaultAutoPotionConfig();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultAutoPotionConfig();
    const parsed = JSON.parse(raw) as { rules?: unknown } | null;
    if (!Array.isArray(parsed?.rules)) return defaultAutoPotionConfig();
    const rules: AutoPotionRule[] = parsed.rules
      .map((r): AutoPotionRule | null => {
        if (!r || typeof r !== "object") return null;
        const obj = r as Record<string, unknown>;
        const trigger = obj.trigger as AutoUseTrigger | undefined;
        if (!trigger || trigger.kind !== "hp_below_pct") return null;
        return {
          enabled: !!obj.enabled,
          target: "hp_heal",
          trigger: {
            kind: "hp_below_pct",
            pct: typeof trigger.pct === "number" ? trigger.pct : 50,
          },
        };
      })
      .filter((r): r is AutoPotionRule => r !== null);
    if (rules.length === 0) return defaultAutoPotionConfig();
    return { rules };
  } catch {
    return defaultAutoPotionConfig();
  }
}

function save(config: AutoPotionConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {}
}

export function useAutoPotionConfig() {
  const [config, setConfig] = useState<AutoPotionConfig>(
    defaultAutoPotionConfig,
  );
  const [hydrated, setHydrated] = useState(false);
  const configRef = useRef<AutoPotionConfig>(defaultAutoPotionConfig());

  useEffect(() => {
    const loaded = load();
    configRef.current = loaded;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConfig(loaded);
    setHydrated(true);
  }, []);

  useEffect(() => {
    configRef.current = config;
    if (!hydrated) return;
    save(config);
  }, [hydrated, config]);

  const updateRule = useCallback(
    (index: number, patch: Partial<AutoPotionRule>) => {
      const cur = configRef.current;
      if (index < 0 || index >= cur.rules.length) return;
      const nextRules = cur.rules.map((r, i) =>
        i === index ? { ...r, ...patch } : r,
      );
      const next: AutoPotionConfig = { rules: nextRules };
      configRef.current = next;
      setConfig(next);
    },
    [],
  );

  return { config, configRef, hydrated, updateRule };
}
