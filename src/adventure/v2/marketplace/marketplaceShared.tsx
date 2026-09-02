// v2 거래소 공용 — 타입·시세/시가 헬퍼·시세줄/가격입력 leaf 컴포넌트.
//   V2MarketplaceView(코디네이터)와 판매 탭 컴포넌트들이 공유(중복 방지).

import {
  V2_EQUIPMENT,
  effectiveStats,
  parseCraftedBy,
  parseEquipRollForItem,
  parseInstanceCraftQuality,
  parseInstanceEnhance,
  powerWithBonuses,
  v2EquipStatRows,
  type V2Equipment,
  type V2CraftQualityState,
  type V2EquipRoll,
} from "@/adventure/data/v2/v2Equipment";
import { rollQualityPct } from "@/adventure/data/v2/v2EquipVariance";
import type { V2EnhanceState } from "@/adventure/data/v2/v2Enhance";
export {
  marketplaceCraftPriceKey,
  marketplacePriceKeyForEquipInstance,
  marketplacePriceKeyForPayload,
} from "@/adventure/data/v2/marketplacePriceKeys";
import { NumberInput } from "@/components/ui/NumberInput";

// 판매세는 서버 권위 — 여기 0.05 는 순수령 미리보기용(표시 advisory).
export const TAX_RATE_DISPLAY = 0.05;
export const netPreview = (price: number) =>
  Math.floor(price * (1 - TAX_RATE_DISPLAY));

// 시세 집계(/api/v2/marketplace/prices) — itemId 별 최근 판매 통계.
export type PriceStat = {
  n: number;
  avg: number;
  min: number;
  max: number;
  unitAvg?: number;
  unitMin?: number;
  unitMax?: number;
};

export type MarketplacePricePosition = {
  tone: "deal" | "fair";
  label: string;
};

export function marketplacePricePosition(
  price: number,
  stat?: PriceStat,
): MarketplacePricePosition | null {
  if (!stat || stat.n <= 0 || stat.avg <= 0) return null;
  const differencePct = ((price - stat.avg) / stat.avg) * 100;
  if (differencePct <= -5) {
    return {
      tone: "deal",
      label: `평균보다 ${Math.round(Math.abs(differencePct))}% 저렴`,
    };
  }
  if (differencePct >= 5) {
    return null;
  }
  return { tone: "fair", label: "시세 수준" };
}

export type Listing = {
  id: number;
  isMine: boolean;
  isHighestBidder: boolean;
  hasMyBid: boolean;
  kind: "equip" | "material" | "consumable";
  itemId: string;
  itemName: string;
  quantity: number;
  price: number;
  instancePayload: unknown;
  createdAt: string;
  bidEndsAt: string;
  expiresAt: string;
  highestBid: number | null;
  bidCount: number;
  bidResolvedAt: string | null;
  nextBid: number;
};

export type MarketplaceBrowseSort =
  | "price_asc"
  | "price_desc"
  | "power_asc"
  | "power_desc"
  | "roll_asc"
  | "roll_desc"
  | "crafter_asc"
  | "crafter_desc"
  | "newest"
  | "oldest";

function listingCraftMetadata(payload: unknown) {
  const raw = payload as {
    craftQuality?: unknown;
    craftedBy?: unknown;
    enhance?: unknown;
  } | null;
  const craftedBy = parseCraftedBy(raw?.craftedBy);
  const craftQuality = parseInstanceCraftQuality(
    raw?.craftQuality,
    raw?.enhance,
    craftedBy,
  );
  return {
    craftedBy,
    craftQuality,
    enhance: parseInstanceEnhance(raw?.enhance, raw?.craftQuality, craftedBy),
  };
}

/** 장비 매물 카드에 표시되는 보너스 반영 위력. 비장비/손상된 매물은 null. */
export function marketplaceListingPower(listing: Listing): number | null {
  if (listing.kind !== "equip") return null;
  const item = V2_EQUIPMENT[listing.itemId as keyof typeof V2_EQUIPMENT];
  if (!item) return null;
  const metadata = listingCraftMetadata(listing.instancePayload);
  return powerWithBonuses(
    effectiveStats(item, listingEquipRoll(item, listing.instancePayload)).power,
    metadata.enhance,
    metadata.craftQuality,
  );
}

/** 거래소 검색 결과 공용 정렬. 같은 값은 등록 시각과 id로 안정적으로 정렬한다. */
export function compareMarketplaceListings(
  a: Listing,
  b: Listing,
  sort: MarketplaceBrowseSort,
): number {
  const aMetadata = listingCraftMetadata(a.instancePayload);
  const bMetadata = listingCraftMetadata(b.instancePayload);
  const aItem =
    a.kind === "equip"
      ? V2_EQUIPMENT[a.itemId as keyof typeof V2_EQUIPMENT]
      : undefined;
  const bItem =
    b.kind === "equip"
      ? V2_EQUIPMENT[b.itemId as keyof typeof V2_EQUIPMENT]
      : undefined;
  const aRoll = aItem
    ? listingEquipRoll(aItem, a.instancePayload)
    : undefined;
  const bRoll = bItem
    ? listingEquipRoll(bItem, b.instancePayload)
    : undefined;
  const aPrice = listingUnitPrice(a);
  const bPrice = listingUnitPrice(b);
  let compared = 0;

  if (sort === "price_asc" || sort === "price_desc") {
    compared = aPrice - bPrice;
    if (sort === "price_desc") compared *= -1;
  } else if (sort === "power_asc" || sort === "power_desc") {
    compared =
      (marketplaceListingPower(a) ?? Number.NEGATIVE_INFINITY) -
      (marketplaceListingPower(b) ?? Number.NEGATIVE_INFINITY);
    if (sort === "power_desc") compared *= -1;
  } else if (sort === "roll_asc" || sort === "roll_desc") {
    const aQuality = aItem ? (rollQualityPct(aItem, aRoll) ?? -1) : -1;
    const bQuality = bItem ? (rollQualityPct(bItem, bRoll) ?? -1) : -1;
    compared = aQuality - bQuality;
    if (sort === "roll_desc") compared *= -1;
  } else if (sort === "crafter_asc" || sort === "crafter_desc") {
    compared =
      (aMetadata.craftedBy?.level ?? 0) -
      (bMetadata.craftedBy?.level ?? 0);
    if (sort === "crafter_desc") compared *= -1;
  } else {
    compared = a.createdAt.localeCompare(b.createdAt);
    if (sort === "newest") compared *= -1;
  }

  return compared || a.createdAt.localeCompare(b.createdAt) || a.id - b.id;
}

export type MarketplaceStackGroup = {
  key: string;
  kind: "material" | "consumable";
  itemId: string;
  itemName: string;
  totalQuantity: number;
  minUnitPrice: number;
  listings: Listing[];
};

export function isStackableMarketplaceListing(listing: Listing): boolean {
  if (listing.kind === "material") return true;
  if (listing.kind !== "consumable") return false;
  const payloadKind = (
    listing.instancePayload as { kind?: unknown } | null
  )?.kind;
  return payloadKind === "museun_cash_item" || payloadKind === "cooking_food";
}

export function listingUnitPrice(listing: Pick<Listing, "price" | "quantity">) {
  return Math.max(1, Math.ceil(listing.price / Math.max(1, listing.quantity)));
}

export function groupMarketplaceStackListings(
  listings: Listing[],
): MarketplaceStackGroup[] {
  const groups = new Map<string, MarketplaceStackGroup>();
  for (const listing of listings) {
    if (
      !isStackableMarketplaceListing(listing) ||
      listing.isMine ||
      listing.kind === "equip"
    ) {
      continue;
    }
    const key = `${listing.kind}:${listing.itemId}`;
    const current = groups.get(key);
    if (current) {
      current.totalQuantity += listing.quantity;
      current.minUnitPrice = Math.min(
        current.minUnitPrice,
        listingUnitPrice(listing),
      );
      current.listings.push(listing);
      continue;
    }
    groups.set(key, {
      key,
      kind: listing.kind,
      itemId: listing.itemId,
      itemName: listing.itemName,
      totalQuantity: listing.quantity,
      minUnitPrice: listingUnitPrice(listing),
      listings: [listing],
    });
  }
  return [...groups.values()];
}

export function individualMarketplaceListings(
  listings: Listing[],
  browseMode: "fixed" | "auction",
): Listing[] {
  return listings.filter(
    (listing) =>
      browseMode === "auction" ||
      !isStackableMarketplaceListing(listing) ||
      listing.isMine,
  );
}

export function marketplaceStackQuote(
  listings: Listing[],
  requestedQuantity: number,
): number | null {
  let remaining = Math.max(1, Math.floor(requestedQuantity));
  let total = 0;
  const ordered = listings.slice().sort((a, b) => {
    const priceDifference = listingUnitPrice(a) - listingUnitPrice(b);
    return priceDifference || a.createdAt.localeCompare(b.createdAt);
  });
  for (const listing of ordered) {
    if (remaining <= 0) break;
    let take = Math.min(remaining, listing.quantity);
    let fillPrice: number;
    if (take >= listing.quantity) {
      fillPrice = listing.price;
    } else if (listing.price <= 1) {
      if (remaining < listing.quantity) continue;
      take = listing.quantity;
      fillPrice = listing.price;
    } else {
      fillPrice = Math.min(
        listing.price - 1,
        listingUnitPrice(listing) * take,
      );
    }
    total += fillPrice;
    remaining -= take;
  }
  return remaining === 0 ? total : null;
}

// 페이지네이션 결과 중 탭 컴포넌트가 쓰는 부분집합(usePagination 반환과 구조 호환).
export type MarketplacePager<T> = {
  page: number;
  pageCount: number;
  pageItems: T[];
  setPage: (n: number) => void;
};

// 매물 payload 는 옛 raw roll 또는 { power, weight, options, enhance, craftQuality, craftedBy } 혼합형이다.
// craftedBy/enhance/craftQuality 만 있는 제작품은 roll 이 없으므로 undefined 로 정규화해야 카탈로그 스탯을 쓴다.
export function listingEquipRoll(
  item: V2Equipment,
  payload: unknown,
): V2EquipRoll | undefined {
  return parseEquipRollForItem(item, payload);
}

export function priceStatForKey(
  priceRef: Record<string, PriceStat>,
  itemId: string,
  preferredKey: string,
): PriceStat | undefined {
  return priceRef[preferredKey] ?? priceRef[itemId];
}

export function priceStatForQuantity(
  stat: PriceStat | undefined,
  quantity: number,
): PriceStat | undefined {
  if (
    !stat ||
    stat.unitAvg == null ||
    stat.unitMin == null ||
    stat.unitMax == null
  ) {
    return stat;
  }
  const safeQuantity = Math.max(1, Math.floor(quantity));
  return {
    ...stat,
    avg: stat.unitAvg * safeQuantity,
    min: stat.unitMin * safeQuantity,
    max: stat.unitMax * safeQuantity,
  };
}

// 장비 스탯 한 줄(개체 굴림 반영) — 기본 전투 스탯 + 슬롯 옵션. V2InventoryView 의 cardStatLine 과 동형
//   (무기 element 는 폐지 정책으로 항상 neutral → 표기 생략). 구매자가 무엇을 사는지 보이게.
function equipStatLine(
  item: V2Equipment,
  roll?: V2EquipRoll,
  enhance?: V2EnhanceState,
  craftQuality?: V2CraftQualityState,
): string {
  return v2EquipStatRows(item, roll, enhance, craftQuality)
    .map((row) => `${row.label} ${row.value}`)
    .join(" · ");
}

// 장비 매물/개체의 굴림% + 스탯줄 — itemId(카탈로그) + roll(개체 편차).
export function equipDetail(
  itemId: string,
  roll: V2EquipRoll | undefined,
  enhance?: V2EnhanceState,
  craftQuality?: V2CraftQualityState,
) {
  const item = V2_EQUIPMENT[itemId as keyof typeof V2_EQUIPMENT];
  if (!item) return null;
  return {
    pct: rollQualityPct(item, roll),
    line: equipStatLine(item, roll, enhance, craftQuality),
    enhance,
    craftQuality,
  };
}

// 시세 한 줄 — 최근 거래가 참고. 기록 없으면 표시 안 함.
export function PriceRefLine({
  stat,
  scoped,
  unit,
}: {
  stat?: PriceStat;
  scoped?: boolean;
  unit?: boolean;
}) {
  if (!stat || stat.n <= 0) return null;
  const average = unit && stat.unitAvg != null ? stat.unitAvg : stat.avg;
  const minimum = unit && stat.unitMin != null ? stat.unitMin : stat.min;
  const maximum = unit && stat.unitMax != null ? stat.unitMax : stat.max;
  const range =
    minimum === maximum
      ? ""
      : ` · ${minimum.toLocaleString()}~${maximum.toLocaleString()}`;
  return (
    <span className="text-[11px] text-sky-600 dark:text-sky-400">
      {scoped ? "동급 시세" : unit ? "개당 시세" : "시세"} 평균 {average.toLocaleString()}골드 (
      {stat.n}건{range})
    </span>
  );
}

// 최근 체결가를 가격 입력에 바로 넣는 보조 버튼. 활성 매물 호가가 아니므로
// "최근 최저"로 명시해 구매 목록의 최저가와 혼동하지 않게 한다.
export function PriceQuickFill({
  stat,
  onSelect,
  unit,
}: {
  stat?: PriceStat;
  onSelect: (price: number) => void;
  unit?: boolean;
}) {
  if (!stat || stat.n <= 0) return null;
  const useUnitPrice = unit === true;
  if (useUnitPrice && (stat.unitMin == null || stat.unitAvg == null)) {
    return null;
  }
  const suggestions = [
    [
      useUnitPrice ? "최근 최저 단가" : "최근 최저",
      useUnitPrice ? stat.unitMin! : stat.min,
    ],
    [
      useUnitPrice ? "평균 단가" : "평균가",
      useUnitPrice ? stat.unitAvg! : stat.avg,
    ],
  ] as const;
  return (
    <span className="mt-1 flex flex-wrap items-center gap-1">
      {suggestions.map(([label, value]) => (
        <button
          key={label}
          type="button"
          onClick={() => onSelect(value)}
          className="rounded-full border border-sky-200 bg-white px-2 py-0.5 text-[10px] font-medium tabular-nums text-sky-700 transition hover:bg-sky-50 dark:border-sky-800 dark:bg-zinc-900 dark:text-sky-300 dark:hover:bg-sky-950"
          aria-label={`${label} ${value.toLocaleString()}골드로 가격 입력`}
        >
          {label} {value.toLocaleString()}G
        </button>
      ))}
    </span>
  );
}

export function PricePositionBadge({
  price,
  stat,
}: {
  price: number;
  stat?: PriceStat;
}) {
  const position = marketplacePricePosition(price, stat);
  if (!position) return null;
  const toneClass = {
    deal: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
    fair: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  }[position.tone];
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${toneClass}`}>
      {position.label}
    </span>
  );
}

export function PriceInput({
  value,
  onChange,
  placeholder = "가격",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <NumberInput
      placeholder={placeholder}
      value={value}
      onValueChange={onChange}
      className="w-24 rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs tabular-nums dark:border-zinc-700 dark:bg-zinc-900"
    />
  );
}
