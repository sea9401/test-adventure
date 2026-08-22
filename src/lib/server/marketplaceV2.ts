// v2 거래소 — 순수 헬퍼 + 상수. DB 트랜잭션은 라우트(/api/v2/marketplace/*)가 보유.
//   장비 개체(instance) + 재료(스택) 거래. 공개 입찰 유예 → 초과 입찰 낙찰/고정가 구매. 판매세.
//   V1 marketplace.ts(grade·V1 인벤 모델)와 무관 — v2 전용.

import { and, eq } from "drizzle-orm";
import { savesKv, users } from "@/db/schema";
import type { DbExecutor } from "@/lib/server/savesKv";
import {
  V2_EQUIPMENT,
  sellPriceOf,
  type V2EquipInstance,
  type V2EquipmentId,
} from "@/adventure/data/v2/v2Equipment";
import { V2_MATERIALS, type V2MaterialId } from "@/adventure/data/v2/dungeonDrops";
import {
  RARE_MAP_KINDS,
  RARE_MAP_TTL_MS,
  genRareMapIid,
  parseRareMaps,
  type RareMapInstance,
} from "@/adventure/data/v2/rareMaps";
import {
  V2_REFORGE_ENABLED,
  isReforgeStoneMaterialId,
} from "@/adventure/data/v2/v2EquipVariance";
import { ADVENTURE_SUPPORT_PASS } from "@/adventure/data/v2/adventureSupport";
import {
  MUSEUN_CASH_ITEMS,
  isMuseunCashItemId,
  isTradeableMuseunCashItemId,
} from "@/adventure/data/v2/museunCashItems";
import {
  cookingFoodDefinition,
  isCookingFoodId,
} from "@/adventure/v2/cooking/food";
import { FISH } from "@/adventure/data/v2/fish";
import { fishIdFromSpecimenItemId } from "@/adventure/v2/fishSpecimens";

// ── 다이얼 ──────────────────────────────────────────────────────────────────
// 판매세 — 판매 성사 시 대금의 이 비율이 소각(골드 sink). 판매자는 (대금 − 세금) 수령.
//   골드가 HP 회복 통화라 sink 없으면 거래소는 유저 간 골드 재분배만 됨 → 인플레 억제용. 단일 다이얼.
export const MARKETPLACE_V2_TAX_RATE = 0.1;
// 판매자당 활성 매물 상한(슬롯).
export const MARKETPLACE_V2_SLOT_LIMIT = 10;
export const MARKETPLACE_V2_PRICE_MIN = 1;
export const MARKETPLACE_V2_PRICE_MAX = 999_999_999; // < 2^31 — integer 컬럼 안전.
// 재료 1매물 최대 수량.
export const MARKETPLACE_V2_MATERIAL_QTY_MAX = 9999;
// 둘러보기 1회 최대 반환 행.
export const MARKETPLACE_V2_BROWSE_LIMIT = 100;
// 시세 — 최근 며칠간 판매 완료(sold) 기록을 종목별 집계. 가격 판단 참고용.
export const MARKETPLACE_V2_PRICE_HISTORY_DAYS = 30;
// 최근 거래 내역 — 체결(sold) 매물을 최신순으로 이만큼 반환(거래소 "최근 거래" 탭).
export const MARKETPLACE_V2_HISTORY_LIMIT = 100;
// 새 매물은 즉시구매(유예 0)가 기본이며 24시간 노출한다.
// 선택형 공개 입찰은 판매자가 2~24시간 중 선택. 초과 입찰이 없으면 유예 종료 후
// 고정가 즉시구매로 2시간 더 노출하고, 그 뒤 만료·반환한다.
export const MARKETPLACE_V2_BID_GRACE_MIN_HOURS = 2;
export const MARKETPLACE_V2_BID_GRACE_MAX_HOURS = 24;
export const MARKETPLACE_V2_FIXED_LISTING_HOURS = 2;
export const MARKETPLACE_V2_DIRECT_LISTING_HOURS = 24;
export const MARKETPLACE_V2_MIN_BID_RAISE_RATE = 0.05;
export const MARKETPLACE_V2_BUY_ORDER_LIMIT = 10;
export const MARKETPLACE_V2_BUY_ORDER_MAX_DAYS = 7;
export const MARKETPLACE_V2_BUY_ORDER_ESCROW_MAX = 999_999_999;

export type MarketKind = "equip" | "material" | "consumable";

export function marketplaceSlotLimitForAdventureSupport(
  active: boolean,
): number {
  return (
    MARKETPLACE_V2_SLOT_LIMIT +
    (active ? ADVENTURE_SUPPORT_PASS.marketplaceSlotBonus : 0)
  );
}

export function marketplaceTaxRateForAdventureSupport(
  active: boolean,
): number {
  return active
    ? ADVENTURE_SUPPORT_PASS.marketplaceTaxRate
    : MARKETPLACE_V2_TAX_RATE;
}

// 판매자 수령 골드 — 대금 − 판매세(내림). proceeds + 소각분 = price (보존, 골드 신규생성 0).
export function saleProceeds(
  price: number,
  taxRate: number = MARKETPLACE_V2_TAX_RATE,
): number {
  const safeRate = Number.isFinite(taxRate)
    ? Math.max(0, Math.min(1, taxRate))
    : MARKETPLACE_V2_TAX_RATE;
  return Math.floor(price * (1 - safeRate));
}
// 소각되는 판매세(표시·감사용) = price − proceeds.
export function saleTax(
  price: number,
  taxRate: number = MARKETPLACE_V2_TAX_RATE,
): number {
  return price - saleProceeds(price, taxRate);
}

export function isValidPrice(p: unknown): p is number {
  return (
    typeof p === "number" &&
    Number.isInteger(p) &&
    p >= MARKETPLACE_V2_PRICE_MIN &&
    p <= MARKETPLACE_V2_PRICE_MAX
  );
}

export function isValidBidGraceHours(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    (value === 0 ||
      (value >= MARKETPLACE_V2_BID_GRACE_MIN_HOURS &&
        value <= MARKETPLACE_V2_BID_GRACE_MAX_HOURS))
  );
}

export function marketplaceListingTimes(createdAt: Date, graceHours: number) {
  if (graceHours === 0) {
    return {
      bidEndsAt: createdAt,
      expiresAt: new Date(
        createdAt.getTime() +
          MARKETPLACE_V2_DIRECT_LISTING_HOURS * 60 * 60 * 1000,
      ),
    };
  }
  const bidEndsAt = new Date(
    createdAt.getTime() + graceHours * 60 * 60 * 1000,
  );
  return {
    bidEndsAt,
    expiresAt: new Date(
      bidEndsAt.getTime() + MARKETPLACE_V2_FIXED_LISTING_HOURS * 60 * 60 * 1000,
    ),
  };
}

/** 첫 입찰은 1골드부터, 이후에는 현재 최고가보다 최소 5% 높은 정수 금액만 허용한다. */
export function marketplaceNextBidMinimum(currentBid: number | null): number {
  if (currentBid == null || currentBid <= 0) return MARKETPLACE_V2_PRICE_MIN;
  return Math.min(
    MARKETPLACE_V2_PRICE_MAX,
    Math.max(currentBid + 1, Math.ceil(currentBid * 1.05)),
  );
}

export function marketplaceListingPhase(
  listing: {
    status: string;
    price: number;
    bidEndsAt: Date;
    expiresAt: Date;
    highestBid: number | null;
  },
  now: Date,
): "closed" | "bidding" | "auction_settlement" | "fixed" | "expired" {
  if (listing.status !== "active") return "closed";
  if (now < listing.bidEndsAt) return "bidding";
  if ((listing.highestBid ?? 0) > listing.price) return "auction_settlement";
  if (now < listing.expiresAt) return "fixed";
  return "expired";
}

/** 공개 매물 응답에서는 판매자 이름·ID와 최고 입찰자 ID를 제거한다. */
export function marketplacePublicListing<
  T extends {
    sellerId: string;
    sellerName?: string;
    highestBidderId: string | null;
    highestBid: number | null;
  },
>(row: T, viewerId: string) {
  const { sellerId, sellerName: _sellerName, highestBidderId, ...publicRow } =
    row;
  return {
    ...publicRow,
    isMine: sellerId === viewerId,
    isHighestBidder: highestBidderId === viewerId,
    nextBid: marketplaceNextBidMinimum(row.highestBid),
  };
}

type ListedRareMapPayload = RareMapInstance & {
  marketplaceRemainingMs?: number;
};

/** 거래소 에스크로 동안 레어맵의 30분 실물 유효시간을 정지한다. */
export function pauseMarketplaceRareMap(
  inst: RareMapInstance,
  now: number,
): ListedRareMapPayload {
  return {
    ...inst,
    marketplaceRemainingMs: Math.max(
      1,
      Math.min(RARE_MAP_TTL_MS, inst.foundAt + RARE_MAP_TTL_MS - now),
    ),
  };
}

/** 구매·취소·만료 시 정지했던 남은 시간을 다시 시작한다. */
export function restoreMarketplaceRareMap(
  payload: unknown,
  now: number,
  options?: { preserveIid?: boolean },
): RareMapInstance | null {
  if (typeof payload !== "object" || payload === null) return null;
  const raw = payload as ListedRareMapPayload;
  const remainingRaw = Number(raw.marketplaceRemainingMs);
  const remaining = Number.isFinite(remainingRaw)
    ? Math.max(1, Math.min(RARE_MAP_TTL_MS, Math.floor(remainingRaw)))
    : Math.max(1, raw.foundAt + RARE_MAP_TTL_MS - now);
  const [parsed] = parseRareMaps(
    [
      {
        ...raw,
        iid: options?.preserveIid ? raw.iid : genRareMapIid(),
        foundAt: now - (RARE_MAP_TTL_MS - remaining),
      },
    ],
    now,
  );
  return parsed ?? null;
}

export function isValidMaterialQty(q: unknown): q is number {
  return (
    typeof q === "number" &&
    Number.isInteger(q) &&
    q >= 1 &&
    q <= MARKETPLACE_V2_MATERIAL_QTY_MAX
  );
}

export function isMarketKind(s: unknown): s is MarketKind {
  return s === "equip" || s === "material" || s === "consumable";
}

export function isStackableMarketplaceItem(
  kind: MarketKind,
  itemId: string,
): boolean {
  return (
    kind === "material" ||
    (kind === "consumable" &&
      (isTradeableMuseunCashItemId(itemId) ||
        isCookingFoodId(itemId) ||
        fishIdFromSpecimenItemId(itemId) !== null))
  );
}

export function marketplaceUnitPrice(price: number, quantity: number): number {
  return Math.max(1, Math.ceil(price / Math.max(1, Math.floor(quantity))));
}

/** 기존 총액 매물을 일부 체결할 때 배분할 금액. 잔여 매물 가격도 최소 1골드로 보존한다. */
export function marketplacePartialPrice(
  price: number,
  quantity: number,
  purchaseQuantity: number,
): number | null {
  const safeQuantity = Math.max(1, Math.floor(quantity));
  const take = Math.max(1, Math.min(safeQuantity, Math.floor(purchaseQuantity)));
  if (take >= safeQuantity) return price;
  if (price <= MARKETPLACE_V2_PRICE_MIN) return null;
  return Math.min(
    price - MARKETPLACE_V2_PRICE_MIN,
    marketplaceUnitPrice(price, safeQuantity) * take,
  );
}

// 거래 가능 종류 판정 — 카탈로그에 실재하는 id 인지(타입 가드 겸).
export function isTradableEquip(id: string): id is V2EquipmentId {
  return Object.prototype.hasOwnProperty.call(V2_EQUIPMENT, id);
}

/** 장비 구매 주문 하한. NPC에 바로 팔아도 받는 금액보다 싼 계정 간 몰아주기를 차단한다. */
export function equipmentBuyOrderMinimumPrice(id: string): number | null {
  if (!isTradableEquip(id)) return null;
  return sellPriceOf(V2_EQUIPMENT[id]);
}

export type MarketplaceEquipListError =
  | "not_tradable"
  | "enhanced"
  | "locked"
  | "equipped";

// 장비 등록 정책의 서버 권위 판정. 강화에 투자한 개체는 캐릭터에 귀속되어 거래할 수 없다.
export function marketplaceEquipListError(
  inst: Pick<V2EquipInstance, "id" | "enhance" | "locked">,
  isEquipped: boolean,
): MarketplaceEquipListError | null {
  if (!isTradableEquip(inst.id)) return "not_tradable";
  if (inst.enhance) return "enhanced";
  if (inst.locked) return "locked";
  if (isEquipped) return "equipped";
  return null;
}

export function isTradableMaterial(id: string): id is V2MaterialId {
  return (
    Object.prototype.hasOwnProperty.call(V2_MATERIALS, id) &&
    (V2_REFORGE_ENABLED || !isReforgeStoneMaterialId(id))
  );
}

// 등록 시점 이름 스냅샷용 — 카탈로그 표시명.
export function itemDisplayName(kind: MarketKind, id: string): string | null {
  if (kind === "equip") return isTradableEquip(id) ? V2_EQUIPMENT[id].name : null;
  if (kind === "consumable") {
    if (isMuseunCashItemId(id)) return MUSEUN_CASH_ITEMS[id].name;
    if (isCookingFoodId(id)) return cookingFoodDefinition(id)?.name ?? null;
    const specimenFishId = fishIdFromSpecimenItemId(id);
    if (specimenFishId) return `${FISH[specimenFishId].name} 표본`;
    return id in RARE_MAP_KINDS
      ? RARE_MAP_KINDS[id as keyof typeof RARE_MAP_KINDS].name
      : null;
  }
  return isTradableMaterial(id) ? V2_MATERIALS[id].name : null;
}

// 조회 표시명 — 장비/재료는 카탈로그 이름 변경을 즉시 반영하고, 레어맵은 깊이 정보가 들어간
// 등록 시점 표시명(예: "희귀 지도 (깊이 12)")을 유지한다.
export function currentMarketplaceItemName(
  kind: string,
  id: string,
  storedName: string,
): string {
  if (!isMarketKind(kind)) return storedName;
  if (kind === "consumable") {
    if (isMuseunCashItemId(id)) return MUSEUN_CASH_ITEMS[id].name;
    if (isCookingFoodId(id)) return cookingFoodDefinition(id)?.name ?? storedName;
    const specimenFishId = fishIdFromSpecimenItemId(id);
    if (specimenFishId) return `${FISH[specimenFishId].name} 표본`;
    return storedName;
  }
  return itemDisplayName(kind, id) ?? storedName;
}

// 플레이어 표시 이름 — dual-source: users.gameName(권위) → character-profile.v2.name(레거시).
//   없으면 null. (inbox/send 의 resolveSenderName 과 동일 규약.)
export async function resolvePlayerName(
  executor: DbExecutor,
  userId: string,
): Promise<string | null> {
  const [u] = await executor
    .select({ name: users.gameName })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (typeof u?.name === "string" && u.name.length > 0) return u.name;
  const [profile] = await executor
    .select({ value: savesKv.value })
    .from(savesKv)
    .where(
      and(eq(savesKv.userId, userId), eq(savesKv.key, "character-profile.v2")),
    )
    .limit(1);
  const legacy = (profile?.value as { name?: unknown } | undefined)?.name;
  if (typeof legacy === "string" && legacy.length > 0) return legacy;
  return null;
}
