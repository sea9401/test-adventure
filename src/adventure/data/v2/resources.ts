// v2 자원 시스템 — 광산 거점 시간당 산출.
//
// 현재 1 종 (stone). 미래 식량(밭/마을), 목재(숲) 등 확장 여지.
// lazy 계산: outpost_occupations.lastHarvestedAt 이후 흐른 시간 × 산출률 → user/길드 자원 풀.

import type { OutpostTier, OutpostType } from "./types";

// tier 별 광산 시간당 stone 산출량. 큰 거점일수록 많이.
export const STONE_YIELD_PER_HOUR: Record<OutpostTier, number> = {
  1: 5,
  2: 15,
  3: 40,
  4: 100,
};

// 거점 타입별 stone 산출 배율. mine 100%, village 50% (보조 광산).
// fort/tower 는 stone 산출 X (다른 효과 — 병사 모집/주문서).
export const STONE_YIELD_TYPE_MULT: Partial<Record<OutpostType, number>> = {
  mine: 1.0,
  village: 0.5,
};

// tower 거점 tier 별 주문서 시간당 산출. 작은 수 — 시간 누적해서 정수 단위로.
// floor 손실 minor (자주 수확 안 권장).
export const SCROLL_YIELD_PER_HOUR: Record<OutpostTier, number> = {
  1: 0.1,
  2: 0.3,
  3: 0.6,
  4: 1.0,
};

// 주문서 1 = 본 전쟁 power +20% (공격자만, claim 시 active 소비).
export const SCROLL_POWER_BONUS = 0.2;

// 오프라인 누적 cap — 자주 안 와도 손해 적게(스태미너 원칙과 같음) 하지만 영구 누적은 X.
// 24 시간 = 만피. 자주 수확하면 손실 없음.
export const HARVEST_OFFLINE_CAP_HOURS = 24;

// 시간 차 + tier + type 으로 산출량 계산.
// returns { gained, effectiveHours } — effectiveHours 만큼 시간 진행 (cap 적용).
// type 이 mine/village 가 아니면 gained=0 (수확 불가).
export function computeStoneYield(
  tier: OutpostTier,
  type: OutpostType,
  lastHarvestedAtMs: number,
  nowMs: number,
): { gained: number; effectiveHours: number } {
  const mult = STONE_YIELD_TYPE_MULT[type] ?? 0;
  const elapsedHours = Math.max(0, (nowMs - lastHarvestedAtMs) / 3600_000);
  const cappedHours = Math.min(HARVEST_OFFLINE_CAP_HOURS, elapsedHours);
  const gained = Math.floor(STONE_YIELD_PER_HOUR[tier] * mult * cappedHours);
  return { gained, effectiveHours: cappedHours };
}

// tower 주문서 산출. type !== tower 이면 0.
export function computeScrollYield(
  tier: OutpostTier,
  type: OutpostType,
  lastHarvestedAtMs: number,
  nowMs: number,
): { gained: number; effectiveHours: number } {
  if (type !== "tower") return { gained: 0, effectiveHours: 0 };
  const elapsedHours = Math.max(0, (nowMs - lastHarvestedAtMs) / 3600_000);
  const cappedHours = Math.min(HARVEST_OFFLINE_CAP_HOURS, elapsedHours);
  const gained = Math.floor(SCROLL_YIELD_PER_HOUR[tier] * cappedHours);
  return { gained, effectiveHours: cappedHours };
}

// 길드 자원 풀 형태 — v2_guild_resources 테이블 + UI 반영.
export type V2Resources = {
  stone: number;
  soldiers: number;
  scrolls: number;
  // PR-6 활성 주문서 만료(epoch ms). null = 비활성.
  activeScrollExpiresAt?: number | null;
};

function parseNonNegInt(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v) && v >= 0) {
    return Math.floor(v);
  }
  return 0;
}

export function parseResources(raw: unknown): V2Resources {
  if (raw && typeof raw === "object") {
    const r = raw as Partial<V2Resources>;
    return {
      stone: parseNonNegInt(r.stone),
      soldiers: parseNonNegInt(r.soldiers),
      scrolls: parseNonNegInt(r.scrolls),
      activeScrollExpiresAt:
        typeof r.activeScrollExpiresAt === "number"
          ? r.activeScrollExpiresAt
          : null,
    };
  }
  return { stone: 0, soldiers: 0, scrolls: 0, activeScrollExpiresAt: null };
}
