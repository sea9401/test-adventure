"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  CastOutcome,
  FishingDailyCatchCoins,
  FishingHandlers,
  ReelOutcome,
} from "./FishingView";

function parseDailyCatchCoins(value: unknown): FishingDailyCatchCoins | undefined {
  if (!value || typeof value !== "object") return undefined;
  const v = value as { earned?: unknown; cap?: unknown };
  const earned = Number(v.earned ?? 0);
  const cap = Number(v.cap ?? 0);
  if (!Number.isFinite(earned) || !Number.isFinite(cap) || cap <= 0) {
    return undefined;
  }
  return {
    earned: Math.max(0, Math.floor(earned)),
    cap: Math.max(0, Math.floor(cap)),
  };
}

// 실게임용 cast/reel — /api/v2/fishing/* 권위 라우트 래퍼. FishingView 에 주입한다.
export function useFishing(): FishingHandlers {
  const [dailyCatchCoins, setDailyCatchCoins] =
    useState<FishingDailyCatchCoins | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const res = await fetch("/api/v2/fishing/status");
        if (!res.ok) return;
        const j = await res.json();
        if (!alive || !j?.ok) return;
        const next = parseDailyCatchCoins(j.dailyCatchCoins);
        if (next) setDailyCatchCoins(next);
      } catch {
        // 표시용 상태라 실패해도 낚시 자체는 막지 않는다.
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const cast = useCallback(async (): Promise<CastOutcome> => {
    const res = await fetch("/api/v2/fishing/cast", { method: "POST" });
    if (!res.ok) throw new Error("cast_failed");
    const j = await res.json();
    if (!j?.ok || typeof j.castId !== "string" || typeof j.biteDelayMs !== "number") {
      throw new Error("cast_failed");
    }
    const nextDailyCatchCoins = parseDailyCatchCoins(j.dailyCatchCoins);
    if (nextDailyCatchCoins) setDailyCatchCoins(nextDailyCatchCoins);
    return {
      castId: j.castId,
      biteDelayMs: j.biteDelayMs,
      dailyCatchCoins: nextDailyCatchCoins,
    };
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
      const nextDailyCatchCoins = parseDailyCatchCoins(j.dailyCatchCoins);
      if (nextDailyCatchCoins) setDailyCatchCoins(nextDailyCatchCoins);
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
          coinsGained: Number(j.coinsGained ?? 0),
          dailyCatchCoins: nextDailyCatchCoins,
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
          coopBoss:
            j.coopBoss && typeof j.coopBoss === "object"
              ? {
                  sessionId: String(j.coopBoss.sessionId),
                  kind: String(j.coopBoss.kind),
                  name: String(j.coopBoss.name),
                  expiresAt: Number(j.coopBoss.expiresAt ?? 0),
                }
              : null,
        };
      }
      return {
        caught: false,
        reason: typeof j.reason === "string" ? j.reason : "unknown",
      };
    },
    [],
  );

  return { cast, reel, dailyCatchCoins };
}
