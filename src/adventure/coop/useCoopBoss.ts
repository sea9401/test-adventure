"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CoopRewardTier } from "./data";
import type { BattleLogEntry } from "@/adventure/battle/engine";
import { readDeviceSessionId } from "@/lib/storage/deviceSession";
import { useRemoteSave } from "@/lib/storage/SaveProvider";

// 코옵 POST 요청 헬퍼 — X-Session-Id 헤더 동봉.
function coopHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const sessionId = readDeviceSessionId();
  if (sessionId) headers["X-Session-Id"] = sessionId;
  return headers;
}

export type CoopSession = {
  id: string;
  regionId: string;
  bossName: string;
  hp: number;
  maxHp: number;
  spawnedAt: string;
  expiresAt: string;
  defeatedAt: string | null;
  nextSpawnAt: string | null;
  isActive: boolean;
};

export type CoopMyContribution = {
  damage: number;
  attackCount: number;
  ratio: number;
  tier: CoopRewardTier | null;
  cooldownEndsAt: string | null;
  claimable: boolean;
  claimedAt: string | null;
  claimedTier: CoopRewardTier | null;
};

export type CoopTopRow = {
  name: string;
  damage: number;
  attackCount: number;
  mine: boolean;
};

export type CoopAttackLogRow = {
  id: number;
  name: string;
  damageDealt: number;
  damageTaken: number;
  diedEarly: boolean;
  log: BattleLogEntry[];
  createdAt: string;
  mine: boolean;
};

export type CoopFetchResult = {
  session: CoopSession | null;
  myContribution: CoopMyContribution | null;
  top: CoopTopRow[];
  recentLogs: CoopAttackLogRow[];
};

export type CoopAttackResponse = {
  damageDealt: number;
  damageTaken: number;
  finalPlayerHp: number;
  diedEarly: boolean;
  log: BattleLogEntry[];
  session: { hp: number; defeated: boolean };
  /** 이 공격으로 서버가 set 한 storyFlag (참여/처치). 클라 메모리 상태에도 즉시 반영용. */
  storyFlagsSet?: string[];
};

export type CoopClaimResponse = {
  tier: CoopRewardTier;
  ratio: number;
  /**
   * 이번 호출이 실제로 적용한 경우 true, 이미 적용된 상태에서 retry 한 경우 false.
   * 클라는 reward summary 토스트를 applied=true 일 때만 띄우고, false 면 saves replace
   * 만 한다 ("이미 받았습니다" 정도). 적용/표시 두 번 막아 idempotent.
   */
  applied: boolean;
  /**
   * 서버에서 RNG 가 펼쳐지고 saves_kv 에 이미 적용된 최종 보상 (ResolvedCoopReward).
   * 클라는 표시용으로만 사용 — 실제 인벤·제작서·칭호는 서버 mutation 후 saves 로 받는다.
   */
  reward: {
    materials: Record<string, number>;
    recipes: string[];
    equipment: string[];
    titleId?: string;
  };
  /**
   * 보상 적용 후의 최신 inventory.v2 / crafting.v2 / adventure-log.v2 스냅샷.
   * 클라는 각 hook 의 replaceFromSaved 로 통째 교체한다.
   */
  saves: {
    "inventory.v2"?: unknown;
    "crafting.v2"?: unknown;
    "adventure-log.v2"?: unknown;
  };
};

// 보스 카드는 GET 한 번에 6~9 query 가 도는 무거운 호출이라 폴 주기를 길게.
// 활성 보스 카드 들고 있는 유저 수 × 1/Nsec 만큼 부하가 누적된다.
const POLL_INTERVAL_MS = 10_000;

export function useCoopBoss(regionId: string, enabled: boolean) {
  const remote = useRemoteSave();
  const [data, setData] = useState<CoopFetchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const cancelledRef = useRef(false);

  const fetchOnce = useCallback(async () => {
    try {
      const r = await fetch(`/api/coop/${regionId}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const json = (await r.json()) as CoopFetchResult;
      if (!cancelledRef.current) setData(json);
    } catch (e) {
      if (!cancelledRef.current) {
        setError(e instanceof Error ? e.message : "협동 보스 조회 실패");
      }
    }
  }, [regionId]);

  useEffect(() => {
    if (!enabled) return;
    cancelledRef.current = false;
    void fetchOnce();
    const id = setInterval(() => void fetchOnce(), POLL_INTERVAL_MS);
    return () => {
      cancelledRef.current = true;
      clearInterval(id);
    };
  }, [enabled, fetchOnce]);

  const attack = useCallback(
    async (playerName: string): Promise<CoopAttackResponse | null> => {
      setWorking(true);
      setError(null);
      try {
        const r = await fetch(`/api/coop/${regionId}`, {
          method: "POST",
          headers: coopHeaders(),
          body: JSON.stringify({ action: "attack", playerName }),
        });
        if (!r.ok) {
          const txt = await r.text().catch(() => `HTTP ${r.status}`);
          throw new Error(txt || `HTTP ${r.status}`);
        }
        const json = (await r.json()) as CoopAttackResponse;
        await fetchOnce();
        return json;
      } catch (e) {
        setError(e instanceof Error ? e.message : "공격 실패");
        return null;
      } finally {
        setWorking(false);
      }
    },
    [regionId, fetchOnce],
  );

  const claim = useCallback(async (): Promise<CoopClaimResponse | null> => {
    setWorking(true);
    setError(null);
    try {
      // 디바운스 큐 flush — 서버 mutation 후 stale 클라 PATCH 가 덮지 못하게.
      await remote.flush();
      const r = await fetch(`/api/coop/${regionId}`, {
        method: "POST",
        headers: coopHeaders(),
        body: JSON.stringify({ action: "claim" }),
      });
      if (!r.ok) {
        const txt = await r.text().catch(() => `HTTP ${r.status}`);
        throw new Error(txt || `HTTP ${r.status}`);
      }
      const json = (await r.json()) as CoopClaimResponse;
      await fetchOnce();
      return json;
    } catch (e) {
      setError(e instanceof Error ? e.message : "보상 수령 실패");
      return null;
    } finally {
      setWorking(false);
    }
  }, [regionId, fetchOnce, remote]);

  return { data, error, working, attack, claim, refresh: fetchOnce };
}
