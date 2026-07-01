"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FishingProgressionView } from "./fishingProgression";
import type {
  CastOutcome,
  FishingHandlers,
  ReelOutcome,
} from "./FishingView";

// 실게임용 cast/reel — /api/v2/fishing/* 권위 라우트 래퍼. FishingView 에 주입한다.
export function useFishing(): FishingHandlers {
  const [progression, setProgression] =
    useState<FishingProgressionView | null>(null);
  const [progressionLoading, setProgressionLoading] = useState(true);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    fetch("/api/v2/fishing/progression")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!mounted.current) return;
        if (j?.ok && j.progression && typeof j.progression === "object") {
          setProgression(j.progression as FishingProgressionView);
        }
      })
      .finally(() => {
        if (mounted.current) setProgressionLoading(false);
      });
    return () => {
      mounted.current = false;
    };
  }, []);

  const cast = useCallback(async (): Promise<CastOutcome> => {
    const res = await fetch("/api/v2/fishing/cast", { method: "POST" });
    if (!res.ok) throw new Error("cast_failed");
    const j = await res.json();
    if (!j?.ok || typeof j.castId !== "string" || typeof j.biteDelayMs !== "number") {
      throw new Error("cast_failed");
    }
    if (j.progression && typeof j.progression === "object") {
      setProgression(j.progression as FishingProgressionView);
    }
    return { castId: j.castId, biteDelayMs: j.biteDelayMs };
  }, []);

  const reel = useCallback(
    async (castId: string, reactionMs: number): Promise<ReelOutcome> => {
      const res = await fetch("/api/v2/fishing/reel", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ castId, reactionMs }),
      });
      if (!res.ok) throw new Error("reel_failed");
      const j = await res.json();
      if (!j?.ok) throw new Error("reel_failed");
      if (j.caught) {
        if (j.progression && typeof j.progression === "object") {
          setProgression(j.progression as FishingProgressionView);
        }
        return {
          caught: true,
          fishId: String(j.fishId),
          name: String(j.name),
          tier: j.tier,
          size: Number(j.size),
          isNewSpecies: Boolean(j.isNewSpecies),
          isPersonalBest: Boolean(j.isPersonalBest),
          prevBest: Number(j.prevBest ?? 0),
          codexCount: Number(j.codexCount ?? 0),
          coinsGained: Number(j.coinsGained ?? 0),
          special:
            j.special && typeof j.special === "object"
              ? {
                  id: String(j.special.id),
                  label: String(j.special.label),
                  emoji: String(j.special.emoji),
                }
              : null,
          streak:
            j.streak && typeof j.streak === "object"
              ? {
                  current: Number(j.streak.current ?? 0),
                  best: Number(j.streak.best ?? 0),
                  buffTier: Number(j.streak.buffTier ?? 0),
                  coinBonus: Number(j.streak.coinBonus ?? 0),
                  fragmentChanceBonusPct: Number(
                    j.streak.fragmentChanceBonusPct ?? 0,
                  ),
                }
              : undefined,
          fishingXpGained: Number(j.fishingXpGained ?? 0),
          fishingLevel:
            typeof j.fishingLevel === "number" ? j.fishingLevel : undefined,
          fishingLevelUp: Boolean(j.fishingLevelUp),
          fishingCatches:
            typeof j.fishingCatches === "number" ? j.fishingCatches : undefined,
        };
      }
      return {
        caught: false,
        reason: typeof j.reason === "string" ? j.reason : "unknown",
      };
    },
    [],
  );

  return { cast, reel, progression, progressionLoading };
}
