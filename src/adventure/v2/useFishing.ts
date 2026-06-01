"use client";

import { useCallback } from "react";
import type {
  CastOutcome,
  FishingHandlers,
  ReelOutcome,
} from "./FishingView";

// 실게임용 cast/reel — /api/v2/fishing/* 권위 라우트 래퍼. FishingView 에 주입한다.
export function useFishing(): FishingHandlers {
  const cast = useCallback(async (): Promise<CastOutcome> => {
    const res = await fetch("/api/v2/fishing/cast", { method: "POST" });
    if (!res.ok) throw new Error("cast_failed");
    const j = await res.json();
    if (!j?.ok || typeof j.castId !== "string" || typeof j.biteDelayMs !== "number") {
      throw new Error("cast_failed");
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
        };
      }
      return {
        caught: false,
        reason: typeof j.reason === "string" ? j.reason : "unknown",
      };
    },
    [],
  );

  return { cast, reel };
}
