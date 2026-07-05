"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  countClaimableFishingTasks,
  type FishingProgressNotice,
} from "./fishingChallengeProgress";
import { useSingleFlightGuard } from "@/lib/useSingleFlight";
import type { FishingProgressionView } from "./fishingProgression";
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
  const [progression, setProgression] =
    useState<FishingProgressionView | null>(null);
  const [progressionLoading, setProgressionLoading] = useState(true);
  const [challengeBadgeCount, setChallengeBadgeCount] = useState(0);
  const mounted = useRef(true);
  const beginCast = useSingleFlightGuard();
  const beginReel = useSingleFlightGuard();

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
    fetch("/api/v2/fishing/challenges")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!mounted.current || !j?.ok) return;
        setChallengeBadgeCount(
          countClaimableFishingTasks([
            Array.isArray(j.contracts) ? j.contracts : [],
            Array.isArray(j.challenges) ? j.challenges : [],
            Array.isArray(j.goals) ? j.goals : [],
          ]),
        );
      })
      .catch(() => {
        // 배지는 보조 정보다. 실패해도 낚시 자체를 막지 않는다.
      });
    fetch("/api/v2/fishing/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!mounted.current || !j?.ok) return;
        const next = parseDailyCatchCoins(j.dailyCatchCoins);
        if (next) setDailyCatchCoins(next);
      })
      .catch(() => {
        // 표시용 상태라 실패해도 낚시 자체는 막지 않는다.
      });
    return () => {
      mounted.current = false;
    };
  }, []);

  const cast = useCallback(async (): Promise<CastOutcome> => {
    const release = beginCast();
    if (!release) throw new Error("cast_in_progress");
    try {
      const res = await fetch("/api/v2/fishing/cast", { method: "POST" });
      if (!res.ok) throw new Error("cast_failed");
      const j = await res.json();
      if (
        !j?.ok ||
        typeof j.castId !== "string" ||
        typeof j.biteDelayMs !== "number"
      ) {
        throw new Error("cast_failed");
      }
      if (j.progression && typeof j.progression === "object") {
        setProgression(j.progression as FishingProgressionView);
      }
      const nextDailyCatchCoins = parseDailyCatchCoins(j.dailyCatchCoins);
      if (nextDailyCatchCoins) setDailyCatchCoins(nextDailyCatchCoins);
      return {
        castId: j.castId,
        biteDelayMs: j.biteDelayMs,
        dailyCatchCoins: nextDailyCatchCoins,
      };
    } finally {
      release();
    }
  }, [beginCast]);

  const reel = useCallback(
    async (castId: string, reactionMs: number): Promise<ReelOutcome> => {
      const release = beginReel();
      if (!release) throw new Error("reel_in_progress");
      try {
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
          if (j.progression && typeof j.progression === "object") {
            setProgression(j.progression as FishingProgressionView);
          }
          if (typeof j.challengeClaimableCount === "number") {
            setChallengeBadgeCount(
              Math.max(0, Math.floor(j.challengeClaimableCount)),
            );
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
            dailyCatchCoins: nextDailyCatchCoins,
            levelRewardCoins: Number(j.levelRewardCoins ?? 0),
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
            hotTime:
              j.hotTime && typeof j.hotTime === "object"
                ? {
                    title: String(j.hotTime.title ?? ""),
                    fishingCoinPct: Number(j.hotTime.fishingCoinPct ?? 0),
                    catchBonus: Number(j.hotTime.catchBonus ?? 0),
                    levelBonus: Number(j.hotTime.levelBonus ?? 0),
                  }
                : null,
            coopBoss:
              j.coopBoss && typeof j.coopBoss === "object"
                ? {
                    sessionId: String(j.coopBoss.sessionId),
                    kind: String(j.coopBoss.kind),
                    name: String(j.coopBoss.name),
                    expiresAt: Number(j.coopBoss.expiresAt ?? 0),
                  }
                : null,
            fishingXpGained: Number(j.fishingXpGained ?? 0),
            fishingLevel:
              typeof j.fishingLevel === "number" ? j.fishingLevel : undefined,
            fishingLevelUp: Boolean(j.fishingLevelUp),
            fishingCatches:
              typeof j.fishingCatches === "number" ? j.fishingCatches : undefined,
            challengeProgress: parseFishingProgressNotices(j.challengeProgress),
          };
        }
        return {
          caught: false,
          reason: typeof j.reason === "string" ? j.reason : "unknown",
        };
      } finally {
        release();
      }
    },
    [beginReel],
  );

  return {
    cast,
    reel,
    dailyCatchCoins,
    progression,
    progressionLoading,
    challengeBadgeCount,
  };
}

function parseFishingProgressNotices(raw: unknown): FishingProgressNotice[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item): FishingProgressNotice[] => {
    if (!item || typeof item !== "object") return [];
    const r = item as Record<string, unknown>;
    const kind = r.kind;
    if (kind !== "contract" && kind !== "daily" && kind !== "goal") return [];
    if (typeof r.id !== "string" || typeof r.title !== "string") return [];
    const progress = Number(r.progress);
    const goal = Number(r.goal);
    const delta = Number(r.delta);
    if (
      !Number.isFinite(progress) ||
      !Number.isFinite(goal) ||
      !Number.isFinite(delta)
    ) {
      return [];
    }
    return [
      {
        kind,
        id: r.id,
        title: r.title,
        progress: Math.max(0, Math.floor(progress)),
        goal: Math.max(1, Math.floor(goal)),
        delta: Math.max(0, Math.floor(delta)),
        justCompleted: Boolean(r.justCompleted),
        claimable: Boolean(r.claimable),
      },
    ];
  });
}
