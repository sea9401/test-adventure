"use client";

// 협동 보스 클라 상태 훅 — 목록/상세 분리(같은 종류 동시 다수 소환 #714).
//   useCoopListState   — GET /api/v2/coop 폴링 + summon/claim (목록 화면)
//   useCoopSessionState — GET /api/v2/coop/[sessionId] 폴링 + attack/claim (상세 화면)
// 서버 권위 — 여기는 표시·intent 호출만.

import { useCallback, useEffect, useState } from "react";
import type { ReplayPayload } from "@/adventure/data/v2/replayPayload";
import type { Avatar } from "@/adventure/profile/avatars";
import type { ProfileBorderId } from "@/adventure/data/v2/museunCosmetics";
import type { V2EquipmentId } from "@/adventure/data/v2/v2Equipment";
import type { StaminaState } from "@/adventure/v2/stamina";
import type { InvincibleFortressEnrageTier } from "@/adventure/v2/combat/invincibleFortressMechanic";
import type { SkywardCrystalEyeArtilleryPowerPct } from "@/adventure/v2/combat/skywardCrystalEyeMechanic";
import type { SkywardCrystalEyeArtilleryEvent } from "@/adventure/v2/combat/skywardCrystalEyeMechanic";
import {
  COOP_ATTACK_STAMINA_COST,
  COOP_BOSSES,
  type CoopBossKindId,
  type CoopRewardTier,
  type CoopVisibility,
} from "@/adventure/data/v2/coopBosses";

const POLL_MS = 20_000;
// 상세(토벌) 화면은 더 자주 폴링 — 공유 HP 가 실시간으로 깎이는 체감(여러 명 동시 공격).
//   처치/만료 확정 시 폴링 중단(죽은 세션 무한 폴링 방지).
const DETAIL_POLL_MS = 5_000;

export type CoopFortressStatus = {
  fortressBarrierActive?: boolean;
  fortressBarrierTicksRemaining?: number;
  fortressBarrierDamage?: number;
  fortressBarrierTarget?: number;
  fortressEnrageTier?: InvincibleFortressEnrageTier;
  fortressProjectedEnrageTier?: InvincibleFortressEnrageTier;
  fortressCompletedBarrierCount?: number;
  fortressNextBarrierHpFraction?: 0.75 | 0.5 | 0.25 | null;
  fortressLastResultTier?: InvincibleFortressEnrageTier | null;
};

export type CoopSkywardCrystalEyeStatus = {
  crystalEyeAimTicksRemaining?: number;
  crystalEyeDisruptionStacks?: number;
  crystalEyeProjectedPowerPct?: SkywardCrystalEyeArtilleryPowerPct;
  crystalEyeBasePowerPct?: 330 | 390 | 450 | 510;
  crystalEyeCoreExposed?: boolean;
  crystalEyeCoreExposureTicksRemaining?: number;
  crystalEyeArtilleryCount?: number;
  crystalEyeLastArtilleryStacks?: number | null;
  crystalEyeLastArtilleryPowerPct?: SkywardCrystalEyeArtilleryPowerPct | null;
  crystalEyeLastArtilleryDamage?: number | null;
};

export type CoopImmortalBerserkerStatus = {
  immortalLifeIndex?: 0 | 1 | 2;
  immortalLifeHp?: number;
  immortalLifeMaxHp?: number;
  immortalRegenActionsRemaining?: number;
  immortalRegenUsesRemaining?: 0 | 1 | 2 | 3;
  immortalNextRegenAmount?: number;
  immortalAtkMult?: number;
  immortalSpdMult?: number;
};

export type CoopSessionSummary = CoopFortressStatus &
  CoopSkywardCrystalEyeStatus & CoopImmortalBerserkerStatus & {
  id: string;
  kind: CoopBossKindId;
  hp: number;
  maxHp: number;
  bossMp: number;
  bossMaxMp: number;
  trackingThreat: number;
  trackingThreatMax: number;
  trackingReady: boolean;
  expiresAt: number;
  summonedByName: string | null;
  visibility: CoopVisibility;
  allowFreeSupport: boolean;
  isOwner: boolean;
  participantCount: number;
  myDamage: number;
  myTier: CoopRewardTier | null;
};

export type CoopClaimable = {
  sessionId: string;
  kind: CoopBossKindId;
  myDamage: number;
  tier: CoopRewardTier | null;
  defeatedAt: number;
};

export type CoopAttackResult = CoopFortressStatus &
  CoopSkywardCrystalEyeStatus & CoopImmortalBerserkerStatus & {
  attackId: number;
  kind: CoopBossKindId;
  damageDealt: number;
  damageTaken: number;
  diedEarly: boolean;
  isSupport?: boolean;
  turns: number;
  bossHp: number;
  bossMaxHp: number;
  bossMp: number;
  bossMaxMp: number;
  bossMpDamage: number;
  bossMpDepleted: boolean;
  trackingThreat: number;
  trackingThreatMax: number;
  trackingReady: boolean;
  trackingCounterCount: number;
  trackingCounterDamage: number;
  toxicBloodStacks: number;
  toxicRecoveryLockActions: number;
  toxicExplosionCount: number;
  toxicDamageTaken: number;
  glacialChillStacks: number;
  glacialFreezePending: 0 | 1;
  glacialFreezeCount: number;
  glacialSkippedActionCount: number;
  fortressCompletedResults: InvincibleFortressEnrageTier[];
  crystalEyeArtilleryEvents: SkywardCrystalEyeArtilleryEvent[];
  immortalBodyDamage: number;
  immortalHealing: number;
  immortalRevivalCount: number;
  netProgress: number;
  defeated: boolean;
  myDamage: number;
  myTier: CoopRewardTier | null;
  killingBlowReward: {
    coin: number;
    bossMaterialId: string;
    bossMaterialName: string;
    bossMaterialCount: number;
  } | null;
  replay?: ReplayPayload;
};

export type CoopClaimReward =
  | {
      rewardMode: "coop";
      tier: CoopRewardTier;
      // SP 열매 획득 개수(0~3)·등급 이름(0개면 null).
      spFruitCount: number;
      spFruitName: string | null;
      // 보스 전용 시그니처 유니크 드랍(EPIC+ 확률·없으면 null).
      uniqueId: string | null;
      uniqueName: string | null;
      coopCoin?: number;
      bossMaterialName?: string | null;
      bossMaterialCount?: number;
      equipmentBoxName?: string | null;
    }
  | {
      rewardMode: "unexplored_personal";
      bossCore: 1;
      bossCoreMaterialId: string;
      poolMaterialId: string;
      poolMaterialCount: 1;
      uniqueIds: V2EquipmentId[];
      uniqueNames: string[];
      titleId: string;
    };

export type CoopRecentAttack = {
  id: number;
  name: string;
  damageDealt: number;
  damageTaken: number;
  diedEarly: boolean;
  isSupport?: boolean;
  isMe?: boolean;
  avatar: Avatar;
  profileBorder: ProfileBorderId | null;
  at: number;
};

export type CoopSessionDetail = {
  session: CoopFortressStatus & CoopSkywardCrystalEyeStatus &
    CoopImmortalBerserkerStatus & {
    id: string;
    kind: CoopBossKindId;
    hp: number;
    maxHp: number;
    bossMp: number;
    bossMaxMp: number;
    trackingThreat: number;
    trackingThreatMax: number;
    trackingReady: boolean;
    expiresAt: number;
    defeatedAt: number | null;
    defeated: boolean;
    expired: boolean;
    summonedByName: string | null;
    // 코어루프 — 현재 공개 범위 + 소환자(본인) 여부(소환 후 범위 변경 컨트롤 게이트).
    visibility: CoopVisibility;
    allowFreeSupport: boolean;
    isOwner: boolean;
  };
  my: {
    damage: number;
    attackCount: number;
    lastAttackAt: number | null;
    tier: CoopRewardTier | null;
    claimed: boolean;
  };
  combatPreview: {
    boss: {
      atk: number;
      def: number;
      magicDef: number;
      spd: number;
      effectiveSpd: number;
      accuracy: number;
      evasion: number;
    };
    player: {
      accRating: number;
      evaRating: number;
      damageRetainedPct: number;
      evasionReductionPct: number;
    };
  } | null;
  participantCount: number;
  top: {
    name: string;
    damage: number;
    attackCount: number;
    isMe?: boolean;
    avatar: Avatar;
    profileBorder: ProfileBorderId | null;
  }[];
  recentAttacks: CoopRecentAttack[];
};

// 공용 claim 호출 — 목록/상세 양쪽에서 사용.
async function postClaim(sessionId: string): Promise<{
  reward: CoopClaimReward | null;
  error: string | null;
  belowThreshold: boolean;
}> {
  const res = await fetch("/api/v2/coop/claim", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId }),
  });
  const j = (await res.json()) as {
    ok?: boolean;
    error?: string;
    reward?: CoopClaimReward | null;
    belowThreshold?: boolean;
  };
  if (j.ok && j.reward) {
    return { reward: j.reward, error: null, belowThreshold: false };
  }
  if (j.ok) {
    return {
      reward: null,
      error: null,
      belowThreshold: j.belowThreshold === true,
    };
  }
  return { reward: null, error: j.error ?? "unknown", belowThreshold: false };
}

function claimErrorLabel(error: string): string {
  return error === "below_bronze"
    ? "기여도가 보상 기준(BRONZE)에 못 미쳤습니다."
    : `수령 실패 (${error})`;
}

// === 목록 화면 ========================================================

export function useCoopListState() {
  const [scrolls, setScrolls] = useState(0);
  const [sessions, setSessions] = useState<CoopSessionSummary[]>([]);
  const [claimables, setClaimables] = useState<CoopClaimable[]>([]);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [lastReward, setLastReward] = useState<CoopClaimReward | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/v2/coop");
      if (!res.ok) return;
      const j = (await res.json()) as {
        ok?: boolean;
        scrolls?: number;
        sessions?: CoopSessionSummary[];
        claimables?: CoopClaimable[];
      };
      if (j.ok) {
        setScrolls(j.scrolls ?? 0);
        setSessions(j.sessions ?? []);
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

  // 소환 — 성공 시 새 sessionId 반환 + 안내 노티스(목록 잔류 — 연속 소환 가능, 이동 없음).
  const summon = useCallback(
    async (kind: CoopBossKindId, allowFreeSupport = false): Promise<string | null> => {
      if (busy) return null;
      setBusy(true);
      setNotice(null);
      try {
        const res = await fetch("/api/v2/coop/summon", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ kind, allowFreeSupport }),
        });
        const j = (await res.json()) as {
          ok?: boolean;
          error?: string;
          sessionId?: string;
          have?: number;
          need?: number;
          cap?: number;
        };
        if (j.ok && j.sessionId) {
          setNotice(
            `${COOP_BOSSES[kind].name} 소환! 소환된 보스 목록에 추가되었습니다.`,
          );
          return j.sessionId;
        }
        setNotice(
          j.error === "not_enough_scrolls"
            ? `소환서가 부족합니다 (보유 ${j.have ?? 0} / 필요 ${j.need ?? "?"})`
            : j.error === "too_many_active"
              ? `${COOP_BOSSES[kind].name}은(는) 동시 소환 한도(${j.cap ?? "?"}마리)에 도달했습니다.`
              : j.error === "not_scroll_summonable"
                ? `${COOP_BOSSES[kind].name}은(는) 낚시로만 출현합니다.`
              : `소환 실패 (${j.error ?? "unknown"})`,
        );
        return null;
      } catch {
        setNotice("네트워크 오류 — 잠시 후 다시 시도하세요.");
        return null;
      } finally {
        await refresh();
        setBusy(false);
      }
    },
    [busy, refresh],
  );

  const claim = useCallback(
    async (sessionId: string) => {
      if (busy) return;
      setBusy(true);
      setNotice(null);
      try {
        const { reward, error, belowThreshold } = await postClaim(sessionId);
        if (reward) setLastReward(reward);
        else if (belowThreshold) setNotice("기준 미달 토벌 기록을 정리했습니다.");
        else if (error) setNotice(claimErrorLabel(error));
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
    sessions,
    claimables,
    busy,
    loaded,
    notice,
    lastReward,
    refresh,
    summon,
    claim,
  };
}

// === 상세 화면 ========================================================

export function useCoopSessionState({
  sessionId,
  setStamina,
}: {
  sessionId: string;
  setStamina: (s: StaminaState) => void;
}) {
  const [detail, setDetail] = useState<CoopSessionDetail | null>(null);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [lastReward, setLastReward] = useState<CoopClaimReward | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/v2/coop/${sessionId}`);
      if (res.status === 404) {
        setMissing(true);
        return;
      }
      if (!res.ok) return;
      const j = (await res.json()) as
        | ({ ok?: boolean } & CoopSessionDetail)
        | null;
      if (j?.ok) {
        setDetail({
          session: j.session,
          my: j.my,
          combatPreview: j.combatPreview ?? null,
          participantCount: j.participantCount,
          top: j.top,
          recentAttacks: j.recentAttacks,
        });
      }
    } catch {}
  }, [sessionId]);

  // 서버가 처치/만료를 확정하면 폴링 중단(HP 더 안 변함). 시간상 만료(expiresAt≤now)는 매초
  //   바뀌어 effect 재실행을 유발하므로 폴링 게이트엔 안 씀 — 서버 확정 플래그만 본다.
  const stopPolling =
    detail?.session.defeated === true || detail?.session.expired === true;
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- refresh 는 async(fetch 후 set)
    void refresh();
    if (stopPolling) return; // 종료 세션 — 한 번만 갱신, 인터벌 없음.
    const id = setInterval(() => void refresh(), DETAIL_POLL_MS);
    return () => clearInterval(id);
  }, [refresh, stopPolling]);

  const attack = useCallback(async (support = false): Promise<CoopAttackResult | null> => {
    if (busy) return null;
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/v2/coop/attack", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId, support }),
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
        const r = j.result;
        // 공격 직후 즉시 — 보스 공유 HP 바를 응답값으로 낙관적 갱신(refresh 왕복 전 체감).
        //   finally 의 refresh 가 곧 서버 권위로 확정(다른 사람 공격분도 반영).
        setDetail((prev) =>
          prev
            ? {
                ...prev,
                session: {
                  ...prev.session,
                  hp: r.bossHp,
                  bossMp: r.bossMp,
                  bossMaxMp: r.bossMaxMp,
                  trackingThreat: r.trackingThreat,
                  trackingThreatMax: r.trackingThreatMax,
                  trackingReady: r.trackingReady,
                  fortressBarrierActive: r.fortressBarrierActive,
                  fortressBarrierTicksRemaining:
                    r.fortressBarrierTicksRemaining,
                  fortressBarrierDamage: r.fortressBarrierDamage,
                  fortressBarrierTarget: r.fortressBarrierTarget,
                  fortressEnrageTier: r.fortressEnrageTier,
                  fortressProjectedEnrageTier:
                    r.fortressProjectedEnrageTier,
                  fortressCompletedBarrierCount:
                    r.fortressCompletedBarrierCount,
                  fortressNextBarrierHpFraction:
                    r.fortressNextBarrierHpFraction,
                  fortressLastResultTier: r.fortressLastResultTier,
                  crystalEyeAimTicksRemaining:
                    r.crystalEyeAimTicksRemaining,
                  crystalEyeDisruptionStacks:
                    r.crystalEyeDisruptionStacks,
                  crystalEyeProjectedPowerPct:
                    r.crystalEyeProjectedPowerPct,
                  crystalEyeBasePowerPct: r.crystalEyeBasePowerPct,
                  crystalEyeCoreExposed: r.crystalEyeCoreExposed,
                  crystalEyeCoreExposureTicksRemaining:
                    r.crystalEyeCoreExposureTicksRemaining,
                  crystalEyeArtilleryCount: r.crystalEyeArtilleryCount,
                  crystalEyeLastArtilleryStacks:
                    r.crystalEyeLastArtilleryStacks,
                  crystalEyeLastArtilleryPowerPct:
                    r.crystalEyeLastArtilleryPowerPct,
                  crystalEyeLastArtilleryDamage:
                    r.crystalEyeLastArtilleryDamage,
                  immortalLifeIndex: r.immortalLifeIndex,
                  immortalLifeHp: r.immortalLifeHp,
                  immortalLifeMaxHp: r.immortalLifeMaxHp,
                  immortalRegenActionsRemaining:
                    r.immortalRegenActionsRemaining,
                  immortalRegenUsesRemaining:
                    r.immortalRegenUsesRemaining,
                  immortalNextRegenAmount: r.immortalNextRegenAmount,
                  immortalAtkMult: r.immortalAtkMult,
                  immortalSpdMult: r.immortalSpdMult,
                  defeated: prev.session.defeated || r.defeated,
                },
              }
            : prev,
        );
        return r;
      } else {
        setNotice(
          j.error === "cooldown"
            ? `재공격 대기 중 — ${Math.ceil((j.retryAfterMs ?? 0) / 1000)}초 후 가능`
            : j.error === "support_disabled"
              ? "소환자가 무료 토벌 지원을 허용하지 않았습니다."
              : j.error === "out_of_stamina"
              ? `스태미너 부족 (${COOP_ATTACK_STAMINA_COST} 필요)`
              : j.error === "no_active_boss"
                ? "이미 끝난 토벌입니다."
                : j.error === "already_defeated"
                  ? "이미 처치된 보스입니다."
                  : j.error === "boss_state_changed"
                    ? "다른 공격 결과가 먼저 반영되었습니다. 다시 공격해 주세요."
                  : `공격 실패 (${j.error ?? "unknown"})`,
        );
        return null;
      }
    } catch {
      setNotice("네트워크 오류 — 잠시 후 다시 시도하세요.");
      return null;
    } finally {
      await refresh();
      setBusy(false);
    }
  }, [busy, refresh, sessionId, setStamina]);

  const claim = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const { reward, error, belowThreshold } = await postClaim(sessionId);
      if (reward) setLastReward(reward);
      else if (belowThreshold) setNotice("기준 미달 토벌 기록을 정리했습니다.");
      else if (error) setNotice(claimErrorLabel(error));
    } catch {
      setNotice("네트워크 오류 — 잠시 후 다시 시도하세요.");
    } finally {
      await refresh();
      setBusy(false);
    }
  }, [busy, refresh, sessionId]);

  const setFreeSupport = useCallback(async (allowFreeSupport: boolean) => {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/v2/coop/${sessionId}/support`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ allowFreeSupport }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!j.ok) {
        setNotice(
          j.error === "not_owner"
            ? "소환자만 무료 토벌 지원 설정을 바꿀 수 있어요."
            : j.error === "not_active"
              ? "이미 끝난 토벌입니다."
              : "무료 토벌 지원 설정을 변경하지 못했습니다.",
        );
      }
    } catch {
      setNotice("네트워크 오류 — 잠시 후 다시 시도하세요.");
    } finally {
      await refresh();
      setBusy(false);
    }
  }, [busy, refresh, sessionId]);

  // 소환자 전용 — 소환 후 공개 범위 변경(나만/길드원만/공개). 서버가 소유·활성 재검증.
  const setVisibility = useCallback(
    async (visibility: CoopVisibility) => {
      if (busy) return;
      setBusy(true);
      setNotice(null);
      try {
        const res = await fetch(`/api/v2/coop/${sessionId}/visibility`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ visibility }),
        });
        const j = (await res.json()) as { ok?: boolean; error?: string };
        if (!j.ok) {
          setNotice(
            j.error === "not_owner"
              ? "소환자만 공개 범위를 바꿀 수 있어요."
              : j.error === "not_active"
                ? "이미 끝난 토벌은 범위를 바꿀 수 없어요."
                : j.error === "visibility_locked"
                  ? "전체 공개된 보스는 공개 범위를 줄일 수 없어요."
                : `공개 범위 변경 실패 (${j.error ?? "unknown"})`,
          );
        }
      } catch {
        setNotice("네트워크 오류 — 잠시 후 다시 시도하세요.");
      } finally {
        await refresh();
        setBusy(false);
      }
    },
    [busy, refresh, sessionId],
  );

  return {
    detail,
    missing,
    busy,
    notice,
    lastReward,
    refresh,
    attack,
    claim,
    setVisibility,
    setFreeSupport,
  };
}

// 만료까지 남은 시간 표기 — 목록/상세 공용.
export function fmtCoopRemain(ms: number): string {
  if (ms <= 0) return "만료";
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${Math.max(1, m)}분 남음`;
  return `${Math.floor(m / 60)}시간 ${m % 60}분 남음`;
}
