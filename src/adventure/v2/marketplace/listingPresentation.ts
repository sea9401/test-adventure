"use client";

import {
  RARE_MAP_KINDS,
  RARE_MAP_TTL_MS,
  parseRareMaps
} from "@/adventure/data/v2/rareMaps";
import type { V2EnhanceState } from "@/adventure/data/v2/v2Enhance";
import {
  parseCraftedBy,
  parseInstanceCraftQuality,
  parseInstanceEnhance,
  type V2CraftQualityState,
  type V2CraftedBy
} from "@/adventure/data/v2/v2Equipment";

// v2 거래소 — 모든 품목을 6시간 공개 경매로 거래한다.
// 백엔드 /api/v2/marketplace (list/bid/cancel/browse).
//   타입·시세 헬퍼·시세줄/가격입력 leaf 컴포넌트는 marketplace/marketplaceShared 공용.

// 리스팅 payload — 굴림(+강화+제작품질+제작자) 혼합형. 옛 행은 raw roll 객체(enhance 없음).
export function listingEnhance(payload: unknown): V2EnhanceState | undefined {
  const raw = payload as { craftQuality?: unknown; craftedBy?: unknown; enhance?: unknown } | null;
  const craftedBy = parseCraftedBy(raw?.craftedBy);
  return parseInstanceEnhance(raw?.enhance, raw?.craftQuality, craftedBy);
}


export function listingCraftedBy(payload: unknown): V2CraftedBy | undefined {
  return parseCraftedBy((payload as { craftedBy?: unknown } | null)?.craftedBy);
}


export function listingCraftQuality(payload: unknown): V2CraftQualityState | undefined {
  const raw = payload as { craftQuality?: unknown; craftedBy?: unknown; enhance?: unknown } | null;
  return parseInstanceCraftQuality(raw?.craftQuality, raw?.enhance, listingCraftedBy(payload));
}



export function remainingLabel(endsAt: string, clockMs: number) {
  const remainingMs = Math.max(0, new Date(endsAt).getTime() - clockMs);
  const totalMinutes = Math.ceil(remainingMs / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}시간 ${minutes}분 남음`;
  return `${minutes}분 남음`;
}



export function consumableStatusLine(
  itemId: string,
  payload: unknown,
  nowMs: number,
): { text: string; expired: boolean } | null {
  if (!(itemId in RARE_MAP_KINDS)) return null;
  const raw =
    typeof payload === "object" && payload !== null
      ? (payload as { marketplaceRemainingMs?: unknown })
      : null;
  const remaining = Number(raw?.marketplaceRemainingMs);
  const candidate =
    Number.isFinite(remaining) && typeof payload === "object" && payload !== null
      ? {
          ...payload,
          foundAt:
            nowMs -
            (RARE_MAP_TTL_MS -
              Math.max(1, Math.min(RARE_MAP_TTL_MS, Math.floor(remaining)))),
        }
      : payload;
  const instance = parseRareMaps([candidate], nowMs)[0];
  if (!instance) return { text: "실물 없음 — 입찰 불가", expired: true };
  const definition = RARE_MAP_KINDS[instance.kind];
  const usage =
    definition?.category === "location"
      ? "희귀 장소"
      : definition?.category === "utility"
        ? `사용 ${instance.runsLeft}회`
        : `희귀 탐사 ${instance.runsLeft}판`;
  return { text: usage, expired: false };
}
