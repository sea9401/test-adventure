"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Avatar } from "@/adventure/profile/avatars";
import type { ProfileBorderId } from "@/adventure/data/v2/museunCosmetics";
import type { ReplayPayload } from "@/adventure/data/v2/replayPayload";

export type FriendlySparringTarget = {
  name: string;
  level: number;
  avatar: Avatar;
  profileBorder: ProfileBorderId | null;
};

export type FriendlySparringResult = {
  outcome: "win" | "loss" | "draw";
  turns: number;
  opponent: { name: string; level: number };
  replay: ReplayPayload;
  startPlayerHp: number;
  cooldownMs: number;
};

type ApiResponse = {
  ok?: boolean;
  error?: string;
  retryAfterSec?: number;
  target?: FriendlySparringTarget;
  result?: FriendlySparringResult;
};

function friendlyErrorText(error: string | undefined): string {
  if (error === "no_character") {
    return "내 캐릭터 정보를 불러올 수 없습니다.";
  }
  if (error === "cooldown") {
    return "아직 친선전 재대기 시간입니다.";
  }
  if (error === "rate_limited") {
    return "요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요.";
  }
  if (error === "unauthorized") return "로그인이 필요합니다.";
  if (error === "bad_request") return "닉네임을 정확히 입력해 주세요.";
  return "상대를 찾을 수 없습니다.";
}

export function useFriendlySparring(initialTargetName?: string) {
  const [query, setQuery] = useState(initialTargetName ?? "");
  const [target, setTarget] = useState<FriendlySparringTarget | null>(null);
  const [result, setResult] = useState<FriendlySparringResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const searchInFlight = useRef(false);
  const fightInFlight = useRef(false);
  const initialSearchStarted = useRef(false);

  const search = useCallback(async (rawName?: string) => {
    const name = (rawName ?? query).trim();
    if (!name || searchInFlight.current) {
      if (!name) setError("닉네임을 정확히 입력해 주세요.");
      return false;
    }
    searchInFlight.current = true;
    setSearching(true);
    setError(null);
    setTarget(null);
    setResult(null);
    try {
      const response = await fetch(
        `/api/v2/training/friendly?name=${encodeURIComponent(name)}`,
      );
      const json = (await response.json().catch(() => null)) as ApiResponse | null;
      if (!json?.ok || !json.target) {
        setError(friendlyErrorText(json?.error));
        return false;
      }
      setQuery(json.target.name);
      setTarget(json.target);
      return true;
    } catch {
      setError("네트워크 오류가 발생했습니다.");
      return false;
    } finally {
      searchInFlight.current = false;
      setSearching(false);
    }
  }, [query]);

  const fight = useCallback(async () => {
    if (!target || fightInFlight.current) return false;
    fightInFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/v2/training/friendly", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targetName: target.name }),
      });
      const json = (await response.json().catch(() => null)) as ApiResponse | null;
      if (!json?.ok || !json.result) {
        if (json?.error === "cooldown") {
          const waitMs = Math.max(1, json.retryAfterSec ?? 10) * 1_000;
          setNowMs(Date.now());
          setCooldownUntil(Date.now() + waitMs);
        } else if (json?.error === "target_not_found") {
          setTarget(null);
        }
        setError(friendlyErrorText(json?.error));
        return false;
      }
      setResult(json.result);
      setNowMs(Date.now());
      setCooldownUntil(Date.now() + json.result.cooldownMs);
      return true;
    } catch {
      setError("네트워크 오류가 발생했습니다.");
      return false;
    } finally {
      fightInFlight.current = false;
      setBusy(false);
    }
  }, [target]);

  useEffect(() => {
    if (!initialTargetName?.trim() || initialSearchStarted.current) return;
    initialSearchStarted.current = true;
    void search(initialTargetName);
  }, [initialTargetName, search]);

  useEffect(() => {
    if (cooldownUntil <= nowMs) return;
    const interval = setInterval(() => setNowMs(Date.now()), 1_000);
    return () => clearInterval(interval);
  }, [cooldownUntil, nowMs]);

  return {
    query,
    setQuery,
    target,
    result,
    searching,
    busy,
    error,
    cooldownLeftSec: Math.max(
      0,
      Math.ceil((cooldownUntil - nowMs) / 1_000),
    ),
    search,
    fight,
  };
}
