"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  GuildRaidAttackResult,
  GuildRaidErrorResponse,
  GuildRaidPracticeResult,
  GuildRaidState,
} from "./guildRaidTypes";

function guildRaidRequestId(): string {
  return globalThis.crypto?.randomUUID?.() ??
    `raid-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function postGuildRaidAttack(requestId: string): Promise<Response> {
  return fetch("/api/v2/guild/raid/attack", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requestId }),
  });
}

async function postGuildRaidPractice(): Promise<Response> {
  return fetch("/api/v2/guild/raid/practice", { method: "POST" });
}

export function useGuildRaid() {
  const [state, setState] = useState<GuildRaidState | null>(null);
  const [loading, setLoading] = useState(true);
  const [attacking, setAttacking] = useState(false);
  const [practicing, setPracticing] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastAttack, setLastAttack] = useState<GuildRaidAttackResult | null>(null);
  const [lastPractice, setLastPractice] =
    useState<GuildRaidPracticeResult | null>(null);
  const combatInFlightRef = useRef(false);
  const leaderboardPageRef = useRef(1);
  const recentPageRef = useRef(1);

  const load = useCallback(async ({
    quiet = false,
    leaderboardPage = leaderboardPageRef.current,
    recentPage = recentPageRef.current,
  }: {
    quiet?: boolean;
    leaderboardPage?: number;
    recentPage?: number;
  } = {}) => {
    leaderboardPageRef.current = leaderboardPage;
    recentPageRef.current = recentPage;
    if (!quiet) setLoading(true);
    try {
      const query = new URLSearchParams({
        leaderboardPage: String(leaderboardPage),
        recentPage: String(recentPage),
      });
      const response = await fetch(`/api/v2/guild/raid?${query}`);
      const body = (await response.json().catch(() => null)) as
        | GuildRaidState
        | GuildRaidErrorResponse
        | null;
      if (!response.ok || !body?.ok) {
        if (!quiet) {
          setError(
            body && "error" in body ? body.error ?? "load_failed" : "load_failed",
          );
        }
        return;
      }
      setState(body);
      if (!quiet) setError(null);
    } catch {
      if (!quiet) setError("load_failed");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void load());
    const interval = window.setInterval(() => void load({ quiet: true }), 20_000);
    return () => window.clearInterval(interval);
  }, [load]);

  const attack = useCallback(async () => {
    if (combatInFlightRef.current) return;
    combatInFlightRef.current = true;
    setAttacking(true);
    setError(null);
    setLastAttack(null);
    setLastPractice(null);
    const requestId = guildRaidRequestId();
    try {
      let response: Response;
      try {
        response = await postGuildRaidAttack(requestId);
      } catch {
        // 응답 유실로 결과를 모를 때만 같은 멱등 키로 한 번 재조회한다.
        response = await postGuildRaidAttack(requestId);
      }
      const body = (await response.json().catch(() => null)) as
        | GuildRaidAttackResult
        | GuildRaidErrorResponse
        | null;
      if (!response.ok || !body?.ok) {
        setError(
          body && "error" in body
            ? body.error ?? "attack_failed"
            : "attack_failed",
        );
        await load({ quiet: true });
        return;
      }
      setLastAttack(body);
      await load({ quiet: true });
    } catch {
      setError("attack_failed");
    } finally {
      combatInFlightRef.current = false;
      setAttacking(false);
    }
  }, [load]);

  const practice = useCallback(async () => {
    if (combatInFlightRef.current) return;
    combatInFlightRef.current = true;
    setPracticing(true);
    setError(null);
    setLastAttack(null);
    setLastPractice(null);
    try {
      const response = await postGuildRaidPractice();
      const body = (await response.json().catch(() => null)) as
        | GuildRaidPracticeResult
        | GuildRaidErrorResponse
        | null;
      if (!response.ok || !body?.ok) {
        setError(
          body && "error" in body
            ? body.error ?? "practice_failed"
            : "practice_failed",
        );
        return;
      }
      setLastPractice(body);
    } catch {
      setError("practice_failed");
    } finally {
      combatInFlightRef.current = false;
      setPracticing(false);
    }
  }, []);

  const claim = useCallback(async () => {
    if (claiming) return;
    setClaiming(true);
    setError(null);
    try {
      const response = await fetch("/api/v2/guild/raid/claim", {
        method: "POST",
      });
      const body = (await response.json().catch(() => null)) as
        | GuildRaidErrorResponse
        | { ok: true }
        | null;
      if (!response.ok || !body?.ok) {
        setError(
          body && "error" in body ? body.error ?? "claim_failed" : "claim_failed",
        );
        return;
      }
      await load({ quiet: true });
    } catch {
      setError("claim_failed");
    } finally {
      setClaiming(false);
    }
  }, [claiming, load]);

  return {
    state,
    loading,
    attacking,
    practicing,
    claiming,
    error,
    lastAttack,
    lastPractice,
    load,
    attack,
    practice,
    claim,
    setLeaderboardPage: (page: number) =>
      load({ leaderboardPage: page, recentPage: recentPageRef.current }),
    setRecentPage: (page: number) =>
      load({ leaderboardPage: leaderboardPageRef.current, recentPage: page }),
  };
}
