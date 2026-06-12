"use client";

// 협동 보스 클라 상태 훅 — 목록(V2CoopBossListView)/상세(V2CoopBossDetailView) 공유.
// GET /api/v2/coop 폴링 + summon/attack/claim intent. 서버 권위 — 여기는 표시·호출만.

import { useCallback, useEffect, useState } from "react";
import type { ReplayPayload } from "@/adventure/data/v2/replayPayload";
import type { StaminaState } from "@/adventure/v2/stamina";
import {
  COOP_ATTACK_STAMINA_COST,
  COOP_BOSSES,
  type CoopBossKindId,
  type CoopRewardTier,
} from "@/adventure/data/v2/coopBosses";

const POLL_MS = 20_000;

export type CoopBossState = {
  kind: CoopBossKindId;
  session: { id: string; hp: number; maxHp: number; expiresAt: number } | null;
  myDamage: number;
  myAttackCount: number;
  myLastAttackAt: number | null;
  myTier: CoopRewardTier | null;
  participantCount: number;
  top: { name: string; damage: number; attackCount: number; isMe?: boolean }[];
  recentAttacks: {
    name: string;
    damageDealt: number;
    diedEarly: boolean;
    at: number;
  }[];
};

export type CoopClaimable = {
  sessionId: string;
  kind: CoopBossKindId;
  myDamage: number;
  tier: CoopRewardTier | null;
  defeatedAt: number;
};

export type CoopAttackResult = {
  kind: CoopBossKindId;
  damageDealt: number;
  damageTaken: number;
  diedEarly: boolean;
  turns: number;
  bossHp: number;
  bossMaxHp: number;
  defeated: boolean;
  myDamage: number;
  myTier: CoopRewardTier | null;
  hpAfter: number;
  maxHp: number;
  hpCharges?: number;
  mpCharges?: number;
  replay?: ReplayPayload;
};

export type CoopClaimReward = {
  tier: CoopRewardTier;
  gold: number;
  uniqueId: string | null;
  titleId: string;
  titleNew: boolean;
};

type CoopGetResponse = {
  ok?: boolean;
  scrolls?: number;
  bosses?: CoopBossState[];
  claimables?: CoopClaimable[];
};

export function useCoopBossState({
  setStamina,
  onHpAfterAttack,
}: {
  setStamina: (s: StaminaState) => void;
  // 공격 응답의 최종 HP 반영 콜백(전역 HP 바) — 미전달이면 무시.
  onHpAfterAttack?: (r: { hpAfter: number; maxHp: number }) => void;
}) {
  const [scrolls, setScrolls] = useState(0);
  const [bosses, setBosses] = useState<CoopBossState[]>([]);
  const [claimables, setClaimables] = useState<CoopClaimable[]>([]);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [lastAttack, setLastAttack] = useState<CoopAttackResult | null>(null);
  const [lastReward, setLastReward] = useState<CoopClaimReward | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/v2/coop");
      if (!res.ok) return;
      const j = (await res.json()) as CoopGetResponse;
      if (j.ok) {
        setScrolls(j.scrolls ?? 0);
        setBosses(j.bosses ?? []);
        setClaimables(j.claimables ?? []);
        setLoaded(true);
      }
    } catch {}
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- refresh 는 async(fetch 후 set)
    void refresh();
    const id = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  const summon = useCallback(
    async (kind: CoopBossKindId) => {
      if (busy) return;
      setBusy(true);
      setNotice(null);
      try {
        const res = await fetch("/api/v2/coop/summon", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ kind }),
        });
        const j = (await res.json()) as {
          ok?: boolean;
          error?: string;
          have?: number;
          need?: number;
        };
        if (!j.ok) {
          setNotice(
            j.error === "not_enough_scrolls"
              ? `소환서가 부족합니다 (보유 ${j.have ?? 0} / 필요 ${j.need ?? "?"})`
              : j.error === "already_active"
                ? "이미 이 보스가 소환되어 있습니다."
                : `소환 실패 (${j.error ?? "unknown"})`,
          );
        } else {
          setNotice(
            `${COOP_BOSSES[kind].name} 소환! 모두가 공격할 수 있습니다.`,
          );
        }
      } catch {
        setNotice("네트워크 오류 — 잠시 후 다시 시도하세요.");
      } finally {
        await refresh();
        setBusy(false);
      }
    },
    [busy, refresh],
  );

  const attack = useCallback(
    async (kind: CoopBossKindId) => {
      if (busy) return;
      setBusy(true);
      setNotice(null);
      setLastAttack(null);
      try {
        const res = await fetch("/api/v2/coop/attack", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ kind }),
        });
        const j = (await res.json()) as {
          ok?: boolean;
          error?: string;
          stamina?: StaminaState;
          retryAfterMs?: number;
          result?: CoopAttackResult;
        };
        if (j.stamina) setStamina(j.stamina);
        if (j.ok && j.result) {
          setLastAttack(j.result);
          onHpAfterAttack?.(j.result);
        } else {
          setNotice(
            j.error === "cooldown"
              ? `재공격 대기 중 — ${Math.ceil((j.retryAfterMs ?? 0) / 1000)}초 후 가능`
              : j.error === "out_of_stamina"
                ? `스태미너 부족 (${COOP_ATTACK_STAMINA_COST} 필요)`
                : j.error === "hp_zero"
                  ? "체력이 부족합니다 — 회복 후 다시 시도하세요."
                  : j.error === "no_active_boss"
                    ? "소환된 보스가 없습니다."
                    : j.error === "already_defeated"
                      ? "이미 처치된 보스입니다."
                      : `공격 실패 (${j.error ?? "unknown"})`,
          );
        }
      } catch {
        setNotice("네트워크 오류 — 잠시 후 다시 시도하세요.");
      } finally {
        await refresh();
        setBusy(false);
      }
    },
    [busy, refresh, setStamina, onHpAfterAttack],
  );

  const claim = useCallback(
    async (sessionId: string) => {
      if (busy) return;
      setBusy(true);
      setNotice(null);
      try {
        const res = await fetch("/api/v2/coop/claim", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sessionId }),
        });
        const j = (await res.json()) as {
          ok?: boolean;
          error?: string;
          reward?: CoopClaimReward | null;
        };
        if (j.ok && j.reward) setLastReward(j.reward);
        else if (!j.ok) {
          setNotice(
            j.error === "below_bronze"
              ? "기여도가 보상 기준(BRONZE)에 못 미쳤습니다."
              : `수령 실패 (${j.error ?? "unknown"})`,
          );
        }
      } catch {
        setNotice("네트워크 오류 — 잠시 후 다시 시도하세요.");
      } finally {
        await refresh();
        setBusy(false);
      }
    },
    [busy, refresh],
  );

  return {
    scrolls,
    bosses,
    claimables,
    busy,
    loaded,
    notice,
    lastAttack,
    lastReward,
    refresh,
    summon,
    attack,
    claim,
  };
}

// 만료까지 남은 시간 표기 — 목록/상세 공용.
export function fmtCoopRemain(ms: number): string {
  if (ms <= 0) return "만료";
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${Math.max(1, m)}분 남음`;
  return `${Math.floor(m / 60)}시간 ${m % 60}분 남음`;
}
