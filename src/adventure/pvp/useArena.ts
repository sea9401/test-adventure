"use client";

// /api/pvp/status 페이지 데이터 fetch + 도전 mutation. ArenaView 에서 사용.

import { useCallback, useEffect, useState } from "react";
import { useAsyncData } from "@/lib/useAsyncData";
import type { BattleLogEntry } from "@/adventure/battle/engine";

export type MatchDetail = {
  id: number;
  createdAt: string;
  iAmAttacker: boolean;
  opponent: { userId: string; name: string; isBot: boolean };
  myOutcome: "win" | "loss" | "draw";
  ratingBefore: number;
  ratingAfter: number;
  ratingDelta: number;
  log: BattleLogEntry[];
};

export type ArenaStatsResponse = {
  seasonId: string;
  timeline: { id: number; createdAt: string; ratingAfter: number }[];
  peak: { rating: number; at: string } | null;
  currentStreak: {
    kind: "win" | "loss" | "draw" | "none";
    count: number;
  };
  frequentOpponents: {
    userId: string;
    name: string;
    isBot: boolean;
    matches: number;
    wins: number;
    losses: number;
    draws: number;
  }[];
};

export type ArenaSeason = {
  id: string;
  startAt: string;
  endAt: string;
};

export type ArenaMe = {
  rating: number;
  wins: number;
  losses: number;
  draws: number;
  /** 투기장 코인 잔액 (영속). */
  coins: number;
  /** 이미 보유한 상점 칭호 id — 상점에서 "보유" 표시/구매 비활성. */
  ownedShopTitleIds: string[];
};

export type ArenaLeaderboardEntry = {
  rank: number;
  userId: string;
  name: string;
  rating: number;
  wins: number;
  losses: number;
  draws: number;
  mine: boolean;
};

export type ArenaRecentMatch = {
  id: number;
  createdAt: string;
  iAmAttacker: boolean;
  opponent: { userId: string; name: string; isBot: boolean };
  myOutcome: "win" | "loss" | "draw";
  ratingBefore: number;
  ratingAfter: number;
  ratingDelta: number;
};

export type ArenaStatusResponse = {
  season: ArenaSeason;
  me: ArenaMe;
  // 쿨다운 중이면 다음 도전 가능 시각 (ISO), 아니면 null. 서버가 권위.
  nextChallengeAt: string | null;
  top: ArenaLeaderboardEntry[];
  recent: ArenaRecentMatch[];
};

// 도전 직후 / 429 응답으로 setNextChallengeAt 을 받았을 때 화면에 즉시 반영하기 위해
// 클라이언트 로컬로도 미러. status refetch 가 끝나면 그쪽 값이 권위.
const CHALLENGE_COOLDOWN_MS = 60_000;

export type ChallengeResponse = {
  seasonId: string;
  outcome: "a_win" | "d_win" | "draw";
  turns: number;
  /** 이번 매치 지급 코인(일일 캡 반영) + 지급 후 총 잔액. */
  coinsAwarded: number;
  coinBalance: number;
  me: { name: string; ratingBefore: number; ratingAfter: number };
  opponent: {
    userId: string;
    name: string;
    ratingBefore: number;
    ratingAfter: number;
    isBot: boolean;
  };
  log: BattleLogEntry[];
};

async function getJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()) as T;
}

export function useArena() {
  const { data, loading, error, refetch } = useAsyncData<ArenaStatusResponse>(
    (signal) => getJson("/api/pvp/status", signal),
    [],
    { errorMessage: "아레나 정보를 불러오지 못했습니다." },
  );

  const [challenging, setChallenging] = useState(false);
  const [challengeError, setChallengeError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<ChallengeResponse | null>(null);
  // 로컬 쿨다운 미러 — 서버 status 의 nextChallengeAt 또는 도전 직후 set.
  // 서버가 권위지만, status refetch 가 끝나기 전에도 UI 가 즉시 잠기도록.
  const [localCooldownUntil, setLocalCooldownUntil] = useState<number | null>(
    null,
  );

  const serverNext = data?.nextChallengeAt
    ? new Date(data.nextChallengeAt).getTime()
    : null;
  const cooldownUntil =
    Math.max(serverNext ?? 0, localCooldownUntil ?? 0) || null;

  // 1초마다 tick — 쿨다운이 활성일 때만.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!cooldownUntil || cooldownUntil <= Date.now()) return;
    const id = setInterval(() => setTick((t) => t + 1), 500);
    return () => clearInterval(id);
  }, [cooldownUntil]);

  const msLeft = cooldownUntil ? Math.max(0, cooldownUntil - Date.now()) : 0;
  const onCooldown = msLeft > 0;

  const challenge = useCallback(async (): Promise<ChallengeResponse | null> => {
    setChallenging(true);
    setChallengeError(null);
    try {
      const r = await fetch("/api/pvp/challenge", { method: "POST" });
      if (r.status === 429) {
        const body = (await r.json().catch(() => null)) as {
          nextChallengeAt?: string;
        } | null;
        if (body?.nextChallengeAt) {
          setLocalCooldownUntil(new Date(body.nextChallengeAt).getTime());
        }
        setChallengeError("아직 쿨다운 중이에요.");
        return null;
      }
      if (!r.ok) {
        const body = await r.text().catch(() => "");
        const msg =
          r.status === 503
            ? "도전 가능한 상대를 찾지 못했어요."
            : r.status === 400
              ? "내 캐릭터 정보를 읽을 수 없어요."
              : `도전 실패 (HTTP ${r.status}${body ? `: ${body}` : ""})`;
        setChallengeError(msg);
        return null;
      }
      const result = (await r.json()) as ChallengeResponse;
      setLastResult(result);
      // 도전 성공 → 60초 쿨다운 즉시 잠금 (status refetch 가 같은 값을 곧 덮어씀).
      setLocalCooldownUntil(Date.now() + CHALLENGE_COOLDOWN_MS);
      refetch();
      return result;
    } catch (e) {
      setChallengeError(e instanceof Error ? e.message : "도전 실패");
      return null;
    } finally {
      setChallenging(false);
    }
  }, [refetch]);

  const [buyingTitleId, setBuyingTitleId] = useState<string | null>(null);
  const [buyError, setBuyError] = useState<string | null>(null);

  const buyTitle = useCallback(
    async (titleId: string): Promise<boolean> => {
      setBuyingTitleId(titleId);
      setBuyError(null);
      try {
        const r = await fetch("/api/pvp/shop", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ titleId }),
        });
        if (r.ok) {
          await refetch();
          return true;
        }
        const msg =
          r.status === 402
            ? "투기장 코인이 부족해요."
            : r.status === 409
              ? "이미 보유한 칭호예요."
              : `구매 실패 (HTTP ${r.status})`;
        setBuyError(msg);
        if (r.status === 409) await refetch(); // 보유 상태 동기화
        return false;
      } catch (e) {
        setBuyError(e instanceof Error ? e.message : "구매 실패");
        return false;
      } finally {
        setBuyingTitleId(null);
      }
    },
    [refetch],
  );

  return {
    status: data,
    loading,
    error,
    refetch,
    challenge,
    challenging,
    challengeError,
    lastResult,
    clearLastResult: () => setLastResult(null),
    onCooldown,
    cooldownSecondsLeft: Math.ceil(msLeft / 1000),
    buyTitle,
    buyingTitleId,
    buyError,
  };
}

// 통계 탭 lazy fetch — 탭 처음 진입 시에만 호출. 다른 탭만 보면 평소 0 추가 요청.
// useAsyncData 를 안 쓰는 이유: 마운트 시점이 곧 fetch 시점이라야 lazy 가 성립하는데,
// useArena 안에 두면 페이지 진입 즉시 호출. StatsView 컴포넌트 안에서만 마운트되게.
export function useArenaStats(): {
  stats: ArenaStatsResponse | null;
  loading: boolean;
  error: string | null;
} {
  const [stats, setStats] = useState<ArenaStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch("/api/pvp/stats", { signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as ArenaStatsResponse;
      })
      .then((d) => {
        if (!cancelled) setStats(d);
      })
      .catch((e) => {
        if (cancelled || e?.name === "AbortError") return;
        setError(e instanceof Error ? e.message : "로드 실패");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  return { stats, loading, error };
}

// 단일 매치 로그 lazy fetch — 전투기록 탭에서 매치를 펼쳤을 때만 호출.
// 펼친 매치마다 독립 hook 인스턴스이므로 컴포넌트 unmount 시 자동 정리.
// 같은 컴포넌트 안에서 닫았다가 다시 열면 state 가 살아있어 재요청 없음.
export function useMatchLog(matchId: number): {
  log: BattleLogEntry[] | null;
  loading: boolean;
  error: string | null;
} {
  const [log, setLog] = useState<BattleLogEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/pvp/matches/${matchId}`, { signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as MatchDetail;
      })
      .then((d) => {
        if (cancelled) return;
        setLog(d.log);
      })
      .catch((e) => {
        if (cancelled || e?.name === "AbortError") return;
        setError(e instanceof Error ? e.message : "로드 실패");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [matchId]);

  return { log, loading, error };
}
