"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import {
  Cube,
  Flask,
  HandPalm,
  ListPlus,
  MagnifyingGlass,
  Package,
  Receipt,
  Shield,
  ShoppingCart,
  SlidersHorizontal,
  SneakerMove,
  Star,
  Storefront,
  Sword,
  X,
  type Icon,
} from "@phosphor-icons/react";
import { NecklaceIcon, RingIcon } from "./EquipmentSlotIcons";
import { timeAgoKo as timeAgo } from "@/lib/timeFormat";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { Card } from "@/components/ui/Card";
import { Pagination } from "@/components/ui/Pagination";
import { PlayerNameLink } from "@/components/ui/PlayerNameLink";
import { NumberInput, parseAmount } from "@/components/ui/NumberInput";
import {
  V2_EQUIPMENT,
  parseCraftedBy,
  parseInstanceCraftQuality,
  parseInstanceEnhance,
  type V2Equipment,
  type V2EquipmentId,
  type V2EquipInstance,
  type V2EquipRoll,
  type V2EquipSlot,
  type V2CraftedBy,
  type V2CraftQualityState,
} from "@/adventure/data/v2/v2Equipment";
import type { V2EnhanceState } from "@/adventure/data/v2/v2Enhance";
import { V2_MATERIALS } from "@/adventure/data/v2/dungeonDrops";
import { equipmentProgressionLock } from "@/adventure/data/v2/equipmentProgression";
import {
  RARE_MAP_KINDS,
  RARE_MAP_TTL_MS,
  parseRareMaps,
  type RareMapInstance,
} from "@/adventure/data/v2/rareMaps";
import {
  CraftOnlyBadge,
  CraftQualityBadge,
  EquipmentTierBadge,
  EnhanceLevelBadge,
  MasterworkBadge,
  QualityPctText,
  V2ItemCard,
  V2ItemCompareCard,
  anchorOf,
  powerNameClass,
  type ItemCardAnchor,
} from "./V2ItemCard";
import { useGameState } from "./GameStateProvider";
import { TabBar } from "@/components/ui/TabBar";
import { usePagination } from "@/lib/usePagination";
import { useSingleFlightGuard } from "@/lib/useSingleFlight";
import { marketplaceActionErrorLabel } from "./marketplace/marketplaceActionErrors";
import {
  V2_ITEM_TABS,
  itemTabForMaterial,
  itemTabForMarketplaceListing,
  sortEquipInstances,
  type V2ItemTabKey,
  type SortMode,
} from "./v2ItemListShared";
import {
  compareMarketplaceListings,
  equipDetail,
  groupMarketplaceStackListings,
  individualMarketplaceListings,
  isStackableMarketplaceListing,
  listingEquipRoll,
  marketplaceStackQuote,
  marketplacePriceKeyForPayload,
  PricePositionBadge,
  PriceRefLine,
  priceStatForKey,
  priceStatForQuantity,
  type Listing,
  type MarketplaceBrowseSort,
  type MarketplaceStackGroup,
  type PriceStat,
} from "./marketplace/marketplaceShared";
import type { EquipmentBuyOrderView } from "./marketplace/equipmentBuyOrders";
import { MarketplaceEquipmentTab } from "./marketplace/MarketplaceEquipmentTab";
import { MarketplaceMaterialTab } from "./marketplace/MarketplaceMaterialTab";
import { MarketplaceRareMapTab } from "./marketplace/MarketplaceRareMapTab";
import {
  MarketplaceStackBrowse,
  StackBuyConfirm,
} from "./marketplace/MarketplaceStackBrowse";
import { useSystemMessageState } from "./RewardToastProvider";
import { GameIcon } from "@/adventure/v2/GameIcon";
import {
  MUSEUN_CASH_ITEMS,
  MUSEUN_TRADEABLE_ITEM_IDS,
  type MuseunCashItemCounts,
  type MuseunCashItemId,
} from "@/adventure/data/v2/museunCashItems";
import {
  isCookingFoodIdFormat as isCookingFoodId,
  type CookingFoodDefinitionMap,
  type CookingFoodId,
  type CookingFoodInventory,
} from "./cooking/foodShared";
import { SURFACE_INSET } from "@/components/ui/surfaces";
import {
  equippedInstanceForMarketplaceItem,
  equippedItemIdsForMarketplace,
} from "./marketplace/equipmentComparison";
import { EquipmentCodexBadge } from "./EquipmentCodexBadge";
import { MarketplaceTradeReportButton } from "./marketplace/MarketplaceTradeReportButton";
import { marketplaceLifeItemDefinition } from "./marketplace/lifeItemCatalog";
import { marketplaceLifeItemPurchaseGroups } from "./marketplace/lifeItemPurchaseGroups";
import {
  MARKETPLACE_EQUIPMENT_TIER_OPTIONS,
  matchesMarketplaceEquipmentTier,
  type MarketplaceEquipmentTierFilter,
} from "./marketplace/marketplaceBrowseFilters";
import { FISH, type FishId } from "@/adventure/data/v2/fish";
import {
  fishSpecimenItemId,
  type FishSpecimenInventory,
} from "@/adventure/v2/fishSpecimens";

const EquipmentBuyOrderDialog = dynamic(() =>
  import("./marketplace/EquipmentBuyOrderDialog").then(
    (module) => module.EquipmentBuyOrderDialog,
  ),
);

// v2 거래소 — 장비 개체 + 재료 + 레어맵/캐시·음식 소모품 거래(고정가).
// 백엔드 /api/v2/marketplace (list/buy/cancel/browse).
//   타입·시세 헬퍼·시세줄/가격입력 leaf 컴포넌트는 marketplace/marketplaceShared 공용.

// 리스팅 payload — 굴림(+강화+제작품질+제작자) 혼합형. 옛 행은 raw roll 객체(enhance 없음).
function listingEnhance(payload: unknown): V2EnhanceState | undefined {
  const raw = payload as { craftQuality?: unknown; craftedBy?: unknown; enhance?: unknown } | null;
  const craftedBy = parseCraftedBy(raw?.craftedBy);
  return parseInstanceEnhance(raw?.enhance, raw?.craftQuality, craftedBy);
}
function listingCraftedBy(payload: unknown): V2CraftedBy | undefined {
  return parseCraftedBy((payload as { craftedBy?: unknown } | null)?.craftedBy);
}
function listingCraftQuality(payload: unknown): V2CraftQualityState | undefined {
  const raw = payload as { craftQuality?: unknown; craftedBy?: unknown; enhance?: unknown } | null;
  return parseInstanceCraftQuality(raw?.craftQuality, raw?.enhance, listingCraftedBy(payload));
}

type Tab = "browse" | "sell" | "recent" | "mine";
type MineTab = "active" | "orders" | "history";
type ListingMode = "fixed" | "auction";
type BrowseMode = "fixed" | "auction";
type SellCraftFilter =
  | "all"
  | "crafted"
  | "quality"
  | "masterwork"
  | "craftOnly";

const MARKETPLACE_TABS: ReadonlyArray<{
  key: Tab;
  label: string;
  description: string;
  Icon: Icon;
}> = [
  { key: "browse", label: "구매", description: "매물 찾기", Icon: ShoppingCart },
  { key: "sell", label: "판매", description: "아이템 올리기", Icon: ListPlus },
  { key: "recent", label: "최근 거래", description: "전체 체결", Icon: Receipt },
  { key: "mine", label: "내 거래", description: "판매·체결 관리", Icon: Package },
];

const LISTING_ICON: Record<V2ItemTabKey, Icon> = {
  weapon: Sword,
  armor: Shield,
  gloves: HandPalm,
  boots: SneakerMove,
  ring: RingIcon,
  necklace: NecklaceIcon,
  material: Cube,
  consumable: Flask,
};

export type MarketplacePreviewData = {
  viewerGold: number;
  bidGraceMinHours: number;
  bidGraceMaxHours: number;
  fixedListingHours: number;
  directListingHours?: number;
  listings: Listing[];
  prices: Record<string, PriceStat>;
};

// 최근 거래(체결 내역) 한 행 — /api/v2/marketplace/history. status='sold' 스냅샷.
type Trade = {
  id: number;
  kind: string;
  itemId: string;
  itemName: string;
  quantity: number;
  price: number;
  instancePayload: unknown;
  closedAt: string | null;
  side?: "buy" | "sell";
};

function tradeToListing(trade: Trade): Listing {
  return {
    id: trade.id,
    isMine: trade.side === "sell",
    isHighestBidder: trade.side === "buy",
    kind: trade.kind as Listing["kind"],
    itemId: trade.itemId,
    itemName: trade.itemName,
    quantity: trade.quantity,
    price: trade.price,
    instancePayload: trade.instancePayload,
    createdAt: trade.closedAt ?? "",
    bidEndsAt: trade.closedAt ?? "",
    expiresAt: trade.closedAt ?? "",
    highestBid: null,
    bidCount: 0,
    bidResolvedAt: trade.closedAt,
    nextBid: 1,
  };
}

type BuyOrder = {
  id: number;
  kind: "equip" | "material" | "consumable";
  itemId: string;
  itemName: string;
  unitPrice: number;
  quantityInitial: number;
  quantityRemaining: number;
  goldEscrow: number;
  minPower: number | null;
  minQualityPct: number | null;
  status: "active" | "filled" | "cancelled" | "expired";
  createdAt: string;
  expiresAt: string;
  closedAt: string | null;
};

type BuyOrderBookRow = {
  kind: string;
  itemId: string;
  itemName: string;
  bestUnitPrice: number;
  totalQuantity: number;
  orderCount: number;
  levels: Array<{
    unitPrice: number;
    totalQuantity: number;
    orderCount: number;
  }>;
};

type PriceAlert = {
  id: number;
  kind: "material" | "consumable";
  itemId: string;
  itemName: string;
  targetUnitPrice: number;
  status: "active" | "triggered" | "cancelled";
  createdAt: string;
  triggeredAt: string | null;
};

// 거래소 목록 한 페이지에 보여줄 아이템 수.
const MARKETPLACE_PAGE_SIZE = 10;
const MARKETPLACE_FAVORITES_KEY = "adventure.marketplace.favorites.v1";
const MARKETPLACE_RECENT_SEARCHES_KEY = "adventure.marketplace.searches.v1";

type BrowseSortButton = {
  key: string;
  label: string;
  ascending: MarketplaceBrowseSort;
  descending: MarketplaceBrowseSort;
  initial: MarketplaceBrowseSort;
};

const EQUIPMENT_BROWSE_SORT_BUTTONS: readonly BrowseSortButton[] = [
  { key: "price", label: "가격", ascending: "price_asc", descending: "price_desc", initial: "price_asc" },
  { key: "power", label: "위력", ascending: "power_asc", descending: "power_desc", initial: "power_desc" },
  { key: "roll", label: "품질", ascending: "roll_asc", descending: "roll_desc", initial: "roll_desc" },
  { key: "crafter", label: "제작 숙련", ascending: "crafter_asc", descending: "crafter_desc", initial: "crafter_desc" },
  { key: "created", label: "등록일", ascending: "oldest", descending: "newest", initial: "newest" },
];

const STACK_BROWSE_SORT_BUTTONS: readonly BrowseSortButton[] = [
  EQUIPMENT_BROWSE_SORT_BUTTONS[0],
  EQUIPMENT_BROWSE_SORT_BUTTONS[4],
];

export function actionErrorLabel(
  payload: Parameters<typeof marketplaceActionErrorLabel>[0],
  status: number,
) {
  return marketplaceActionErrorLabel(payload, status);
}

export function V2MarketplaceView({
  onBack,
  preview,
}: {
  onBack: () => void;
  preview?: MarketplacePreviewData;
}) {
  // 구매 affordability — flag off 면 보유(viewerGold)만, on 이면 보유+은행(은행 골드로도 구매).
  const { coreLoopOn, bankedGold, frontierDepth, refreshGameState } =
    useGameState();
  const [tab, setTab] = useState<Tab>("browse");
  const [mineTab, setMineTab] = useState<MineTab>("active");
  // 둘러보기 — 인벤토리/판매 탭과 같은 6부위 + 재료 + 소모품 하위 탭.
  const [browseTab, setBrowseTab] = useState<V2ItemTabKey>("weapon");
  // 판매 탭 — 인벤토리와 동일하게 슬롯 서브탭 + 정렬 + 페이지네이션.
  const [sellTab, setSellTab] = useState<V2ItemTabKey>("weapon");
  const [sellSort, setSellSort] = useState<SortMode>("default");
  const [sellCraftFilter, setSellCraftFilter] =
    useState<SellCraftFilter>("all");
  const [listings, setListings] = useState<Listing[] | null>(
    preview?.listings ?? null,
  );
  const [mine, setMine] = useState<Listing[] | null>(null);
  // 최근 거래 — Trade 를 Listing 형태로 매핑(ListingList 재사용). createdAt 자리 = 체결 시각.
  const [recentTrades, setRecentTrades] = useState<Listing[] | null>(null);
  const [myHistory, setMyHistory] = useState<Listing[] | null>(null);
  const [buyOrders, setBuyOrders] = useState<BuyOrder[] | null>(null);
  const [buyOrderBook, setBuyOrderBook] = useState<Record<string, BuyOrderBookRow>>({});
  const [equipmentBuyOrders, setEquipmentBuyOrders] = useState<
    EquipmentBuyOrderView[]
  >([]);
  const [priceAlerts, setPriceAlerts] = useState<PriceAlert[] | null>(null);
  // 팔기 — 내 인벤(미강화·미장착·미잠금 장비 + 재료).
  const [owned, setOwned] = useState<V2EquipInstance[]>([]);
  const [equipped, setEquipped] = useState<Partial<Record<V2EquipSlot, string>>>({});
  const [materials, setMaterials] = useState<Record<string, number>>({});
  const [rareMaps, setRareMaps] = useState<RareMapInstance[]>([]);
  const [cashItems, setCashItems] = useState<MuseunCashItemCounts>({});
  const [cookingFoods, setCookingFoods] = useState<CookingFoodInventory>({});
  const [cookingFoodDefinitions, setCookingFoodDefinitions] = useState<CookingFoodDefinitionMap>({});
  const [fishSpecimens, setFishSpecimens] = useState<FishSpecimenInventory["items"]>({});
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [qtys, setQtys] = useState<Record<string, string>>({});
  const [graceHours, setGraceHours] = useState(
    preview?.bidGraceMinHours ?? 2,
  );
  const [listingMode, setListingMode] = useState<ListingMode>("fixed");
  const [busy, setBusy] = useState(false);
  const beginAction = useSingleFlightGuard();
  const [msg, setMsg] = useSystemMessageState();
  const [error, setError] = useState<string | null>(null);
  const [gold, setGold] = useState<number | null>(preview?.viewerGold ?? null);
  // 둘러보기 — 구매 확인 모달 + 정렬/필터/검색(클라이언트측, 반환된 매물 위).
  const [confirmBuy, setConfirmBuy] = useState<Listing | null>(null);
  const [confirmStackBuy, setConfirmStackBuy] = useState<{
    group: MarketplaceStackGroup;
    quantity: number;
    totalPrice: number;
  } | null>(null);
  const [marketToolGroup, setMarketToolGroup] =
    useState<MarketplaceStackGroup | null>(null);
  const [orderCatalogOpen, setOrderCatalogOpen] = useState(false);
  const [equipmentOrderOpen, setEquipmentOrderOpen] = useState(false);
  const [repriceValues, setRepriceValues] = useState<Record<number, string>>({});
  const [confirmBid, setConfirmBid] = useState<Listing | null>(null);
  const [bidAmount, setBidAmount] = useState("");
  const [publicBids, setPublicBids] = useState<
    Array<{ amount: number; createdAt: string; isMine: boolean }>
  >([]);
  const [search, setSearch] = useState("");
  const [browseMode, setBrowseMode] = useState<BrowseMode>("fixed");
  const [favoriteKeys, setFavoriteKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [stackBuyQtys, setStackBuyQtys] = useState<Record<string, string>>({});
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [craftedOnly, setCraftedOnly] = useState(false);
  const [craftedQualityFilter, setCraftedQualityFilter] = useState<
    "all" | "plus1"
  >("all");
  const [craftedLevelFilter, setCraftedLevelFilter] = useState<
    "all" | "2" | "3" | "4" | "5"
  >("all");
  const [equipmentTierFilter, setEquipmentTierFilter] =
    useState<MarketplaceEquipmentTierFilter>("all");
  const [sort, setSort] = useState<MarketplaceBrowseSort>("price_asc");
  // 시세 — itemId → 최근 거래 집계(건수·평균·최저·최고). 가격 판단 참고용.
  const [priceRef, setPriceRef] = useState<Record<string, PriceStat>>(
    preview?.prices ?? {},
  );
  const [bidGraceMinHours, setBidGraceMinHours] = useState(
    preview?.bidGraceMinHours ?? 2,
  );
  const [bidGraceMaxHours, setBidGraceMaxHours] = useState(
    preview?.bidGraceMaxHours ?? 24,
  );
  const [fixedListingHours, setFixedListingHours] = useState(
    preview?.fixedListingHours ?? 2,
  );
  const [directListingHours, setDirectListingHours] = useState(
    preview?.directListingHours ?? 24,
  );
  const [clockMs, setClockMs] = useState(() => Date.now());
  // 아이템 옵션 카드(클릭 시 뜨는 팝오버) — 장비만(재료는 옵션 없음). V2ItemCard 재사용(읽기전용).
  const [card, setCard] = useState<{
    item: V2Equipment;
    roll?: V2EquipRoll;
    enhance?: V2EnhanceState;
    craftQuality?: V2CraftQualityState;
    craftedBy?: V2CraftedBy;
    anchor: ItemCardAnchor;
    compare?: boolean;
  } | null>(null);

  const loadBrowse = useCallback(async (mineOnly: boolean) => {
    const res = await fetch(`/api/v2/marketplace/browse${mineOnly ? "?mine=1" : ""}`);
    const j = (await res.json().catch(() => null)) as {
      ok?: boolean;
      viewerGold?: number;
      bidGraceMinHours?: number;
      bidGraceMaxHours?: number;
      fixedListingHours?: number;
      directListingHours?: number;
      listings?: Listing[];
    } | null;
    if (!res.ok || !j?.ok) throw new Error(`목록 로드 실패 (${res.status})`);
    if (typeof j.viewerGold === "number") setGold(j.viewerGold);
    if (typeof j.bidGraceMinHours === "number") {
      setBidGraceMinHours(j.bidGraceMinHours);
      setGraceHours((current) => Math.max(j.bidGraceMinHours!, current));
    }
    if (typeof j.bidGraceMaxHours === "number") {
      setBidGraceMaxHours(j.bidGraceMaxHours);
    }
    if (typeof j.fixedListingHours === "number") {
      setFixedListingHours(j.fixedListingHours);
    }
    if (typeof j.directListingHours === "number") {
      setDirectListingHours(j.directListingHours);
    }
    if (mineOnly) setMine(j.listings ?? []);
    else setListings(j.listings ?? []);
  }, []);

  const loadEquipment = useCallback(async () => {
    const response = await fetch("/api/v2/me/equipment");
    if (!response.ok) return;
    const payload = (await response.json()) as {
      owned?: V2EquipInstance[];
      equipped?: Partial<Record<V2EquipSlot, string>>;
    };
    setOwned(payload.owned ?? []);
    setEquipped(payload.equipped ?? {});
  }, []);

  const loadInventory = useCallback(async () => {
    const [, inv, rm, specimenResponse] = await Promise.all([
      loadEquipment(),
      fetch("/api/v2/me/inventory"),
      fetch("/api/v2/me/rare-maps"),
      fetch("/api/v2/me/fishing-specimens"),
    ]);
    if (inv.ok) {
      const j = (await inv.json()) as { materials?: Record<string, number>; marketplaceMaterials?: Record<string, number>; cookingFoods?: CookingFoodInventory; cookingFoodDefinitions?: CookingFoodDefinitionMap };
      setMaterials(j.marketplaceMaterials ?? j.materials ?? {});
      setCookingFoods(j.cookingFoods ?? {});
      setCookingFoodDefinitions(j.cookingFoodDefinitions ?? {});
    }
    if (rm.ok) {
      const j = (await rm.json()) as {
        rareMaps?: RareMapInstance[];
        cashItems?: MuseunCashItemCounts;
      };
      setRareMaps(j.rareMaps ?? []);
      setCashItems(j.cashItems ?? {});
    }
    if (specimenResponse.ok) {
      const json = (await specimenResponse.json()) as {
        specimens?: FishSpecimenInventory["items"];
      };
      setFishSpecimens(json.specimens ?? {});
    }
  }, [loadEquipment]);

  const loadPrices = useCallback(async () => {
    const res = await fetch("/api/v2/marketplace/prices");
    if (!res.ok) return;
    const j = (await res.json().catch(() => null)) as {
      ok?: boolean;
      prices?: Record<string, PriceStat>;
    } | null;
    if (j?.ok && j.prices) setPriceRef(j.prices);
  }, []);

  const loadHistory = useCallback(async (mineOnly: boolean) => {
    const res = await fetch(
      `/api/v2/marketplace/history${mineOnly ? "?mine=1" : ""}`,
    );
    const j = (await res.json().catch(() => null)) as {
      ok?: boolean;
      trades?: Trade[];
    } | null;
    if (!res.ok || !j?.ok) throw new Error(`거래 내역 로드 실패 (${res.status})`);
    // ListingList 재사용 — createdAt 자리에 체결 시각(closedAt). expiry 미전달이라 timeAgo 에만 쓰임.
    const rows = (j.trades ?? []).map(tradeToListing);
    if (mineOnly) setMyHistory(rows);
    else setRecentTrades(rows);
  }, []);

  const loadMarketAutomation = useCallback(async () => {
    const [ordersResponse, alertsResponse] = await Promise.all([
      fetch("/api/v2/marketplace/buy-orders"),
      fetch("/api/v2/marketplace/price-alerts"),
    ]);
    if (ordersResponse.ok) {
      const payload = (await ordersResponse.json()) as {
        ok?: boolean;
        mine?: BuyOrder[];
        book?: BuyOrderBookRow[];
        equipmentOrders?: EquipmentBuyOrderView[];
      };
      if (payload.ok) {
        setBuyOrders(payload.mine ?? []);
        setBuyOrderBook(
          Object.fromEntries(
            (payload.book ?? []).map((row) => [
              `${row.kind}:${row.itemId}`,
              row,
            ]),
          ),
        );
        setEquipmentBuyOrders(payload.equipmentOrders ?? []);
      }
    }
    if (alertsResponse.ok) {
      const payload = (await alertsResponse.json()) as {
        ok?: boolean;
        alerts?: PriceAlert[];
      };
      if (payload.ok) setPriceAlerts(payload.alerts ?? []);
    }
  }, []);

  // 탭 전환 시 해당 데이터 로드. 둘러보기·팔기는 시세도 함께(가격 판단 참고).
  useEffect(() => {
    if (preview) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 탭 전환 시 이전 에러 클리어
    setError(null);
    if (tab === "browse") {
      void loadBrowse(false).catch((e) => setError(String(e.message ?? e)));
      void loadEquipment();
      void loadPrices();
    } else if (tab === "recent") {
      void loadHistory(false).catch((e) => setError(String(e.message ?? e)));
    } else if (tab === "mine") {
      void loadBrowse(true).catch((e) => setError(String(e.message ?? e)));
      void loadHistory(true).catch((e) => setError(String(e.message ?? e)));
      void loadEquipment();
      void loadPrices();
    } else {
      void loadInventory().catch(() => setError("인벤토리 로드 실패"));
      void loadPrices();
      void loadMarketAutomation();
    }
  }, [
    tab,
    loadBrowse,
    loadEquipment,
    loadInventory,
    loadPrices,
    loadHistory,
    loadMarketAutomation,
    preview,
  ]);

  const automationSurfaceOpen =
    marketToolGroup != null ||
    orderCatalogOpen ||
    equipmentOrderOpen ||
    (tab === "mine" && mineTab === "orders");

  useEffect(() => {
    if (preview || !automationSurfaceOpen) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 화면이 열린 뒤 비동기 응답에서 상태를 갱신한다.
    void loadMarketAutomation();
  }, [automationSurfaceOpen, loadMarketAutomation, preview]);

  useEffect(() => {
    const timer = window.setInterval(() => setClockMs(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (preview || (tab !== "browse" && tab !== "mine")) return;
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      const requests = [loadBrowse(tab === "mine")];
      if (automationSurfaceOpen) requests.push(loadMarketAutomation());
      void Promise.all(requests).catch(() => {
        // 주기 갱신 실패는 현재 목록을 유지하고 다음 주기에 재시도한다.
      });
    };
    const timer = window.setInterval(refresh, 10_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [
    automationSurfaceOpen,
    loadBrowse,
    loadMarketAutomation,
    preview,
    tab,
  ]);

  useEffect(() => {
    try {
      const saved = JSON.parse(
        window.localStorage.getItem(MARKETPLACE_FAVORITES_KEY) ?? "[]",
      ) as unknown;
      if (Array.isArray(saved)) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- 브라우저별 즐겨찾기 복원
        setFavoriteKeys(
          new Set(saved.filter((value): value is string => typeof value === "string")),
        );
      }
      const savedSearches = JSON.parse(
        window.localStorage.getItem(MARKETPLACE_RECENT_SEARCHES_KEY) ?? "[]",
      ) as unknown;
      if (Array.isArray(savedSearches)) {
        setRecentSearches(
          savedSearches
            .filter((value): value is string => typeof value === "string")
            .slice(0, 5),
        );
      }
    } catch {
      // 손상된 로컬 값은 빈 즐겨찾기로 무시한다.
    }
  }, []);

  const toggleFavorite = (key: string) => {
    setFavoriteKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      window.localStorage.setItem(
        MARKETPLACE_FAVORITES_KEY,
        JSON.stringify([...next]),
      );
      return next;
    });
  };

  const rememberSearch = (value: string) => {
    const query = value.trim();
    if (!query) return;
    setRecentSearches((current) => {
      const next = [query, ...current.filter((item) => item !== query)].slice(0, 5);
      window.localStorage.setItem(
        MARKETPLACE_RECENT_SEARCHES_KEY,
        JSON.stringify(next),
      );
      return next;
    });
  };

  const handleBrowseTabChange = useCallback((nextTab: V2ItemTabKey) => {
    setBrowseTab(nextTab);
    if (nextTab === "material" || nextTab === "consumable") {
      setSort((current) =>
        current.startsWith("power_") ||
        current.startsWith("roll_") ||
        current.startsWith("crafter_")
          ? "price_asc"
          : current,
      );
    }
  }, []);

  const act = useCallback(
    async (
      url: string,
      body: Record<string, unknown>,
      okMsg: string,
      after: () => Promise<void>,
      method: "POST" | "PATCH" = "POST",
    ) => {
      const release = beginAction();
      if (!release) return false;
      setBusy(true);
      setError(null);
      setMsg(null);
      try {
        const res = await fetch(url, {
          method,
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        const j = (await res.json().catch(() => null)) as
          | {
              ok?: boolean;
              error?: string;
              retryAfterSec?: number;
              slotLimit?: number;
              minimumPrice?: number;
              reason?: string;
              expiresAt?: string;
              permanent?: boolean;
            }
          | null;
        if (!res.ok || !j?.ok) {
          setError(
            actionErrorLabel(j, res.status),
          );
          return false;
        }
        setMsg(okMsg);
        await after();
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "처리 실패");
        return false;
      } finally {
        release();
        setBusy(false);
      }
    },
    [beginAction, setMsg],
  );

  const buy = (l: Listing) =>
    act("/api/v2/marketplace/buy", { listingId: l.id }, `✓ ${l.itemName} 구매 완료`, async () => {
      // 은행 우선 소비 후 컨텍스트(은행 잔액=구매 게이트 기준)도 갱신 — 안 하면 stale.
      await loadBrowse(false);
      await refreshGameState();
    });
  const buyStack = (
    group: MarketplaceStackGroup,
    quantity: number,
    maxTotalPrice: number,
  ) =>
    act(
      "/api/v2/marketplace/buy-stack",
      {
        kind: group.kind,
        itemId: group.itemId,
        quantity,
        maxTotalPrice,
      },
      `✓ ${group.itemName} ${quantity.toLocaleString()}개 구매 완료`,
      async () => {
        await loadBrowse(false);
        await refreshGameState();
      },
    );
  const cancel = (l: Listing) =>
    act("/api/v2/marketplace/cancel", { listingId: l.id }, "✓ 매물 취소 — 아이템 반환", () => loadBrowse(true));
  const createBuyOrder = async (
    group: MarketplaceStackGroup,
    quantity: number,
    unitPrice: number,
    days: number,
  ) => {
    const ok = await act(
      "/api/v2/marketplace/buy-orders",
      {
        kind: group.kind,
        itemId: group.itemId,
        quantity,
        unitPrice,
        days,
      },
      `✓ ${group.itemName} 구매 주문 등록`,
      async () => {
        await Promise.all([loadMarketAutomation(), loadBrowse(false)]);
        await refreshGameState();
      },
    );
    if (ok) setMarketToolGroup(null);
    return ok;
  };
  const createEquipmentBuyOrder = async (
    itemId: V2EquipmentId,
    minPower: number,
    minQualityPct: number,
    unitPrice: number,
    days: number,
  ) =>
    act(
      "/api/v2/marketplace/buy-orders",
      {
        kind: "equip",
        itemId,
        quantity: 1,
        minPower,
        minQualityPct,
        unitPrice,
        days,
      },
      `✓ ${V2_EQUIPMENT[itemId].name} 장비 구매 주문 등록`,
      async () => {
        await loadMarketAutomation();
        await refreshGameState();
      },
    );
  const createPriceAlert = (
    group: MarketplaceStackGroup,
    targetUnitPrice: number,
  ) =>
    act(
      "/api/v2/marketplace/price-alerts",
      {
        kind: group.kind,
        itemId: group.itemId,
        targetUnitPrice,
      },
      `✓ ${group.itemName} 가격 알림 저장`,
      loadMarketAutomation,
    );
  const cancelBuyOrder = (order: BuyOrder) =>
    act(
      "/api/v2/marketplace/buy-orders/cancel",
      { orderId: order.id },
      `✓ ${order.itemName} 구매 주문 취소`,
      loadMarketAutomation,
    );
  const sellEquipmentToBuyOrder = (inst: V2EquipInstance) =>
    act(
      "/api/v2/marketplace/buy-orders/sell-equipment",
      { iid: inst.iid },
      `✓ ${V2_EQUIPMENT[inst.id]?.name ?? inst.id} 구매 주문에 판매`,
      async () => {
        await Promise.all([loadInventory(), loadMarketAutomation()]);
      },
    );
  const sellEquipmentBatchToBuyOrders = (instances: V2EquipInstance[]) =>
    act(
      "/api/v2/marketplace/buy-orders/sell-equipment-batch",
      { iids: instances.map((instance) => instance.iid) },
      "✓ 일괄 판매 완료 — 변동된 주문은 자동 제외",
      async () => {
        await Promise.all([loadInventory(), loadMarketAutomation()]);
      },
    );
  const updateBuyOrder = (
    order: BuyOrder,
    quantity: number,
    unitPrice: number,
    days: number,
    minPower?: number,
    minQualityPct?: number,
  ) =>
    act(
      "/api/v2/marketplace/buy-orders",
      {
        orderId: order.id,
        quantity,
        unitPrice,
        days,
        ...(minPower == null ? {} : { minPower }),
        ...(minQualityPct == null ? {} : { minQualityPct }),
      },
      `✓ ${order.itemName} 구매 주문 수정`,
      async () => {
        await Promise.all([loadMarketAutomation(), loadBrowse(true)]);
        await refreshGameState();
      },
      "PATCH",
    );
  const cancelPriceAlert = (alert: PriceAlert) =>
    act(
      "/api/v2/marketplace/price-alerts",
      { action: "cancel", alertId: alert.id },
      `✓ ${alert.itemName} 가격 알림 취소`,
      loadMarketAutomation,
    );
  const repriceListing = (listing: Listing) => {
    const price = parseAmount(repriceValues[listing.id] ?? "");
    if (!Number.isInteger(price) || price < 1) {
      setError(
        isStackableMarketplaceListing(listing)
          ? "새 개당 가격을 입력하세요."
          : "새 가격을 입력하세요.",
      );
      return;
    }
    return act(
      "/api/v2/marketplace/reprice",
      { listingId: listing.id, price },
      `✓ ${listing.itemName} 가격 변경`,
      async () => {
        await Promise.all([loadBrowse(true), loadMarketAutomation()]);
      },
    );
  };

  const openBid = async (listing: Listing) => {
    setConfirmBid(listing);
    setBidAmount(String(listing.nextBid));
    setPublicBids([]);
    const res = await fetch(
      `/api/v2/marketplace/bids?listingId=${listing.id}`,
    );
    const payload = (await res.json().catch(() => null)) as {
      ok?: boolean;
      bids?: Array<{ amount: number; createdAt: string; isMine: boolean }>;
    } | null;
    if (res.ok && payload?.ok) setPublicBids(payload.bids ?? []);
  };

  const placeBid = () => {
    const listing = confirmBid;
    const amount = parseAmount(bidAmount);
    if (!listing || !Number.isInteger(amount) || amount < listing.nextBid) {
      setError(
        `다음 입찰가는 ${listing?.nextBid.toLocaleString() ?? 1}골드 이상이어야 합니다.`,
      );
      return;
    }
    return act(
      "/api/v2/marketplace/bid",
      { listingId: listing.id, amount },
      `✓ ${amount.toLocaleString()}골드 입찰 완료`,
      async () => {
        setConfirmBid(null);
        await loadBrowse(false);
        await refreshGameState();
      },
    );
  };

  const listEquip = (inst: V2EquipInstance) => {
    const price = parseAmount(prices[inst.iid]);
    if (!Number.isInteger(price) || price < 1) {
      setError("가격은 1 이상 정수로 입력하세요.");
      return;
    }
    return act(
      "/api/v2/marketplace/list",
      {
        kind: "equip",
        iid: inst.iid,
        price,
        graceHours: listingMode === "fixed" ? 0 : graceHours,
      },
      `✓ ${V2_EQUIPMENT[inst.id]?.name ?? inst.id} 등록`,
      loadInventory,
    );
  };
  const listMaterial = (matId: string) => {
    const unitPrice = parseAmount(prices[matId]);
    const qty = Number(qtys[matId] ?? "1");
    if (!Number.isInteger(unitPrice) || unitPrice < 1) {
      setError("개당 가격은 1 이상 정수로 입력하세요.");
      return;
    }
    if (!Number.isInteger(qty) || qty < 1) {
      setError("수량은 1 이상 정수로 입력하세요.");
      return;
    }
    const price = unitPrice * qty;
    if (!Number.isSafeInteger(price) || price > 999_999_999) {
      setError("판매 총액은 999,999,999골드를 넘을 수 없어요.");
      return;
    }
    return act(
      "/api/v2/marketplace/list",
      {
        kind: "material",
        itemId: matId,
        quantity: qty,
        price,
        graceHours: listingMode === "fixed" ? 0 : graceHours,
      },
      `✓ ${V2_MATERIALS[matId]?.name ?? marketplaceLifeItemDefinition(matId)?.name ?? matId} ${qty}개 · 개당 ${unitPrice.toLocaleString()}골드 등록`,
      loadInventory,
    );
  };

  // 레어맵 등록 — 개체 단위(가격만 입력).
  const listConsumable = (iid: string) => {
    const price = parseAmount(prices[iid]);
    if (!Number.isInteger(price) || price < 1) {
      setError("가격은 1 이상 정수로 입력하세요.");
      return;
    }
    return act(
      "/api/v2/marketplace/list",
      {
        kind: "consumable",
        iid,
        price,
        graceHours: listingMode === "fixed" ? 0 : graceHours,
      },
      "✓ 레어맵 등록",
      loadInventory,
    );
  };

  const listCashItem = (itemId: MuseunCashItemId) => {
    const unitPrice = parseAmount(prices[itemId]);
    const quantity = parseAmount(qtys[itemId] ?? "1");
    if (!Number.isInteger(unitPrice) || unitPrice < 1) {
      setError("개당 가격은 1 이상 정수로 입력하세요.");
      return;
    }
    if (!Number.isInteger(quantity) || quantity < 1) {
      setError("수량은 1 이상 정수로 입력하세요.");
      return;
    }
    const price = unitPrice * quantity;
    if (!Number.isSafeInteger(price) || price > 999_999_999) {
      setError("판매 총액은 999,999,999골드를 넘을 수 없어요.");
      return;
    }
    return act(
      "/api/v2/marketplace/list",
      {
        kind: "consumable",
        itemId,
        quantity,
        price,
        graceHours: listingMode === "fixed" ? 0 : graceHours,
      },
      `✓ ${MUSEUN_CASH_ITEMS[itemId].name} ${quantity}개 등록`,
      loadInventory,
    );
  };

  const listCookingFood = (itemId: CookingFoodId) => {
    const unitPrice = parseAmount(prices[itemId]);
    const quantity = parseAmount(qtys[itemId] ?? "1");
    if (!Number.isInteger(unitPrice) || unitPrice < 1) {
      setError("개당 가격은 1 이상 정수로 입력하세요.");
      return;
    }
    if (!Number.isInteger(quantity) || quantity < 1) {
      setError("수량은 1 이상 정수로 입력하세요.");
      return;
    }
    const price = unitPrice * quantity;
    if (!Number.isSafeInteger(price) || price > 999_999_999) {
      setError("판매 총액은 999,999,999골드를 넘을 수 없어요.");
      return;
    }
    const name = cookingFoodDefinitions[itemId]?.name ?? "음식";
    return act(
      "/api/v2/marketplace/list",
      {
        kind: "consumable",
        itemId,
        quantity,
        price,
        graceHours: listingMode === "fixed" ? 0 : graceHours,
      },
      `✓ ${name} ${quantity}개 등록`,
      loadInventory,
    );
  };

  const listFishSpecimen = (fishId: FishId) => {
    const itemId = fishSpecimenItemId(fishId);
    const unitPrice = parseAmount(prices[itemId]);
    const quantity = parseAmount(qtys[itemId] ?? "1");
    if (!Number.isInteger(unitPrice) || unitPrice < 1) {
      setError("개당 가격은 1 이상 정수로 입력하세요.");
      return;
    }
    if (!Number.isInteger(quantity) || quantity < 1) {
      setError("수량은 1 이상 정수로 입력하세요.");
      return;
    }
    const price = unitPrice * quantity;
    if (!Number.isSafeInteger(price) || price > 999_999_999) {
      setError("판매 총액은 999,999,999골드를 넘을 수 없어요.");
      return;
    }
    return act(
      "/api/v2/marketplace/list",
      {
        kind: "consumable",
        itemId,
        quantity,
        price,
        graceHours: listingMode === "fixed" ? 0 : graceHours,
      },
      `✓ ${FISH[fishId].name} 표본 ${quantity}개 등록`,
      loadInventory,
    );
  };

  const equippedIids = new Set(Object.values(equipped));
  const sellableEquip = owned.filter(
    (i) => !i.enhance && !i.locked && !equippedIids.has(i.iid),
  );
  const sellableMats = Object.keys(materials).filter((id) => (materials[id] ?? 0) > 0);
  const sellableMaterialItems = sellableMats.filter(
    (id) => itemTabForMaterial(id) === "material",
  );
  const sellableConsumableMaterials = sellableMats.filter(
    (id) => itemTabForMaterial(id) === "consumable",
  );
  const matchesSellCraftFilter = (
    inst: V2EquipInstance,
    filter: SellCraftFilter,
  ): boolean => {
    if (filter === "all") return true;
    if (filter === "crafted") return inst.craftedBy != null;
    if (filter === "quality") return (inst.craftQuality?.level ?? 0) > 0;
    if (filter === "masterwork") return inst.craftedBy?.masterwork === true;
    return V2_EQUIPMENT[inst.id]?.craftOnly === true;
  };
  // 판매 탭(슬롯)에 해당하는 장비만 + 정렬. 재료 탭이면 빈 목록.
  const sellTabEquip =
    sellTab === "material" || sellTab === "consumable"
      ? []
      : sortEquipInstances(
          sellableEquip
            .filter((i) => V2_EQUIPMENT[i.id]?.slot === sellTab)
            .filter((i) => matchesSellCraftFilter(i, sellCraftFilter)),
          sellSort,
        );
  // 탭/정렬 바뀌면 1페이지로(resetKey).
  const sellEquipPager = usePagination(
    sellTabEquip,
    MARKETPLACE_PAGE_SIZE,
    `${sellTab}:${sellSort}:${sellCraftFilter}`,
  );
  const sellMatPager = usePagination(
    sellableMaterialItems,
    MARKETPLACE_PAGE_SIZE,
    sellTab,
  );
  const sellConsumableMaterialPager = usePagination(
    sellableConsumableMaterials,
    MARKETPLACE_PAGE_SIZE,
    sellTab,
  );
  const sellRareMapPager = usePagination(
    rareMaps,
    MARKETPLACE_PAGE_SIZE,
    sellTab,
  );

  // 둘러보기 표시 매물 — 하위 탭(6부위/재료/소모품) + 검색/정렬. 반환된 활성 매물 위에서만.
  const matchesBrowseTab = (l: Listing, activeTab: V2ItemTabKey): boolean =>
    itemTabForMarketplaceListing(l.kind, l.itemId) === activeTab;
  const isCraftedListing = (l: Listing): boolean =>
    l.kind === "equip" && listingCraftedBy(l.instancePayload) != null;
  const isPlusOneCraftedListing = (l: Listing): boolean =>
    l.kind === "equip" && (listingCraftQuality(l.instancePayload)?.level ?? 0) > 0;
  const meetsCrafterLevel = (l: Listing, minLevel: string): boolean => {
    if (minLevel === "all") return true;
    const craftedBy = listingCraftedBy(l.instancePayload);
    return (craftedBy?.level ?? 0) >= Number(minLevel);
  };
  const matchesSearch = (l: Listing, query: string): boolean => {
    if (!query) return true;
    if (l.itemName.toLowerCase().includes(query)) return true;
    const craftedBy = listingCraftedBy(l.instancePayload);
    return (craftedBy?.name ?? "").toLowerCase().includes(query);
  };
  const favoriteKeyForListing = (l: Listing) => `${l.kind}:${l.itemId}`;
  const isAuctionListing = (l: Listing): boolean =>
    new Date(l.bidEndsAt).getTime() > clockMs ||
    (l.highestBid ?? 0) > l.price;
  const q = search.trim().toLowerCase();
  const browseEquipmentTab =
    browseTab !== "material" && browseTab !== "consumable";
  const browseSortOptions: [MarketplaceBrowseSort, string][] = browseEquipmentTab
    ? [
        ["price_asc", "가격 낮은순"],
        ["price_desc", "가격 높은순"],
        ["power_desc", "위력 높은순"],
        ["power_asc", "위력 낮은순"],
        ["roll_desc", "품질 높은순"],
        ["roll_asc", "품질 낮은순"],
        ["crafter_desc", "제작자 Lv 높은순"],
        ["crafter_asc", "제작자 Lv 낮은순"],
        ["newest", "최근 등록순"],
        ["oldest", "오래된 등록순"],
      ]
    : [
        ["price_asc", "가격 낮은순"],
        ["price_desc", "가격 높은순"],
        ["newest", "최근 등록순"],
        ["oldest", "오래된 등록순"],
      ];
  const browseSortButtons = browseEquipmentTab
    ? EQUIPMENT_BROWSE_SORT_BUTTONS
    : STACK_BROWSE_SORT_BUTTONS;
  const displayedListings = (listings ?? [])
    .filter((l) => matchesBrowseTab(l, browseTab))
    .filter((l) =>
      browseMode === "auction"
        ? isAuctionListing(l)
        : !isAuctionListing(l) && new Date(l.expiresAt).getTime() > clockMs,
    )
    .filter((l) => !favoriteOnly || favoriteKeys.has(favoriteKeyForListing(l)))
    .filter(
      (l) =>
        !browseEquipmentTab ||
        matchesMarketplaceEquipmentTier(l.itemId, equipmentTierFilter),
    )
    .filter((l) => !browseEquipmentTab || !craftedOnly || isCraftedListing(l))
    .filter(
      (l) =>
        !browseEquipmentTab ||
        craftedQualityFilter === "all" ||
        isPlusOneCraftedListing(l),
    )
    .filter(
      (l) =>
        !browseEquipmentTab || meetsCrafterLevel(l, craftedLevelFilter),
    )
    .filter((l) => matchesSearch(l, q))
    .slice()
    .sort((a, b) => compareMarketplaceListings(a, b, sort));
  const stackGroups =
    browseMode === "fixed"
      ? groupMarketplaceStackListings(displayedListings).sort((a, b) =>
          sort === "price_desc"
            ? b.minUnitPrice - a.minUnitPrice
            : sort === "newest" || sort === "oldest"
              ? compareMarketplaceListings(
                  a.listings[0],
                  b.listings[0],
                  sort,
                )
              : a.minUnitPrice - b.minUnitPrice,
        )
      : [];
  const orderCatalogGroups = (() => {
    if (browseTab !== "material" && browseTab !== "consumable") return [];
    const groups = new Map<string, MarketplaceStackGroup>();
    for (const [itemId, material] of Object.entries(V2_MATERIALS)) {
      if (
        itemId === "v2_reforge_stone" ||
        itemId === "v2_reforge_stone_high" ||
        itemTabForMaterial(itemId) !== browseTab
      ) {
        continue;
      }
      groups.set(`material:${itemId}`, {
        key: `material:${itemId}`,
        kind: "material",
        itemId,
        itemName: material.name,
        totalQuantity: 0,
        minUnitPrice: priceRef[itemId]?.unitAvg ?? 1,
        listings: [],
      });
    }
    if (browseTab === "material")
      for (const group of marketplaceLifeItemPurchaseGroups(priceRef))
        groups.set(group.key, group);
    if (browseTab === "consumable") {
      for (const itemId of MUSEUN_TRADEABLE_ITEM_IDS) {
        groups.set(`consumable:${itemId}`, {
          key: `consumable:${itemId}`,
          kind: "consumable",
          itemId,
          itemName: MUSEUN_CASH_ITEMS[itemId].name,
          totalQuantity: 0,
          minUnitPrice: priceRef[itemId]?.unitAvg ?? 1,
          listings: [],
        });
      }
      for (const itemId of Object.keys(priceRef)) {
        if (!isCookingFoodId(itemId)) continue;
        const definition = cookingFoodDefinitions[itemId as CookingFoodId];
        if (!definition) continue;
        groups.set(`consumable:${itemId}`, {
          key: `consumable:${itemId}`,
          kind: "consumable",
          itemId,
          itemName: definition.name,
          totalQuantity: 0,
          minUnitPrice: priceRef[itemId]?.unitAvg ?? 1,
          listings: [],
        });
      }
    }
    return [...groups.values()].sort((a, b) =>
      a.itemName.localeCompare(b.itemName, "ko"),
    );
  })();
  const individualListings = individualMarketplaceListings(
    displayedListings,
    browseMode,
  );
  const displayedItemCount = stackGroups.length + individualListings.length;
  const activeFilterCount =
    Number(favoriteOnly) +
    (browseEquipmentTab
      ? Number(equipmentTierFilter !== "all") +
        Number(craftedOnly) +
        Number(craftedQualityFilter !== "all") +
        Number(craftedLevelFilter !== "all")
      : 0);
  const activeSortLabel =
    browseSortOptions.find(([value]) => value === sort)?.[1] ?? "가격 낮은순";
  const resetBrowseFilters = () => {
    setEquipmentTierFilter("all");
    setCraftedOnly(false);
    setCraftedQualityFilter("all");
    setCraftedLevelFilter("all");
    setFavoriteOnly(false);
  };
  const browsePager = usePagination(
    individualListings,
    MARKETPLACE_PAGE_SIZE,
    `browse:${browseMode}:${browseTab}:${q}:${favoriteOnly}:${equipmentTierFilter}:${craftedOnly}:${craftedQualityFilter}:${craftedLevelFilter}:${sort}`,
  );
  const stackGroupPager = usePagination(
    stackGroups,
    MARKETPLACE_PAGE_SIZE,
    `stack:${browseTab}:${q}:${favoriteOnly}:${sort}`,
  );
  const recentTradesPager = usePagination(
    recentTrades ?? [],
    MARKETPLACE_PAGE_SIZE,
    "recent-trades",
  );
  const myHistoryPager = usePagination(
    myHistory ?? [],
    MARKETPLACE_PAGE_SIZE,
    "my-history",
  );
  const minePager = usePagination(mine ?? [], MARKETPLACE_PAGE_SIZE, "mine");

  // 구매 확인 모달에서 확정.
  const confirmedBuy = () => {
    const l = confirmBuy;
    if (!l) return;
    setConfirmBuy(null);
    void buy(l);
  };

  const openStackBuy = (group: MarketplaceStackGroup) => {
    const quantity = parseAmount(stackBuyQtys[group.key] ?? "1");
    if (
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > group.totalQuantity
    ) {
      setError(`구매 수량은 1~${group.totalQuantity.toLocaleString()}개로 입력하세요.`);
      return;
    }
    const totalPrice = marketplaceStackQuote(group.listings, quantity);
    if (totalPrice == null) {
      setError("선택한 수량의 구매 견적을 만들 수 없어요. 목록을 새로고침해 주세요.");
      return;
    }
    setConfirmStackBuy({ group, quantity, totalPrice });
  };

  const confirmedStackBuy = () => {
    const confirmation = confirmStackBuy;
    if (!confirmation) return;
    setConfirmStackBuy(null);
    void buyStack(
      confirmation.group,
      confirmation.quantity,
      confirmation.totalPrice,
    );
  };

  // 아이템 클릭 → 옵션 카드(장비만). itemId 카탈로그 조회 후 클릭 위치에 앵커.
  const openCardFor = (
    itemId: string,
    roll: V2EquipRoll | undefined,
    enhance: V2EnhanceState | undefined,
    craftQuality: V2CraftQualityState | undefined,
    craftedBy: V2CraftedBy | undefined,
    el: HTMLElement,
  ) => {
    const item = V2_EQUIPMENT[itemId as keyof typeof V2_EQUIPMENT];
    if (item) {
      setCard({
        item,
        roll,
        enhance,
        craftQuality,
        craftedBy,
        anchor: anchorOf(el),
        compare: false,
      });
    }
  };

  const availableGold =
    gold === null ? null : coreLoopOn ? gold + bankedGold : gold;
  const activeMarketToolGroup = marketToolGroup
    ? stackGroups.find((group) => group.key === marketToolGroup.key) ??
      marketToolGroup
    : null;

  return (
    <main className="mx-auto w-full min-w-0 max-w-[760px] space-y-4 p-4 text-zinc-900 sm:p-6 dark:text-zinc-100">
      <SubViewHeader title="거래소" onBack={onBack} />
      <Card padding="none" className="overflow-hidden">
        <div
          data-testid="marketplace-summary"
          className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between p-4"
        >
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300">
              <Storefront size={23} weight="duotone" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold">모험가 거래소</p>
              <p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
                장비와 재료를 시세에 맞춰 안전하게 거래하세요.
              </p>
            </div>
          </div>
          {availableGold !== null && (
            <div className={`${SURFACE_INSET} px-3 py-2 text-right sm:shrink-0`}>
              <p className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400">
                사용 가능
              </p>
              <p className="mt-0.5 flex items-center justify-end gap-1 text-xs font-bold tabular-nums text-amber-700 dark:text-amber-400">
                <GameIcon name="Coins" size={14} />
                {availableGold.toLocaleString()}G
              </p>
            </div>
          )}
        </div>
        <nav
          aria-label="거래소 메뉴"
          className="grid grid-cols-4 gap-1 border-t border-zinc-200 p-1.5 dark:border-zinc-700"
        >
          {MARKETPLACE_TABS.map(({ key, label, description, Icon }) => {
            const active = tab === key;
            const badge = key === "mine" && mine !== null ? mine.length : null;
            return (
              <button
                key={key}
                type="button"
                aria-pressed={active}
                onClick={() => setTab(key)}
                className={`flex min-w-0 flex-col items-center justify-center rounded-md px-1.5 py-2 text-center transition sm:flex-row sm:gap-2 ${
                  active
                    ? "bg-sky-600 text-white shadow-sm"
                    : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                }`}
              >
                <Icon size={18} weight={active ? "fill" : "duotone"} />
                <span className="mt-1 min-w-0 sm:mt-0 sm:text-left">
                  <span className="flex items-center justify-center gap-1 text-xs font-semibold sm:justify-start">
                    {label}
                    {badge !== null && badge > 0 ? (
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[9px] leading-none ${
                          active
                            ? "bg-white text-sky-700"
                            : "bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-200"
                        }`}
                      >
                        {badge}
                      </span>
                    ) : null}
                  </span>
                  <span
                    className={`hidden text-[10px] sm:block ${
                      active ? "text-sky-100" : "text-zinc-400 dark:text-zinc-500"
                    }`}
                  >
                    {description}
                  </span>
                </span>
              </button>
            );
          })}
        </nav>
      </Card>

      {msg && (
        <div className={`${SURFACE_INSET} p-3 text-sm text-emerald-700 dark:text-emerald-400`}>
          {msg}
        </div>
      )}
      {error && (
        <div className={`${SURFACE_INSET} p-3 text-sm text-rose-600 dark:text-rose-400`}>
          {error}
        </div>
      )}

      {tab === "browse" && (
        <>
          <Card padding="none" className="overflow-hidden">
            <div className="border-b border-zinc-200 px-2 pt-1 dark:border-zinc-700">
              <TabBar
                tabs={V2_ITEM_TABS}
                active={browseTab}
                onChange={handleBrowseTabChange}
                ariaLabel="거래소 목록 분류"
                size="sm"
                scrollable
              />
            </div>
            <div className="space-y-3 p-3">
              <div className="grid grid-cols-2 rounded-lg border border-zinc-200 bg-zinc-100 p-1 dark:border-zinc-700 dark:bg-zinc-800">
                {([
                  ["fixed", "즉시구매"],
                  ["auction", "경매"],
                ] as const).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    aria-pressed={browseMode === mode}
                    onClick={() => setBrowseMode(mode)}
                    className={`rounded-md px-3 py-2 text-xs font-semibold transition ${
                      browseMode === mode
                        ? "bg-white text-sky-700 shadow-sm dark:bg-zinc-950 dark:text-sky-300"
                        : "text-zinc-500 dark:text-zinc-400"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {browseMode === "fixed" ? (
                <button
                  type="button"
                  onClick={() =>
                    browseEquipmentTab
                      ? setEquipmentOrderOpen(true)
                      : setOrderCatalogOpen(true)
                  }
                  className="flex w-full items-center justify-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                >
                  <ShoppingCart size={15} weight="duotone" />
                  {browseEquipmentTab
                    ? "조건을 정해 장비 구매 주문 만들기"
                    : "판매 매물이 없어도 구매 주문 만들기"}
                </button>
              ) : null}
              <div className="flex gap-2">
                <label className="relative min-w-0 flex-1">
                  <span className="sr-only">아이템 또는 제작자 검색</span>
                  <MagnifyingGlass
                    aria-hidden
                    size={16}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
                  />
                  <input
                    type="search"
                    placeholder="아이템 또는 제작자 검색"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onBlur={(event) => rememberSearch(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        rememberSearch(event.currentTarget.value);
                      }
                    }}
                    className="w-full rounded-md border border-zinc-300 bg-white py-2.5 pl-9 pr-9 text-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 dark:border-zinc-700 dark:bg-zinc-900"
                  />
                  {search ? (
                    <button
                      type="button"
                      aria-label="검색어 지우기"
                      onClick={() => setSearch("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                    >
                      <X size={14} />
                    </button>
                  ) : null}
                </label>
                <button
                  type="button"
                  aria-expanded={filtersOpen}
                  onClick={() => setFiltersOpen((open) => !open)}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-md border px-3 text-xs font-semibold transition ${
                    filtersOpen || activeFilterCount > 0
                      ? "border-sky-600 bg-sky-600 text-white"
                      : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  }`}
                >
                  <SlidersHorizontal size={16} weight="duotone" />
                  {browseEquipmentTab ? "필터" : "정렬"}
                  {activeFilterCount > 0 ? (
                    <span className="rounded-full bg-white px-1.5 text-[9px] leading-4 text-sky-700">
                      {activeFilterCount}
                    </span>
                  ) : null}
                </button>
              </div>

              <div
                className="flex gap-1.5 overflow-x-auto pb-0.5"
                role="group"
                aria-label="매물 정렬"
              >
                {browseSortButtons.map((button) => {
                  const active =
                    sort === button.ascending || sort === button.descending;
                  const ascending = sort === button.ascending;
                  const next =
                    sort === button.ascending
                      ? button.descending
                      : sort === button.descending
                        ? button.ascending
                        : button.initial;
                  return (
                    <button
                      key={button.key}
                      type="button"
                      aria-pressed={active}
                      aria-label={`${button.label} ${active ? (ascending ? "오름차순" : "내림차순") : "정렬"}`}
                      onClick={() => setSort(next)}
                      className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition ${
                        active
                          ? "border-sky-600 bg-sky-600 text-white"
                          : "border-zinc-300 bg-white text-zinc-600 hover:border-sky-300 hover:text-sky-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                      }`}
                    >
                      {button.label}
                      {active ? (ascending ? " ↑" : " ↓") : ""}
                    </button>
                  );
                })}
              </div>

              {recentSearches.length > 0 ? (
                <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                  <span className="text-zinc-400">최근 검색</span>
                  {recentSearches.map((query) => (
                    <button
                      key={query}
                      type="button"
                      onClick={() => setSearch(query)}
                      className="rounded-full border border-zinc-200 bg-white px-2 py-1 text-zinc-600 hover:border-sky-300 hover:text-sky-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                    >
                      {query}
                    </button>
                  ))}
                </div>
              ) : null}

              {filtersOpen && (
                <div className={`${SURFACE_INSET} grid gap-3 p-3 sm:grid-cols-2`}>
                  <label className="space-y-1">
                    <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                      정렬
                    </span>
                    <SelectControl
                      value={sort}
                      onChange={(v) => setSort(v as MarketplaceBrowseSort)}
                      options={browseSortOptions}
                      className="w-full"
                    />
                  </label>
                  {browseEquipmentTab && (
                    <>
                      <label className="space-y-1">
                        <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                          아이템 티어
                        </span>
                        <SelectControl
                          value={equipmentTierFilter}
                          onChange={(value) =>
                            setEquipmentTierFilter(
                              value as MarketplaceEquipmentTierFilter,
                            )
                          }
                          options={MARKETPLACE_EQUIPMENT_TIER_OPTIONS}
                          className="w-full"
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                          제작 품질
                        </span>
                        <SelectControl
                          value={craftedQualityFilter}
                          onChange={(v) =>
                            setCraftedQualityFilter(v as typeof craftedQualityFilter)
                          }
                          options={[
                            ["all", "전체 품질"],
                            ["plus1", "★ 제작품만"],
                          ]}
                          className="w-full"
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                          제작자 숙련도
                        </span>
                        <SelectControl
                          value={craftedLevelFilter}
                          onChange={(v) =>
                            setCraftedLevelFilter(v as typeof craftedLevelFilter)
                          }
                          options={[
                            ["all", "전체 레벨"],
                            ["2", "Lv 2 이상"],
                            ["3", "Lv 3 이상"],
                            ["4", "Lv 4 이상"],
                            ["5", "Lv 5 이상"],
                          ]}
                          className="w-full"
                        />
                      </label>
                      <div className="space-y-1">
                        <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                          제작 여부
                        </span>
                        <button
                          type="button"
                          aria-pressed={craftedOnly}
                          onClick={() => setCraftedOnly((value) => !value)}
                          className={`w-full rounded-md border px-3 py-2 text-left text-xs font-medium transition ${
                            craftedOnly
                              ? "border-emerald-600 bg-emerald-600 text-white"
                              : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                          }`}
                        >
                          {craftedOnly ? "✓ 제작품만 보는 중" : "제작품만 보기"}
                        </button>
                      </div>
                    </>
                  )}
                  <div className="space-y-1">
                    <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                      즐겨찾기
                    </span>
                    <button
                      type="button"
                      aria-pressed={favoriteOnly}
                      onClick={() => setFavoriteOnly((value) => !value)}
                      className={`flex w-full items-center gap-1.5 rounded-md border px-3 py-2 text-left text-xs font-medium transition ${
                        favoriteOnly
                          ? "border-amber-500 bg-amber-500 text-white"
                          : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                      }`}
                    >
                      <Star size={14} weight={favoriteOnly ? "fill" : "regular"} />
                      {favoriteOnly ? "즐겨찾기만 보는 중" : "즐겨찾기만 보기"}
                    </button>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                    {browseMode === "fixed" && stackGroups.length > 0 ? "품목" : "매물"}{" "}
                    {displayedItemCount.toLocaleString()}개
                  </span>
                  <span className="text-zinc-400">·</span>
                  <span className="text-zinc-500 dark:text-zinc-400">
                    {activeSortLabel}
                  </span>
                  {q ? (
                    <span className="rounded-full bg-zinc-100 px-2 py-1 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                      “{search.trim()}”
                    </span>
                  ) : null}
                  {browseEquipmentTab && equipmentTierFilter !== "all" ? (
                    <span className="rounded-full bg-violet-100 px-2 py-1 text-violet-700 dark:bg-violet-950 dark:text-violet-300">
                      {equipmentTierFilter}T
                    </span>
                  ) : null}
                  {craftedOnly ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-1 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                      제작품
                    </span>
                  ) : null}
                  {craftedQualityFilter === "plus1" ? (
                    <span className="rounded-full bg-amber-100 px-2 py-1 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                      ★ 제작품
                    </span>
                  ) : null}
                  {craftedLevelFilter !== "all" ? (
                    <span className="rounded-full bg-sky-100 px-2 py-1 text-sky-700 dark:bg-sky-950 dark:text-sky-300">
                      제작자 Lv {craftedLevelFilter}+
                    </span>
                  ) : null}
                </div>
                {activeFilterCount > 0 ? (
                  <button
                    type="button"
                    onClick={resetBrowseFilters}
                    className="font-medium text-sky-700 hover:underline dark:text-sky-300"
                  >
                    필터 초기화
                  </button>
                ) : null}
              </div>
            </div>
          </Card>
          {browseMode === "fixed" && stackGroups.length > 0 ? (
            <MarketplaceStackBrowse
              groups={stackGroupPager.pageItems}
              quantities={stackBuyQtys}
              onQuantityChange={(key, value) =>
                setStackBuyQtys((current) => ({ ...current, [key]: value }))
              }
              onBuy={openStackBuy}
              busy={busy}
              favoriteKeys={favoriteKeys}
              onToggleFavorite={toggleFavorite}
              orderBook={buyOrderBook}
              onOpenTools={setMarketToolGroup}
            />
          ) : null}
          {browseMode === "fixed" && stackGroups.length > MARKETPLACE_PAGE_SIZE ? (
            <Pagination
              page={stackGroupPager.page}
              pageCount={stackGroupPager.pageCount}
              setPage={stackGroupPager.setPage}
            />
          ) : null}
          {individualListings.length > 0 || stackGroups.length === 0 ? (
            <ListingList
              rows={listings === null ? null : browsePager.pageItems}
              emptyText={listings && listings.length > 0 ? "조건에 맞는 매물이 없어요." : "등록된 매물이 없어요."}
              action={(l) => {
              const bidding = new Date(l.bidEndsAt).getTime() > clockMs;
              const expired = new Date(l.expiresAt).getTime() <= clockMs;
              const auctionLocked =
                !bidding && (l.highestBid ?? 0) > l.price;
              if (bidding) {
                return (
                  <button
                    type="button"
                    onClick={() => void openBid(l)}
                    disabled={busy}
                    className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-sky-700 bg-sky-600 px-3 text-xs font-semibold text-white shadow-sm transition hover:bg-sky-700 disabled:opacity-50"
                  >
                    {l.isMine ? `입찰 ${l.bidCount}건` : "입찰"}
                  </button>
                );
              }
              if (auctionLocked) {
                return (
                  <button
                    type="button"
                    onClick={() => void openBid(l)}
                    className="h-9 shrink-0 rounded-md border border-amber-300 px-3 text-xs font-medium text-amber-800 dark:border-amber-800 dark:text-amber-300"
                  >
                    입찰 내역
                  </button>
                );
              }
              if (expired) {
                return (
                  <span className="shrink-0 text-[11px] text-zinc-400">
                    만료 정산 중
                  </span>
                );
              }
              return l.isMine ? (
                <button
                  type="button"
                  onClick={() => {
                    setMineTab("active");
                    setTab("mine");
                  }}
                  className="h-9 shrink-0 rounded-md border border-sky-300 px-3 text-xs font-semibold text-sky-700 dark:border-sky-800 dark:text-sky-300"
                >
                  내 매물 관리
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmBuy(l)}
                  disabled={busy}
                  className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-emerald-700 bg-emerald-600 px-3 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
                >
                  <ShoppingCart size={14} weight="bold" />
                  구매
                </button>
              );
              }}
              priceRef={priceRef}
              frontierDepth={frontierDepth}
              clockMs={clockMs}
              onOpenCard={openCardFor}
              favoriteKeys={favoriteKeys}
              onToggleFavorite={toggleFavorite}
            />
          ) : null}
          {listings !== null && individualListings.length > MARKETPLACE_PAGE_SIZE && (
            <Pagination
              page={browsePager.page}
              pageCount={browsePager.pageCount}
              setPage={browsePager.setPage}
            />
          )}
        </>
      )}

      {tab === "recent" && (
        <>
          <Card padding="sm">
            <p className="text-sm font-semibold">전체 최근 체결</p>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              판매자와 구매자는 공개되지 않습니다. 수상한 거래는 기록에서 신고할 수 있어요.
            </p>
          </Card>
          <MarketplaceRecentTradeList
            rows={
              recentTrades === null ? null : recentTradesPager.pageItems
            }
            frontierDepth={frontierDepth}
            clockMs={clockMs}
          />
          {recentTrades !== null && recentTrades.length > 0 ? (
            <Pagination
              page={recentTradesPager.page}
              pageCount={recentTradesPager.pageCount}
              setPage={recentTradesPager.setPage}
            />
          ) : null}
        </>
      )}

      {tab === "mine" && (
        <>
          <Card padding="none" className="overflow-hidden">
            <div className="grid grid-cols-3 p-1.5">
              {([
                ["active", "판매 중", Package],
                ["orders", "구매 주문", ShoppingCart],
                ["history", "거래 내역", Receipt],
              ] as const).map(([key, label, Icon]) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={mineTab === key}
                  onClick={() => setMineTab(key)}
                  className={`flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold transition ${
                    mineTab === key
                      ? "bg-sky-600 text-white"
                      : "text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                  }`}
                >
                  <Icon size={15} weight={mineTab === key ? "fill" : "duotone"} />
                  {label}
                  {key === "active" && mine !== null && mine.length > 0 ? (
                    <span className="rounded-full bg-white px-1.5 py-0.5 text-[9px] leading-none text-sky-700">
                      {mine.length}
                    </span>
                  ) : key === "orders" && buyOrders !== null ? (
                    <span className="rounded-full bg-white px-1.5 py-0.5 text-[9px] leading-none text-sky-700">
                      {buyOrders.filter((order) => order.status === "active").length}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          </Card>
          {mineTab === "active" ? (
            <>
              <ListingList
                rows={mine === null ? null : minePager.pageItems}
                emptyText="등록한 매물이 없어요."
                priceRef={priceRef}
                frontierDepth={frontierDepth}
                clockMs={clockMs}
                onOpenCard={openCardFor}
                action={(l) =>
                  l.bidCount > 0 ? (
                    <button
                      type="button"
                      onClick={() => void openBid(l)}
                      className="h-9 shrink-0 rounded-md border border-sky-300 px-3 text-xs font-medium text-sky-800 dark:border-sky-800 dark:text-sky-300"
                    >
                      입찰 {l.bidCount}건
                    </button>
                  ) : (
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      <NumberInput
                        aria-label={`${l.itemName} 새 ${isStackableMarketplaceListing(l) ? "개당 " : ""}가격`}
                        placeholder={isStackableMarketplaceListing(l) ? "새 개당 가격" : "새 가격"}
                        value={repriceValues[l.id] ?? ""}
                        onValueChange={(value) =>
                          setRepriceValues((current) => ({
                            ...current,
                            [l.id]: value,
                          }))
                        }
                        className="h-9 w-24 rounded-md border border-zinc-300 bg-white px-2 text-xs tabular-nums dark:border-zinc-700 dark:bg-zinc-900"
                      />
                      <button
                        type="button"
                        onClick={() => repriceListing(l)}
                        disabled={busy}
                        className="h-9 rounded-md border border-sky-300 px-2.5 text-xs font-medium text-sky-700 disabled:opacity-50 dark:border-sky-800 dark:text-sky-300"
                      >
                        가격 변경
                      </button>
                      <button
                        type="button"
                        onClick={() => cancel(l)}
                        disabled={busy}
                        className="h-9 rounded-md border border-zinc-300 bg-white px-2.5 text-xs font-medium hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
                      >
                        취소
                      </button>
                    </div>
                  )
                }
              />
              {mine !== null && mine.length > 0 && (
                <Pagination
                  page={minePager.page}
                  pageCount={minePager.pageCount}
                  setPage={minePager.setPage}
                />
              )}
            </>
          ) : mineTab === "orders" ? (
            <BuyOrderManagement
              orders={buyOrders}
              alerts={priceAlerts}
              busy={busy}
              clockMs={clockMs}
              onCancelOrder={cancelBuyOrder}
              onUpdateOrder={updateBuyOrder}
              onCancelAlert={cancelPriceAlert}
            />
          ) : (
            <>
              <ListingList
                rows={myHistory === null ? null : myHistoryPager.pageItems}
                emptyText="아직 체결된 거래가 없어요."
                historical
                priceRef={{}}
                frontierDepth={frontierDepth}
                clockMs={clockMs}
                onOpenCard={openCardFor}
                action={(l) => (
                  <span className="shrink-0 text-right text-[11px] leading-tight text-zinc-500 dark:text-zinc-400">
                    <span className={l.isMine ? "text-emerald-600 dark:text-emerald-400" : "text-sky-600 dark:text-sky-400"}>
                      {l.isMine ? "판매" : "구매"}
                    </span>
                    <br />
                    {timeAgo(l.createdAt)}
                  </span>
                )}
              />
              {myHistory !== null && myHistory.length > 0 && (
                <Pagination
                  page={myHistoryPager.page}
                  pageCount={myHistoryPager.pageCount}
                  setPage={myHistoryPager.setPage}
                />
              )}
            </>
          )}
        </>
      )}

      {tab === "sell" && (
        <div className="space-y-3">
          <Card padding="sm">
            <div className="text-sm font-semibold">판매 방식</div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                aria-pressed={listingMode === "fixed"}
                onClick={() => setListingMode("fixed")}
                className={`rounded-lg border p-3 text-left transition ${
                  listingMode === "fixed"
                    ? "border-emerald-600 bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100"
                    : "border-zinc-300 bg-white text-zinc-700 hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
                }`}
              >
                <span className="block text-xs font-semibold">즉시구매 · 기본</span>
                <span className="mt-1 block text-[11px] opacity-80">
                  등록 즉시 구매 가능 · {directListingHours}시간 노출
                </span>
              </button>
              <button
                type="button"
                aria-pressed={listingMode === "auction"}
                onClick={() => setListingMode("auction")}
                className={`rounded-lg border p-3 text-left transition ${
                  listingMode === "auction"
                    ? "border-sky-600 bg-sky-50 text-sky-900 dark:bg-sky-950 dark:text-sky-100"
                    : "border-zinc-300 bg-white text-zinc-700 hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
                }`}
              >
                <span className="block text-xs font-semibold">공개 입찰 · 선택</span>
                <span className="mt-1 block text-[11px] opacity-80">
                  먼저 입찰을 받은 뒤 조건에 따라 낙찰
                </span>
              </button>
            </div>
            {listingMode === "auction" ? (
              <div className={`${SURFACE_INSET} mt-2 flex flex-wrap items-center justify-between gap-2 p-2.5`}>
                <span className="text-[11px] text-zinc-600 dark:text-zinc-300">
                  초과 입찰이 없으면 유예 뒤 {fixedListingHours}시간 동안 즉시구매로 전환됩니다.
                </span>
                <select
                  value={graceHours}
                  onChange={(event) => setGraceHours(Number(event.target.value))}
                  className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs font-medium dark:border-zinc-700 dark:bg-zinc-900"
                  aria-label="입찰 유예 시간"
                >
                  {Array.from(
                    { length: bidGraceMaxHours - bidGraceMinHours + 1 },
                    (_, index) => bidGraceMinHours + index,
                  ).map((hours) => (
                    <option key={hours} value={hours}>
                      입찰 {hours}시간
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </Card>
          {/* 슬롯 서브탭 — 인벤토리와 동일 구성. 배경 위라 surface 패널로 감쌈(라이트모드 가독성). */}
          <Card padding="none" className="overflow-hidden">
            <div className="px-2 pt-1">
              <TabBar
                tabs={V2_ITEM_TABS}
                active={sellTab}
                onChange={setSellTab}
                ariaLabel="판매 슬롯"
                size="sm"
                scrollable
              />
            </div>
          </Card>

          {sellTab === "consumable" ? (
            <div className="space-y-2">
              <MarketplaceMaterialTab
                items={sellableConsumableMaterials}
                pager={sellConsumableMaterialPager}
                materials={materials}
                prices={prices}
                setPrices={setPrices}
                qtys={qtys}
                setQtys={setQtys}
                priceRef={priceRef}
                busy={busy}
                onListMaterial={listMaterial}
                hideEmpty
              />
              <MarketplaceRareMapTab
                rareMaps={rareMaps}
                cashItems={cashItems}
                cookingFoods={cookingFoods}
                cookingFoodDefinitions={cookingFoodDefinitions}
                fishSpecimens={fishSpecimens}
                pager={sellRareMapPager}
                prices={prices}
                setPrices={setPrices}
                qtys={qtys}
                setQtys={setQtys}
                priceRef={priceRef}
                busy={busy}
                onListConsumable={listConsumable}
                onListCashItem={listCashItem}
                onListCookingFood={listCookingFood}
                onListFishSpecimen={listFishSpecimen}
                hideEmpty={sellableConsumableMaterials.length > 0}
              />
            </div>
          ) : sellTab === "material" ? (
            <MarketplaceMaterialTab
              items={sellableMaterialItems}
              pager={sellMatPager}
              materials={materials}
              prices={prices}
              setPrices={setPrices}
              qtys={qtys}
              setQtys={setQtys}
              priceRef={priceRef}
              busy={busy}
              onListMaterial={listMaterial}
            />
          ) : (
            <MarketplaceEquipmentTab
              items={sellTabEquip}
              pager={sellEquipPager}
              sellSort={sellSort}
              setSellSort={setSellSort}
              craftFilter={sellCraftFilter}
              setCraftFilter={setSellCraftFilter}
              prices={prices}
              setPrices={setPrices}
              priceRef={priceRef}
              busy={busy}
              equipmentBuyOrders={equipmentBuyOrders}
              onListEquip={listEquip}
              onSellToBuyOrder={sellEquipmentToBuyOrder}
              onSellBatchToBuyOrders={sellEquipmentBatchToBuyOrders}
              onOpenCard={openCardFor}
            />
          )}
        </div>
      )}

      {confirmBuy && (
        <BuyConfirm
          listing={confirmBuy}
          gold={gold}
          coreLoopOn={coreLoopOn}
          bankedGold={bankedGold}
          frontierDepth={frontierDepth}
          busy={busy}
          clockMs={clockMs}
          onConfirm={confirmedBuy}
          onCancel={() => setConfirmBuy(null)}
        />
      )}

      {confirmStackBuy && (
        <StackBuyConfirm
          confirmation={confirmStackBuy}
          availableGold={availableGold}
          busy={busy}
          onConfirm={confirmedStackBuy}
          onCancel={() => setConfirmStackBuy(null)}
        />
      )}

      {activeMarketToolGroup && (
        <MarketToolsDialog
          group={activeMarketToolGroup}
          bestBuyOrder={buyOrderBook[activeMarketToolGroup.key]}
          existingAlert={priceAlerts?.find(
            (alert) =>
              alert.status === "active" &&
              `${alert.kind}:${alert.itemId}` === activeMarketToolGroup.key,
          )}
          busy={busy}
          onCreateOrder={createBuyOrder}
          onCreateAlert={createPriceAlert}
          onClose={() => setMarketToolGroup(null)}
        />
      )}

      {orderCatalogOpen ? (
        <BuyOrderCatalogDialog
          groups={orderCatalogGroups}
          onSelect={(group) => {
            setOrderCatalogOpen(false);
            setMarketToolGroup(group);
          }}
          onClose={() => setOrderCatalogOpen(false)}
        />
      ) : null}

      {equipmentOrderOpen ? (
        <EquipmentBuyOrderDialog
          slot={browseTab as V2EquipSlot}
          priceRef={priceRef}
          busy={busy}
          onCreate={createEquipmentBuyOrder}
          onClose={() => setEquipmentOrderOpen(false)}
        />
      ) : null}

      {confirmBid && (
        <BidDialog
          listing={confirmBid}
          bids={publicBids}
          amount={bidAmount}
          onAmountChange={setBidAmount}
          busy={busy}
          clockMs={clockMs}
          onSubmit={placeBid}
          onClose={() => setConfirmBid(null)}
        />
      )}

      {card &&
        (() => {
          const equippedInst = equippedInstanceForMarketplaceItem(
            card.item,
            owned,
            equipped,
          );
          const equippedItemIds = equippedItemIdsForMarketplace(
            owned,
            equipped,
          );
          if (card.compare && equippedInst) {
            const equippedItem = V2_EQUIPMENT[equippedInst.id];
            return (
              <V2ItemCompareCard
                candidate={{
                  item: card.item,
                  roll: card.roll,
                  enhance: card.enhance,
                  craftQuality: card.craftQuality,
                  craftedBy: card.craftedBy,
                }}
                equipped={{
                  item: equippedItem,
                  roll: equippedInst.roll,
                  enhance: equippedInst.enhance,
                  craftQuality: equippedInst.craftQuality,
                  craftedBy: equippedInst.craftedBy,
                }}
                equippedIds={equippedItemIds}
                onClose={() => setCard(null)}
              />
            );
          }
          return (
            <V2ItemCard
              item={card.item}
              roll={card.roll}
              enhance={card.enhance}
              craftQuality={card.craftQuality}
              craftedBy={card.craftedBy}
              anchor={card.anchor}
              equippedIds={equippedItemIds}
              compare={
                equippedInst
                  ? {
                      onCompare: () =>
                        setCard((current) =>
                          current ? { ...current, compare: true } : current,
                        ),
                    }
                  : undefined
              }
              onClose={() => setCard(null)}
            />
          );
        })()}
    </main>
  );
}

function BidDialog({
  listing,
  bids,
  amount,
  onAmountChange,
  busy,
  clockMs,
  onSubmit,
  onClose,
}: {
  listing: Listing;
  bids: Array<{ amount: number; createdAt: string; isMine: boolean }>;
  amount: string;
  onAmountChange: (value: string) => void;
  busy: boolean;
  clockMs: number;
  onSubmit: () => void;
  onClose: () => void;
}) {
  const bidding = new Date(listing.bidEndsAt).getTime() > clockMs;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="text-base font-bold">공개 입찰</h2>
        <div className="mt-1 text-sm font-medium">{listing.itemName}</div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div className={`${SURFACE_INSET} p-2.5`}>
            <div className="text-zinc-500 dark:text-zinc-400">즉시구매가</div>
            <div className="mt-0.5 font-bold tabular-nums text-amber-700 dark:text-amber-400">
              {listing.price.toLocaleString()}G
            </div>
          </div>
          <div className={`${SURFACE_INSET} p-2.5`}>
            <div className="text-zinc-500 dark:text-zinc-400">현재 최고 입찰</div>
            <div className="mt-0.5 font-bold tabular-nums text-sky-700 dark:text-sky-300">
              {listing.highestBid?.toLocaleString() ?? "없음"}
              {listing.highestBid != null ? "G" : ""}
            </div>
          </div>
        </div>
        <div className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400">
          {bidding
            ? `유예 종료까지 ${remainingLabel(listing.bidEndsAt, clockMs)} · 다음 최소 입찰 ${listing.nextBid.toLocaleString()}G`
            : (listing.highestBid ?? 0) > listing.price
              ? "즉시구매가를 초과해 최고 입찰자에게 판매됩니다."
              : "유예가 종료되어 즉시구매 단계로 전환됐습니다."}
        </div>

        <div className="mt-4 max-h-44 space-y-1 overflow-y-auto" aria-label="공개 입찰 기록">
          {bids.length === 0 ? (
            <div className="rounded-md border border-dashed border-zinc-300 px-3 py-4 text-center text-xs text-zinc-400 dark:border-zinc-700">
              아직 입찰이 없습니다.
            </div>
          ) : (
            [...bids].reverse().map((bid, index) => (
              <div
                key={`${bid.createdAt}:${bid.amount}:${index}`}
                className="flex items-center justify-between rounded-md bg-zinc-100 px-3 py-2 text-xs dark:bg-zinc-800"
              >
                <span className="font-semibold tabular-nums">
                  {bid.amount.toLocaleString()}G
                  {bid.isMine ? " · 내 입찰" : ""}
                </span>
                <span className="text-zinc-400">{timeAgo(bid.createdAt)}</span>
              </div>
            ))
          )}
        </div>

        {bidding && !listing.isMine ? (
          <div className="mt-4 flex gap-2">
            <NumberInput
              value={amount}
              onValueChange={onAmountChange}
              placeholder="입찰 금액"
              className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm tabular-nums dark:border-zinc-700 dark:bg-zinc-950"
            />
            <button
              type="button"
              onClick={onSubmit}
              disabled={busy}
              className="rounded-md border border-sky-700 bg-sky-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              입찰
            </button>
          </div>
        ) : null}
        <button
          type="button"
          onClick={onClose}
          className="mt-3 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700"
        >
          닫기
        </button>
      </div>
    </div>
  );
}

function BuyOrderManagement({
  orders,
  alerts,
  busy,
  clockMs,
  onCancelOrder,
  onUpdateOrder,
  onCancelAlert,
}: {
  orders: BuyOrder[] | null;
  alerts: PriceAlert[] | null;
  busy: boolean;
  clockMs: number;
  onCancelOrder: (order: BuyOrder) => void;
  onUpdateOrder: (
    order: BuyOrder,
    quantity: number,
    unitPrice: number,
    days: number,
    minPower?: number,
    minQualityPct?: number,
  ) => Promise<unknown>;
  onCancelAlert: (alert: PriceAlert) => void;
}) {
  const [edits, setEdits] = useState<
    Record<
      number,
      {
        quantity: string;
        unitPrice: string;
        days: string;
        minPower: string;
        minQualityPct: string;
      } | undefined
    >
  >({});
  if (orders === null || alerts === null) {
    return (
      <Card padding="md">
        <div className="animate-pulse text-sm text-zinc-400">구매 주문을 불러오는 중…</div>
      </Card>
    );
  }
  const activeOrders = orders.filter((order) => order.status === "active");
  const recentOrders = orders.filter((order) => order.status !== "active").slice(0, 10);
  const activeAlerts = alerts.filter((alert) => alert.status === "active");
  return (
    <div className="space-y-3">
      <Card padding="sm">
        <div className="text-sm font-semibold">활성 구매 주문</div>
        <div className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
          골드는 주문 등록 때 보관되며, 체결 물품과 잔여금은 우편함으로 도착합니다.
        </div>
      </Card>
      {activeOrders.length === 0 ? (
        <Card padding="sm">
          <div className="text-xs text-zinc-500 dark:text-zinc-400">활성 구매 주문이 없어요.</div>
        </Card>
      ) : (
        activeOrders.map((order) => {
          const filled = order.quantityInitial - order.quantityRemaining;
          const progress = Math.round((filled / order.quantityInitial) * 100);
          const edit = edits[order.id];
          const editQuantity = parseAmount(edit?.quantity ?? "");
          const editUnitPrice = parseAmount(edit?.unitPrice ?? "");
          const editDays = parseAmount(edit?.days ?? "");
          const editMinPower = parseAmount(edit?.minPower ?? "");
          const editMinQualityPct = parseAmount(edit?.minQualityPct ?? "");
          const editValid =
            (order.kind === "equip" ||
              (Number.isInteger(editQuantity) && editQuantity >= 1)) &&
            Number.isInteger(editUnitPrice) &&
            editUnitPrice >= 1 &&
            Number.isInteger(editDays) &&
            editDays >= 1 &&
            editDays <= 7 &&
            (order.kind !== "equip" ||
              (Number.isInteger(editMinPower) &&
                editMinPower >= 1 &&
                Number.isInteger(editMinQualityPct) &&
                editMinQualityPct >= 0 &&
                editMinQualityPct <= 100));
          return (
            <Card key={order.id} padding="sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold">{order.itemName}</div>
                  <div className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                    {order.kind === "equip" ? (
                      <>
                        최대 {order.unitPrice.toLocaleString()}G · 최소 위력 {order.minPower?.toLocaleString() ?? "-"} · 품질 {order.minQualityPct ?? 0}% 이상
                      </>
                    ) : (
                      <>
                        개당 최대 {order.unitPrice.toLocaleString()}G · 남은 수량 {order.quantityRemaining.toLocaleString()}/{order.quantityInitial.toLocaleString()}
                      </>
                    )}
                  </div>
                  {order.kind !== "equip" ? (
                    <div className="mt-1 h-1.5 w-44 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
                      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${progress}%` }} />
                    </div>
                  ) : null}
                  <div className="mt-1 text-[10px] text-zinc-400">
                    보관 골드 {order.goldEscrow.toLocaleString()}G · {remainingLabel(order.expiresAt, clockMs)}
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    aria-expanded={edit != null}
                    onClick={() =>
                      setEdits((current) => ({
                        ...current,
                        [order.id]: edit
                          ? undefined
                          : {
                              quantity: String(order.quantityRemaining),
                              unitPrice: String(order.unitPrice),
                              days: "3",
                              minPower: String(order.minPower ?? 1),
                              minQualityPct: String(order.minQualityPct ?? 0),
                            },
                      }))
                    }
                    disabled={busy}
                    className="rounded-md border border-sky-300 bg-white px-3 py-2 text-xs font-medium text-sky-700 disabled:opacity-50 dark:border-sky-800 dark:bg-zinc-900 dark:text-sky-300"
                  >
                    {edit ? "닫기" : "주문 수정"}
                  </button>
                  <button
                    type="button"
                    onClick={() => onCancelOrder(order)}
                    disabled={busy}
                    className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs font-medium disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900"
                  >
                    주문 취소
                  </button>
                </div>
              </div>
              {edit ? (
                <div className={`${SURFACE_INSET} mt-3 p-3`}>
                  <div className={`grid gap-2 ${order.kind === "equip" ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3"}`}>
                    {order.kind !== "equip" ? (
                      <label className="space-y-1">
                        <span className="block text-[10px] text-zinc-500 dark:text-zinc-400">
                          남은 수량
                        </span>
                        <NumberInput
                          aria-label={`${order.itemName} 수정 수량`}
                          value={edit.quantity}
                          onValueChange={(value) =>
                            setEdits((current) => ({
                              ...current,
                              [order.id]: { ...edit, quantity: value },
                            }))
                          }
                          min={1}
                          className="w-full rounded-md border border-zinc-300 bg-white px-2 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                        />
                      </label>
                    ) : (
                      <>
                        <label className="space-y-1">
                          <span className="block text-[10px] text-zinc-500 dark:text-zinc-400">최소 위력</span>
                          <NumberInput
                            aria-label={`${order.itemName} 수정 최소 위력`}
                            value={edit.minPower}
                            onValueChange={(value) => setEdits((current) => ({ ...current, [order.id]: { ...edit, minPower: value } }))}
                            min={1}
                            className="w-full rounded-md border border-zinc-300 bg-white px-2 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                          />
                        </label>
                        <label className="space-y-1">
                          <span className="block text-[10px] text-zinc-500 dark:text-zinc-400">최소 품질 %</span>
                          <NumberInput
                            aria-label={`${order.itemName} 수정 최소 품질`}
                            value={edit.minQualityPct}
                            onValueChange={(value) => setEdits((current) => ({ ...current, [order.id]: { ...edit, minQualityPct: value } }))}
                            min={0}
                            max={100}
                            className="w-full rounded-md border border-zinc-300 bg-white px-2 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                          />
                        </label>
                      </>
                    )}
                    <label className="space-y-1">
                      <span className="block text-[10px] text-zinc-500 dark:text-zinc-400">
                        개당 가격
                      </span>
                      <NumberInput
                        aria-label={`${order.itemName} 수정 개당 가격`}
                        value={edit.unitPrice}
                        onValueChange={(value) =>
                          setEdits((current) => ({
                            ...current,
                            [order.id]: { ...edit, unitPrice: value },
                          }))
                        }
                        min={1}
                        className="w-full rounded-md border border-zinc-300 bg-white px-2 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="block text-[10px] text-zinc-500 dark:text-zinc-400">
                        새 기간
                      </span>
                      <select
                        value={edit.days}
                        onChange={(event) =>
                          setEdits((current) => ({
                            ...current,
                            [order.id]: { ...edit, days: event.target.value },
                          }))
                        }
                        aria-label={`${order.itemName} 수정 기간`}
                        className="w-full rounded-md border border-zinc-300 bg-white px-2 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                      >
                        {[1, 3, 7].map((days) => (
                          <option key={days} value={days}>
                            {days}일
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="text-[10px] text-zinc-500 dark:text-zinc-400">
                      가격 변경·수량 증가는 같은 가격대의 시간 우선순위가 갱신됩니다.
                    </span>
                    <button
                      type="button"
                      disabled={busy || !editValid}
                      onClick={() => {
                        if (!editValid) return;
                        void onUpdateOrder(
                          order,
                          editQuantity,
                          editUnitPrice,
                          editDays,
                          order.kind === "equip" ? editMinPower : undefined,
                          order.kind === "equip" ? editMinQualityPct : undefined,
                        ).then((ok) => {
                          if (ok) {
                            setEdits((current) => ({
                              ...current,
                              [order.id]: undefined,
                            }));
                          }
                        });
                      }}
                      className="shrink-0 rounded-md border border-emerald-700 bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      변경 저장
                    </button>
                  </div>
                </div>
              ) : null}
            </Card>
          );
        })
      )}

      <Card padding="sm">
        <div className="text-sm font-semibold">가격 알림</div>
        {activeAlerts.length === 0 ? (
          <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">활성 가격 알림이 없어요.</div>
        ) : (
          <div className="mt-2 space-y-2">
            {activeAlerts.map((alert) => (
              <div key={alert.id} className={`${SURFACE_INSET} flex items-center justify-between gap-2 p-2.5`}>
                <div className="text-xs">
                  <span className="font-semibold">{alert.itemName}</span>
                  <span className="ml-1.5 text-zinc-500 dark:text-zinc-400">
                    개당 {alert.targetUnitPrice.toLocaleString()}G 이하
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => onCancelAlert(alert)}
                  disabled={busy}
                  className="text-[11px] font-medium text-rose-600 disabled:opacity-50 dark:text-rose-400"
                >
                  취소
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {recentOrders.length > 0 ? (
        <Card padding="sm">
          <div className="text-sm font-semibold">최근 종료 주문</div>
          <div className="mt-2 space-y-1.5">
            {recentOrders.map((order) => (
              <div key={order.id} className="flex items-center justify-between text-[11px]">
                <span>{order.itemName}{order.kind === "equip" ? " · 장비" : ` · ${order.quantityInitial.toLocaleString()}개`}</span>
                <span className="text-zinc-400">
                  {order.status === "filled" ? "체결 완료" : order.status === "cancelled" ? "취소" : "만료"}
                </span>
              </div>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}

type PriceHistoryPoint = {
  date: string;
  volume: number;
  trades: number;
  averageUnitPrice: number;
  minUnitPrice: number;
  maxUnitPrice: number;
};

function BuyOrderCatalogDialog({
  groups,
  onSelect,
  onClose,
}: {
  groups: MarketplaceStackGroup[];
  onSelect: (group: MarketplaceStackGroup) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLowerCase();
  const filtered = groups.filter(
    (group) => !normalized || group.itemName.toLowerCase().includes(normalized),
  );
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-6" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-md overflow-hidden rounded-t-2xl border border-zinc-200 bg-white shadow-xl sm:rounded-2xl dark:border-zinc-700 dark:bg-zinc-900" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-zinc-200 p-4 dark:border-zinc-700">
          <div>
            <h2 className="text-base font-bold">구매 주문 품목 선택</h2>
            <div className="text-[11px] text-zinc-500 dark:text-zinc-400">현재 판매 매물이 없어도 주문할 수 있어요.</div>
          </div>
          <button type="button" onClick={onClose} aria-label="닫기" className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"><X size={18} /></button>
        </div>
        <div className="p-3">
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="품목 검색" className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950" />
        </div>
        <div className="max-h-[60vh] overflow-y-auto border-t border-zinc-200 p-2 dark:border-zinc-700">
          {filtered.length === 0 ? (
            <div className="p-6 text-center text-xs text-zinc-400">조건에 맞는 품목이 없어요.</div>
          ) : (
            filtered.map((group) => (
              <button key={group.key} type="button" onClick={() => onSelect(group)} className="flex w-full items-center justify-between rounded-md px-3 py-2.5 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800">
                <span className="font-medium">{group.itemName}</span>
                <span className="text-[11px] tabular-nums text-zinc-400">
                  {group.minUnitPrice > 1 ? `최근 평균 ${group.minUnitPrice.toLocaleString()}G` : "시세 없음"}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function MarketToolsDialog({
  group,
  bestBuyOrder,
  existingAlert,
  busy,
  onCreateOrder,
  onCreateAlert,
  onClose,
}: {
  group: MarketplaceStackGroup;
  bestBuyOrder?: BuyOrderBookRow;
  existingAlert?: PriceAlert;
  busy: boolean;
  onCreateOrder: (
    group: MarketplaceStackGroup,
    quantity: number,
    unitPrice: number,
    days: number,
  ) => Promise<unknown>;
  onCreateAlert: (
    group: MarketplaceStackGroup,
    targetUnitPrice: number,
  ) => Promise<unknown>;
  onClose: () => void;
}) {
  const [history, setHistory] = useState<PriceHistoryPoint[] | null>(null);
  const [orderQuantity, setOrderQuantity] = useState("1");
  const [orderUnitPrice, setOrderUnitPrice] = useState(
    String(bestBuyOrder?.bestUnitPrice ?? group.minUnitPrice),
  );
  const [orderDays, setOrderDays] = useState("3");
  const [alertPrice, setAlertPrice] = useState(
    String(existingAlert?.targetUnitPrice ?? group.minUnitPrice),
  );
  const [localError, setLocalError] = useState<string | null>(null);
  const sellLevels = (() => {
    const levels = new Map<
      number,
      { unitPrice: number; totalQuantity: number; orderCount: number }
    >();
    for (const listing of group.listings) {
      const unitPrice = Math.max(
        1,
        Math.ceil(listing.price / Math.max(1, listing.quantity)),
      );
      const level = levels.get(unitPrice);
      if (level) {
        level.totalQuantity += listing.quantity;
        level.orderCount++;
      } else {
        levels.set(unitPrice, {
          unitPrice,
          totalQuantity: listing.quantity,
          orderCount: 1,
        });
      }
    }
    return [...levels.values()]
      .sort((a, b) => a.unitPrice - b.unitPrice)
      .slice(0, 5);
  })();
  const buyLevels = bestBuyOrder?.levels?.slice(0, 5) ?? [];

  useEffect(() => {
    const controller = new AbortController();
    void fetch(
      `/api/v2/marketplace/price-history?kind=${encodeURIComponent(group.kind)}&itemId=${encodeURIComponent(group.itemId)}`,
      { signal: controller.signal },
    )
      .then(async (response) => {
        if (!response.ok) return { points: [] };
        return (await response.json()) as { points?: PriceHistoryPoint[] };
      })
      .then((payload) => setHistory(payload.points ?? []))
      .catch((error: unknown) => {
        if ((error as { name?: string }).name !== "AbortError") setHistory([]);
      });
    return () => controller.abort();
  }, [group.itemId, group.kind]);

  const averages = history?.map((point) => point.averageUnitPrice) ?? [];
  const chartMax = Math.max(...averages, 1);
  const chartMin = Math.min(...averages, chartMax);
  const chartRange = Math.max(1, chartMax - chartMin);
  const chartPoints = (history ?? [])
    .map((point, index, rows) => {
      const x = rows.length <= 1 ? 150 : (index / (rows.length - 1)) * 300;
      const y = 90 - ((point.averageUnitPrice - chartMin) / chartRange) * 75;
      return `${x},${y}`;
    })
    .join(" ");

  const submitOrder = () => {
    const quantity = parseAmount(orderQuantity);
    const unitPrice = parseAmount(orderUnitPrice);
    const days = parseAmount(orderDays);
    const escrow = quantity * unitPrice;
    if (
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      !Number.isInteger(unitPrice) ||
      unitPrice < 1 ||
      !Number.isInteger(days) ||
      days < 1 ||
      days > 7 ||
      !Number.isSafeInteger(escrow) ||
      escrow > 999_999_999
    ) {
      setLocalError("수량·개당 가격·기간(1~7일)을 확인해 주세요.");
      return;
    }
    setLocalError(null);
    void onCreateOrder(group, quantity, unitPrice, days);
  };
  const submitAlert = () => {
    const target = parseAmount(alertPrice);
    if (!Number.isInteger(target) || target < 1) {
      setLocalError("알림 가격을 확인해 주세요.");
      return;
    }
    setLocalError(null);
    void onCreateAlert(group, target);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-6" onClick={onClose}>
      <div
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-zinc-200 bg-white p-5 shadow-xl sm:rounded-2xl dark:border-zinc-700 dark:bg-zinc-900"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold">{group.itemName}</h2>
            <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">시세·구매 주문·가격 알림</div>
          </div>
          <button type="button" onClick={onClose} aria-label="닫기" className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800">
            <X size={18} />
          </button>
        </div>

        <div className={`${SURFACE_INSET} mt-4 p-3`}>
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-semibold">실시간 호가</div>
            <div className="inline-flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              10초마다 갱신
            </div>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <OrderBookSide title="구매 주문" tone="buy" levels={buyLevels} />
            <OrderBookSide title="판매 매물" tone="sell" levels={sellLevels} />
          </div>
          <div className="mt-2 text-center text-[10px] text-zinc-400">
            가격 우선 · 같은 가격은 먼저 등록한 주문 우선
          </div>
        </div>

        <div className={`${SURFACE_INSET} mt-3 p-3`}>
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold">최근 30일 개당 평균가</span>
            {history && history.length > 0 ? (
              <span className="tabular-nums text-sky-700 dark:text-sky-300">
                {history[history.length - 1].averageUnitPrice.toLocaleString()}G
              </span>
            ) : null}
          </div>
          {history === null ? (
            <div className="mt-3 h-24 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
          ) : history.length === 0 ? (
            <div className="py-8 text-center text-xs text-zinc-400">최근 체결 기록이 없어요.</div>
          ) : (
            <>
              <svg viewBox="0 0 300 100" role="img" aria-label="최근 30일 평균가 추이" className="mt-2 h-28 w-full overflow-visible">
                <polyline points={chartPoints} fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" className="text-sky-500" />
              </svg>
              <div className="flex justify-between text-[10px] text-zinc-400">
                <span>{history[0].date.slice(5)}</span>
                <span>거래량 {history.reduce((sum, point) => sum + point.volume, 0).toLocaleString()}개</span>
                <span>{history[history.length - 1].date.slice(5)}</span>
              </div>
            </>
          )}
        </div>

        <div className={`${SURFACE_INSET} mt-3 p-3`}>
          <div className="text-sm font-semibold">구매 주문</div>
          <div className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
            지정 가격 이하 판매가 나오면 자동 체결합니다. 물품과 차액은 우편함으로 전달됩니다.
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <NumberInput aria-label="구매 주문 수량" placeholder="수량" value={orderQuantity} onValueChange={setOrderQuantity} className="min-w-0 rounded-md border border-zinc-300 bg-white px-2 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-900" />
            <NumberInput aria-label="구매 주문 개당 가격" placeholder="개당 가격" value={orderUnitPrice} onValueChange={setOrderUnitPrice} className="min-w-0 rounded-md border border-zinc-300 bg-white px-2 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-900" />
            <select value={orderDays} onChange={(event) => setOrderDays(event.target.value)} className="min-w-0 rounded-md border border-zinc-300 bg-white px-2 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-900" aria-label="구매 주문 기간">
              {[1, 3, 7].map((days) => <option key={days} value={days}>{days}일</option>)}
            </select>
          </div>
          <button type="button" onClick={submitOrder} disabled={busy} className="mt-2 w-full rounded-md border border-emerald-700 bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
            구매 주문 등록
          </button>
        </div>

        <div className={`${SURFACE_INSET} mt-3 p-3`}>
          <div className="text-sm font-semibold">가격 알림</div>
          <div className="mt-2 flex gap-2">
            <NumberInput aria-label="가격 알림 기준" placeholder="개당 가격" value={alertPrice} onValueChange={setAlertPrice} className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-2 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-900" />
            <button type="button" onClick={submitAlert} disabled={busy} className="rounded-md border border-sky-700 bg-sky-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
              {existingAlert ? "알림 수정" : "알림 설정"}
            </button>
          </div>
        </div>
        {localError ? <div className="mt-2 text-xs text-rose-600 dark:text-rose-400">{localError}</div> : null}
      </div>
    </div>
  );
}

function OrderBookSide({
  title,
  tone,
  levels,
}: {
  title: string;
  tone: "buy" | "sell";
  levels: Array<{
    unitPrice: number;
    totalQuantity: number;
    orderCount: number;
  }>;
}) {
  return (
    <div className="overflow-hidden rounded-md border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
      <div className="grid grid-cols-[1fr_auto] border-b border-zinc-200 px-2 py-1.5 text-[10px] font-semibold text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
        <span>{title}</span>
        <span>잔량</span>
      </div>
      {levels.length === 0 ? (
        <div className="px-2 py-5 text-center text-[10px] text-zinc-400">
          호가 없음
        </div>
      ) : (
        levels.map((level) => (
          <div
            key={level.unitPrice}
            className="grid grid-cols-[1fr_auto] gap-1 border-b border-zinc-100 px-2 py-1.5 text-[10px] last:border-b-0 dark:border-zinc-800"
          >
            <span
              className={`font-semibold tabular-nums ${
                tone === "buy"
                  ? "text-emerald-700 dark:text-emerald-300"
                  : "text-rose-700 dark:text-rose-300"
              }`}
            >
              {level.unitPrice.toLocaleString()}G
            </span>
            <span className="text-right tabular-nums text-zinc-600 dark:text-zinc-300">
              {level.totalQuantity.toLocaleString()}
              <span className="ml-1 text-zinc-400">({level.orderCount}건)</span>
            </span>
          </div>
        ))
      )}
    </div>
  );
}

// 구매 확인 모달 — 골드가 HP 회복 통화라 오클릭 방지. 잔액 부족이면 확정 비활성.
function BuyConfirm({
  listing,
  gold,
  coreLoopOn,
  bankedGold,
  frontierDepth,
  clockMs,
  busy,
  onConfirm,
  onCancel,
}: {
  listing: Listing;
  gold: number | null;
  // affordability 게이트와 구매 후 잔액은 같은 결제 가능 골드를 사용한다.
  coreLoopOn: boolean;
  bankedGold: number;
  frontierDepth: number;
  clockMs: number;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const item =
    listing.kind === "equip"
      ? V2_EQUIPMENT[listing.itemId as keyof typeof V2_EQUIPMENT]
      : null;
  const roll = item
    ? listingEquipRoll(item, listing.instancePayload)
    : undefined;
  const detail =
    listing.kind === "equip"
      ? equipDetail(
          listing.itemId,
          roll,
          listingEnhance(listing.instancePayload),
          listingCraftQuality(listing.instancePayload),
        )
      : null;
  const craftedBy =
    listing.kind === "equip" ? listingCraftedBy(listing.instancePayload) : undefined;
  const availableGold =
    gold === null ? null : coreLoopOn ? gold + bankedGold : gold;
  const enough = availableGold === null || availableGold >= listing.price;
  const after =
    availableGold === null ? null : availableGold - listing.price;
  const progressionLock = item
    ? equipmentProgressionLock(item, frontierDepth)
    : null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-bold">구매 확인</h2>
        <div className="mt-3 space-y-1">
          <div className="flex items-center gap-1.5">
            <span
              className={`text-sm font-medium ${
                item
                  ? powerNameClass(
                      item,
                      roll,
                      detail?.enhance,
                      detail?.craftQuality,
                    )
                  : ""
              }`}
            >
              {listing.itemName}
            </span>
            {item ? <EquipmentTierBadge tier={item.tier} compact /> : null}
            <EnhanceLevelBadge enhance={detail?.enhance} />
            <CraftQualityBadge craftQuality={detail?.craftQuality} />
            {craftedBy?.masterwork ? <MasterworkBadge /> : null}
            {listing.kind === "material" && listing.quantity > 1 && (
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400">×{listing.quantity}</span>
            )}
            {detail?.pct != null && (
              <span className="inline-flex items-center gap-1 text-[11px] tabular-nums">
                <span className="text-zinc-500 dark:text-zinc-400">품질</span>
                <QualityPctText pct={detail.pct} className="font-semibold" />
              </span>
            )}
          </div>
          {detail && (
            <div className="text-[11px] text-zinc-600 dark:text-zinc-300">{detail.line}</div>
          )}
          {progressionLock && (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-2.5 py-2 text-xs font-medium text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
              구매·보관은 가능하지만 {progressionLock.label} 전에는 착용할 수 없습니다.
            </div>
          )}
          {listing.kind === "consumable" &&
            (() => {
              const st = consumableStatusLine(listing.itemId, listing.instancePayload, clockMs);
              return st ? (
                <div
                  className={`flex items-center gap-1 text-[11px] ${
                    st.expired
                      ? "text-rose-600 dark:text-rose-400"
                      : "text-sky-700 dark:text-sky-400"
                  }`}
                >
                  <GameIcon name="MapTrifold" size={14} className="shrink-0" />
                  {st.text}
                </div>
              ) : null;
            })()}
        </div>
        <div className="mt-3 space-y-0.5 text-sm">
          <div className="flex justify-between">
            <span className="text-zinc-500 dark:text-zinc-400">가격</span>
            <span className="font-medium text-amber-700 dark:text-amber-400">
              {listing.price.toLocaleString()}골드
            </span>
          </div>
          {availableGold !== null && (
            <div className="flex justify-between text-xs text-zinc-500 dark:text-zinc-400">
              <span>구매 후 골드</span>
              <span className={enough ? "" : "text-rose-600 dark:text-rose-400"}>
                {availableGold.toLocaleString()} → {(after ?? 0).toLocaleString()}
              </span>
            </div>
          )}
        </div>
        {!enough && (
          <div className="mt-2 text-xs text-rose-600 dark:text-rose-400">골드가 부족해요.</div>
        )}
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy || !enough}
            className="flex-1 rounded-md border border-emerald-700 bg-emerald-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            구매
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
          >
            취소
          </button>
        </div>
      </div>
    </div>
  );
}

// 셀렉트 컨트롤 — 둘러보기 필터/정렬.
function SelectControl({
  value,
  onChange,
  options,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  options: ReadonlyArray<readonly [string, string]>;
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`rounded-md border border-zinc-300 bg-white px-2 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-900 ${className ?? ""}`}
    >
      {options.map(([v, label]) => (
        <option key={v} value={v}>
          {label}
        </option>
      ))}
    </select>
  );
}

function remainingLabel(until: string, nowMs: number): string {
  const leftMs = new Date(until).getTime() - nowMs;
  if (leftMs <= 0) return "정산 대기";
  const minutes = Math.max(1, Math.ceil(leftMs / 60_000));
  if (minutes < 60) return `${minutes}분 남음`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest > 0 ? `${hours}시간 ${rest}분 남음` : `${hours}시간 남음`;
}

// 레어맵 매물 상태 — payload 실물 기준 잔여 판수와 30분 만료를 함께 판정.
// 실물이 없으면(소진/만료/불량 스냅샷) 구매 불가 경고. expiryLabel(매물 자체 TTL)은 별개.
function consumableStatusLine(itemId: string, payload: unknown, nowMs: number): { text: string; expired: boolean } | null {
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
  const inst = parseRareMaps([candidate], nowMs)[0];
  if (!inst) return { text: "실물 없음 — 구매 불가", expired: true };
  const def = RARE_MAP_KINDS[inst.kind];
  const usage =
    def?.category === "location"
      ? "희귀 장소"
      : def?.category === "utility"
        ? `사용 ${inst.runsLeft}회`
        : `희귀 탐사 ${inst.runsLeft}판`;
  return { text: usage, expired: false };
}

export function MarketplaceRecentTradeList({
  rows,
  frontierDepth,
  clockMs,
}: {
  rows: Listing[] | null;
  frontierDepth?: number;
  clockMs: number;
}) {
  return (
    <ListingList
      rows={rows}
      emptyText="아직 체결된 거래가 없어요."
      historical
      priceRef={{}}
      frontierDepth={frontierDepth}
      clockMs={clockMs}
      action={(listing) => (
        <MarketplaceTradeReportButton
          tradeId={listing.id}
          itemName={listing.itemName}
        />
      )}
    />
  );
}

function ListingList({
  rows,
  emptyText,
  action,
  historical = false,
  priceRef,
  frontierDepth,
  clockMs,
  onOpenCard,
  favoriteKeys,
  onToggleFavorite,
}: {
  rows: Listing[] | null;
  emptyText: string;
  action: (l: Listing) => React.ReactNode;
  historical?: boolean;
  priceRef: Record<string, PriceStat>;
  frontierDepth?: number;
  clockMs: number;
  favoriteKeys?: Set<string>;
  onToggleFavorite?: (key: string) => void;
  // 장비 클릭 → 옵션 카드. (재료는 옵션 없어 미클릭.)
  onOpenCard?: (
    itemId: string,
    roll: V2EquipRoll | undefined,
    enhance: V2EnhanceState | undefined,
    craftQuality: V2CraftQualityState | undefined,
    craftedBy: V2CraftedBy | undefined,
    el: HTMLElement,
  ) => void;
}) {
  if (rows === null) {
    return (
      <div className="space-y-2" aria-label="매물 불러오는 중">
        {[0, 1, 2].map((index) => (
          <Card key={index} padding="none" className="overflow-hidden">
            <div className="flex animate-pulse gap-3 p-4">
              <div className="h-12 w-12 shrink-0 rounded-md bg-zinc-200 dark:bg-zinc-800" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-2/5 rounded bg-zinc-200 dark:bg-zinc-800" />
                <div className="h-2.5 w-4/5 rounded bg-zinc-100 dark:bg-zinc-800" />
                <div className="h-2.5 w-1/3 rounded bg-zinc-100 dark:bg-zinc-800" />
              </div>
            </div>
            <div className="border-t border-zinc-200 px-4 py-3 dark:border-zinc-700">
              <div className="h-4 w-1/4 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
            </div>
          </Card>
        ))}
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <Card padding="md">
        <div className="flex flex-col items-center gap-2 py-6 text-zinc-400 dark:text-zinc-500">
          <Storefront size={32} weight="duotone" />
          <div className="text-sm">{emptyText}</div>
        </div>
      </Card>
    );
  }
  return (
    <div className="space-y-2">
      {rows.map((l) => {
        const item =
          l.kind === "equip"
            ? V2_EQUIPMENT[l.itemId as keyof typeof V2_EQUIPMENT]
            : undefined;
        const roll = item
          ? listingEquipRoll(item, l.instancePayload)
          : undefined;
        const detail =
          l.kind === "equip"
            ? equipDetail(
                l.itemId,
                roll,
                listingEnhance(l.instancePayload),
                listingCraftQuality(l.instancePayload),
              )
            : null;
        const progressionLock =
          item && frontierDepth != null
            ? equipmentProgressionLock(item, frontierDepth)
            : null;
        const enhance =
          l.kind === "equip" ? listingEnhance(l.instancePayload) : undefined;
        const craftQuality =
          l.kind === "equip" ? listingCraftQuality(l.instancePayload) : undefined;
        const craftedBy =
          l.kind === "equip" ? listingCraftedBy(l.instancePayload) : undefined;
        const priceKey =
          l.kind === "equip"
            ? marketplacePriceKeyForPayload(l.itemId, l.instancePayload)
            : l.itemId;
        const priceStat = priceStatForKey(priceRef, l.itemId, priceKey);
        const comparablePriceStat =
          l.kind === "equip"
            ? priceStat
            : priceStatForQuantity(priceStat, l.quantity);
        const listingTabKey: V2ItemTabKey =
          l.kind === "equip"
            ? (item?.slot ?? "weapon")
            : l.kind === "material"
              ? "material"
              : "consumable";
        const ListingKindIcon = LISTING_ICON[listingTabKey];
        const clickable = l.kind === "equip" && !!onOpenCard;
        const info = (
          <>
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className={`text-sm font-medium ${
                  item
                    ? powerNameClass(
                        item,
                        roll,
                        detail?.enhance,
                        detail?.craftQuality,
                      )
                    : ""
                } ${
                  clickable
                    ? "group-hover:underline group-focus-visible:underline"
                    : ""
                }`}
              >
                {l.itemName}
              </span>
              {item ? <EquipmentTierBadge tier={item.tier} compact /> : null}
              {item ? <EquipmentCodexBadge itemId={item.id} /> : null}
              <EnhanceLevelBadge enhance={detail?.enhance} />
              <CraftQualityBadge craftQuality={detail?.craftQuality} />
              {craftedBy?.masterwork ? <MasterworkBadge /> : null}
              {l.kind !== "equip" && l.quantity > 1 && (
                <span className="text-[11px] text-zinc-500 dark:text-zinc-400">×{l.quantity}</span>
              )}
              {detail?.pct != null && (
                <span className="inline-flex items-center gap-1 text-[11px] tabular-nums">
                  <span className="text-zinc-500 dark:text-zinc-400">품질</span>
                  <QualityPctText pct={detail.pct} className="font-semibold" />
                </span>
              )}
              {item?.craftOnly ? <CraftOnlyBadge /> : null}
            </div>
            {l.kind === "consumable" &&
              (() => {
                const st = consumableStatusLine(l.itemId, l.instancePayload, clockMs);
                return st ? (
                  <div
                    className={`mt-0.5 flex items-center gap-1 text-[11px] ${
                      st.expired
                        ? "text-rose-600 dark:text-rose-400"
                        : "text-sky-700 dark:text-sky-400"
                    }`}
                  >
                    <GameIcon name="MapTrifold" size={14} className="shrink-0" />
                    {st.text}
                  </div>
                ) : null;
              })()}
            {detail && (
              <div className="mt-0.5 break-words text-[11px] text-zinc-600 dark:text-zinc-300">
                {detail.line}
              </div>
            )}
            {progressionLock && (
              <div className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                <GameIcon name="Lock" size={13} className="shrink-0" />
                착용 조건: {progressionLock.label}
              </div>
            )}
          </>
        );
        return (
          <Card key={l.id} padding="none" className="overflow-hidden">
            <div className="flex items-start gap-3 p-3 sm:p-4">
              <div
                className={`${SURFACE_INSET} flex h-12 w-12 shrink-0 items-center justify-center text-sky-700 dark:text-sky-300`}
              >
                <ListingKindIcon size={25} weight="duotone" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  {clickable ? (
                    <button
                      type="button"
                      onClick={(e) =>
                        onOpenCard!(
                          l.itemId,
                          roll,
                          enhance,
                          craftQuality,
                          craftedBy,
                          e.currentTarget,
                        )
                      }
                      className="group min-w-0 text-left"
                    >
                      {info}
                    </button>
                  ) : (
                    <div className="min-w-0">{info}</div>
                  )}
                  {onToggleFavorite ? (
                    <button
                      type="button"
                      onClick={() => onToggleFavorite(`${l.kind}:${l.itemId}`)}
                      aria-label={`${l.itemName} 즐겨찾기 ${favoriteKeys?.has(`${l.kind}:${l.itemId}`) ? "해제" : "추가"}`}
                      className="shrink-0 rounded-md p-1.5 text-amber-500 transition hover:bg-amber-50 dark:hover:bg-amber-950"
                    >
                      <Star
                        size={17}
                        weight={favoriteKeys?.has(`${l.kind}:${l.itemId}`) ? "fill" : "regular"}
                      />
                    </button>
                  ) : null}
                </div>
                {craftedBy ? (
                  <div className="mt-0.5 text-[11px] text-emerald-700 dark:text-emerald-300">
                    제작:{" "}
                    <PlayerNameLink
                      name={craftedBy.name}
                      className="font-medium"
                      fallback="모험가"
                    />{" "}
                    · 대장장이 Lv {craftedBy.level.toLocaleString()}
                  </div>
                ) : null}
                <div className="mt-1 text-[11px] text-zinc-400 dark:text-zinc-500">
                  {historical ? "체결" : "등록"} {timeAgo(l.createdAt)}
                </div>
              </div>
            </div>
            <div
              data-testid="marketplace-listing-footer"
              className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-end sm:justify-between border-t border-zinc-200 px-3 py-2.5 sm:px-4 dark:border-zinc-700"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    {historical ? "체결가" : "즉시구매가"}
                  </span>
                  <span className="text-base font-bold tabular-nums text-amber-700 dark:text-amber-400">
                    {l.price.toLocaleString()}G
                  </span>
                  {historical && l.kind !== "equip" && l.quantity > 1 ? (
                    <span className="text-[11px] font-medium tabular-nums text-zinc-500 dark:text-zinc-400">
                      개당 {Math.ceil(l.price / l.quantity).toLocaleString()}G
                    </span>
                  ) : null}
                  {!historical && l.highestBid != null ? (
                    <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-sky-700 dark:bg-sky-950 dark:text-sky-300">
                      현재 입찰 {l.highestBid.toLocaleString()}G · {l.bidCount}건
                    </span>
                  ) : null}
                  <PricePositionBadge price={l.price} stat={comparablePriceStat} />
                  {!historical ? (
                    <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
                      {new Date(l.bidEndsAt).getTime() > clockMs
                        ? `입찰 유예 · ${remainingLabel(l.bidEndsAt, clockMs)}`
                        : (l.highestBid ?? 0) > l.price
                          ? "입찰 판매 확정 · 정산 대기"
                          : new Date(l.expiresAt).getTime() <= clockMs
                            ? "등록 만료 · 정산 대기"
                            : `즉시구매 · ${remainingLabel(l.expiresAt, clockMs)}`}
                    </span>
                  ) : null}
                </div>
                <PriceRefLine
                  stat={comparablePriceStat}
                  scoped={priceKey !== l.itemId && !!priceRef[priceKey]}
                />
              </div>
              <div
                data-testid="marketplace-listing-action"
                className="w-full sm:w-auto [&>*]:w-full sm:[&>*]:w-auto"
              >
                {action(l)}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
