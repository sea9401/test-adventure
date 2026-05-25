// v2 자원 시스템 — 광산 거점 시간당 산출.
//
// 현재 1 종 (stone). 미래 식량(밭/마을), 목재(숲) 등 확장 여지.
// lazy 계산: outpost_occupations.lastHarvestedAt 이후 흐른 시간 × 산출률 → user/길드 자원 풀.

import type { OutpostTier } from "./types";

// tier 별 광산 시간당 stone 산출량. 큰 거점일수록 많이.
export const STONE_YIELD_PER_HOUR: Record<OutpostTier, number> = {
  1: 5,
  2: 15,
  3: 40,
  4: 100,
};

// 오프라인 누적 cap — 자주 안 와도 손해 적게(스태미너 원칙과 같음) 하지만 영구 누적은 X.
// 24 시간 = 만피. 자주 수확하면 손실 없음.
export const HARVEST_OFFLINE_CAP_HOURS = 24;

// 시간 차 + tier 로 산출량 계산.
// returns { gained, effectiveHours } — effectiveHours 만큼 시간 진행 (cap 적용).
export function computeStoneYield(
  tier: OutpostTier,
  lastHarvestedAtMs: number,
  nowMs: number,
): { gained: number; effectiveHours: number } {
  const elapsedHours = Math.max(0, (nowMs - lastHarvestedAtMs) / 3600_000);
  const cappedHours = Math.min(HARVEST_OFFLINE_CAP_HOURS, elapsedHours);
  const gained = Math.floor(STONE_YIELD_PER_HOUR[tier] * cappedHours);
  return { gained, effectiveHours: cappedHours };
}

// saves_kv 의 v2-resources 키 형태.
export type V2Resources = {
  stone: number;
  // 미래 확장: food, wood, gold? 등
};

export function parseResources(raw: unknown): V2Resources {
  if (raw && typeof raw === "object") {
    const r = raw as Partial<V2Resources>;
    return {
      stone:
        typeof r.stone === "number" && Number.isFinite(r.stone) && r.stone >= 0
          ? Math.floor(r.stone)
          : 0,
    };
  }
  return { stone: 0 };
}
