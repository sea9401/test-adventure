"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FishingDailyView } from "@/adventure/data/v2/fishingDailyChallenges";

export type FishingChallengesState = {
  challenges: FishingDailyView[];
  coins: number;
  nextResetAt: number;
};

export type ClaimResult = { ok: boolean; message: string };

const CLAIM_ERR: Record<string, string> = {
  already_claimed: "이미 받은 보상이다.",
  not_complete: "아직 완료하지 않았다.",
  unknown_challenge: "알 수 없는 도전이다.",
  unauthorized: "로그인이 필요하다.",
};

// 오늘의 낚시 도전 — 마운트 시 진행/코인 fetch, 수령(claim) 후 갱신. FishingDailyChallengePanel 이 주입.
export function useFishingDailyChallenge() {
  const [state, setState] = useState<FishingChallengesState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [claiming, setClaiming] = useState<string | null>(null);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/v2/fishing/challenges");
      const j = r.ok ? await r.json() : null;
      if (!mounted.current) return;
      if (j?.ok) {
        setState({
          challenges: j.challenges,
          coins: j.coins,
          nextResetAt: j.nextResetAt,
        });
        setError(null);
      } else {
        setError("도전 과제를 불러오지 못했다.");
      }
    } catch {
      if (mounted.current) setError("도전 과제를 불러오지 못했다.");
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
    };
  }, [load]);

  const claim = useCallback(
    async (id: string): Promise<ClaimResult> => {
      setClaiming(id);
      try {
        const r = await fetch("/api/v2/fishing/challenges/claim", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id }),
        });
        const j = await r.json().catch(() => null);
        if (r.ok && j?.ok) {
          await load();
          return { ok: true, message: `낚시 코인 ${j.reward}개를 받았다.` };
        }
        return { ok: false, message: CLAIM_ERR[j?.error] ?? "수령하지 못했다." };
      } catch {
        return { ok: false, message: "수령하지 못했다." };
      } finally {
        if (mounted.current) setClaiming(null);
      }
    },
    [load],
  );

  return { state, loading, error, claiming, claim };
}
