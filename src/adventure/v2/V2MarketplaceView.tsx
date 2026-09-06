"use client";

import { SelectControl } from "./marketplace/SelectControl";
import { MarketplaceAuctionSettings } from "./marketplace/MarketplaceAuctionSettings";

import { V2_MATERIALS } from "@/adventure/data/v2/dungeonDrops";
import { FISH, type FishId } from "@/adventure/data/v2/fish";
import {
  MUSEUN_CASH_ITEMS,
  type MuseunCashItemCounts,
  type MuseunCashItemId,
} from "@/adventure/data/v2/museunCashItems";
import { type RareMapInstance } from "@/adventure/data/v2/rareMaps";
import type { V2EnhanceState } from "@/adventure/data/v2/v2Enhance";
import {
  V2_EQUIPMENT,
  type V2CraftQualityState,
  type V2CraftedBy,
  type V2EquipInstance,
  type V2EquipRoll,
  type V2EquipSlot,
  type V2Equipment,
} from "@/adventure/data/v2/v2Equipment";
import {
  type CookingFoodDefinitionMap,
  type CookingFoodId,
  type CookingFoodInventory,
} from "@/adventure/v2/cooking/foodShared";
import { fishSpecimenItemId, type FishSpecimenInventory } from "./fishSpecimens";
import { GameIcon } from "./GameIcon";
import { useEquipmentCodexContext, useGameState } from "./GameStateProvider";
import {
  equippedInstanceForMarketplaceItem,
  equippedItemIdsForMarketplace,
} from "@/adventure/v2/marketplace/equipmentComparison";
import { marketplaceLifeItemDefinition } from "@/adventure/v2/marketplace/lifeItemCatalog";
import {
  listingCraftQuality,
  listingCraftedBy,
} from "@/adventure/v2/marketplace/listingPresentation";
import { marketplaceActionErrorLabel } from "@/adventure/v2/marketplace/marketplaceActionErrors";
import { BidDialog } from "@/adventure/v2/marketplace/MarketplaceBidDialog";
import type { MarketplaceMyBid } from "@/adventure/v2/marketplace/marketplaceBidTracking";
import {
  MARKETPLACE_EQUIPMENT_TIER_OPTIONS,
  matchesMarketplaceEquipmentTier,
  matchesMarketplaceUnregisteredCodex,
  type MarketplaceEquipmentTierFilter,
} from "@/adventure/v2/marketplace/marketplaceBrowseFilters";
import { MarketplaceEquipmentTab } from "@/adventure/v2/marketplace/MarketplaceEquipmentTab";
import {
  ListingList,
  MarketplaceRecentTradeList,
} from "@/adventure/v2/marketplace/MarketplaceListingList";
import { MarketplaceMaterialTab } from "@/adventure/v2/marketplace/MarketplaceMaterialTab";
import { MarketplaceMyBids } from "@/adventure/v2/marketplace/MarketplaceMyBids";
import {
  MarketToolsDialog,
  PriceAlert,
  PriceAlertManagement,
} from "@/adventure/v2/marketplace/MarketplacePriceTools";
import { MarketplaceRareMapTab } from "@/adventure/v2/marketplace/MarketplaceRareMapTab";
import {
  readMarketplaceBrowse,
  readMarketplaceHistory,
  readMarketplaceMyBids,
  readMarketplacePrices,
} from "@/adventure/v2/marketplace/marketplaceReadClient";
import {
  compareMarketplaceListings,
  type Listing,
  type MarketplaceBrowseSort,
  type MarketplaceStackGroup,
  type PriceStat,
} from "@/adventure/v2/marketplace/marketplaceShared";
import { MarketplaceStackBrowse } from "@/adventure/v2/marketplace/MarketplaceStackBrowse";
import {
  MarketplaceTradeReportButton,
} from "@/adventure/v2/marketplace/MarketplaceTradeReportButton";
import { filterMarketplaceRecentTrades } from "@/adventure/v2/marketplace/recentTradeSearch";
import { useSystemMessageState } from "./RewardToastProvider";
import { V2ItemCard, V2ItemCompareCard, anchorOf, type ItemCardAnchor } from "./V2ItemCard";
import {
  V2_ITEM_TABS,
  itemTabForMarketplaceListing,
  itemTabForMaterial,
  sortEquipInstances,
  type SortMode,
  type V2ItemTabKey,
} from "./v2ItemListShared";
import { Card } from "@/components/ui/Card";
import { parseAmount } from "@/components/ui/NumberInput";
import { Pagination } from "@/components/ui/Pagination";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { SURFACE_INSET } from "@/components/ui/surfaces";
import { TabBar } from "@/components/ui/TabBar";
import { timeAgoKo as timeAgo } from "@/lib/timeFormat";
import { usePagination } from "@/lib/usePagination";
import { useSingleFlightGuard } from "@/lib/useSingleFlight";
import {
  Gavel,
  ListPlus,
  MagnifyingGlass,
  Package,
  Receipt,
  ShoppingCart,
  SlidersHorizontal,
  Star,
  Storefront,
  X,
  type Icon,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createMarketplaceReadCoordinator } from "./marketplace/marketplaceReadCoordinator";

export { MarketplaceRecentTradeList } from "@/adventure/v2/marketplace/MarketplaceListingList";


type Tab = "browse" | "sell" | "recent" | "mine";



type MineTab = "active" | "bids" | "alerts" | "history";



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
  { key: "browse", label: "경매", description: "입찰 매물", Icon: ShoppingCart },
  { key: "sell", label: "판매", description: "아이템 올리기", Icon: ListPlus },
  { key: "recent", label: "최근 거래", description: "전체 체결", Icon: Receipt },
  { key: "mine", label: "내 거래", description: "판매·입찰 관리", Icon: Package },
];




export type MarketplacePreviewData = {
  viewerGold: number;
  auctionHours: number;
  bidExtensionWindowMinutes: number;
  bidExtensionMinutes: number;
  listings: Listing[];
  prices: Record<string, PriceStat>;
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
  const equipmentCodex = useEquipmentCodexContext();
  const equipmentCodexLoaded = equipmentCodex?.loaded === true;
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
  const [myBids, setMyBids] = useState<MarketplaceMyBid[] | null>(null);
  // 최근 거래 — Trade 를 Listing 형태로 매핑(ListingList 재사용). createdAt 자리 = 체결 시각.
  const [recentTrades, setRecentTrades] = useState<Listing[] | null>(null);
  const [recentSearch, setRecentSearch] = useState("");
  const [myHistory, setMyHistory] = useState<Listing[] | null>(null);
  const [priceAlerts, setPriceAlerts] = useState<PriceAlert[] | null>(null);
  // 팔기 — 내 인벤(미장착·미잠금 장비 + 재료). 강화 상태는 그대로 거래된다.
  const [owned, setOwned] = useState<V2EquipInstance[]>([]);
  const [equipped, setEquipped] = useState<Partial<Record<V2EquipSlot, string>>>({});
  const [materials, setMaterials] = useState<Record<string, number>>({});
  const [rareMaps, setRareMaps] = useState<RareMapInstance[]>([]);
  const [cashItems, setCashItems] = useState<MuseunCashItemCounts>({});
  const [cookingFoods, setCookingFoods] = useState<CookingFoodInventory>({});
  const [cookingFoodDefinitions, setCookingFoodDefinitions] = useState<CookingFoodDefinitionMap>({});
  const [fishSpecimens, setFishSpecimens] = useState<FishSpecimenInventory["items"]>({});
  const [durationHours, setDurationHours] = useState(6);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [qtys, setQtys] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const beginAction = useSingleFlightGuard();
  const [msg, setMsg] = useSystemMessageState();
  const [error, setError] = useState<string | null>(null);
  const [gold, setGold] = useState<number | null>(preview?.viewerGold ?? null);
  // 둘러보기 — 정렬/필터/검색(클라이언트측, 반환된 매물 위).
  const [marketToolGroup, setMarketToolGroup] =
    useState<MarketplaceStackGroup | null>(null);
  const [confirmBid, setConfirmBid] = useState<Listing | null>(null);
  const [bidAmount, setBidAmount] = useState("");
  const [publicBids, setPublicBids] = useState<
    Array<{ amount: number; createdAt: string; isMine: boolean }>
  >([]);
  const [search, setSearch] = useState("");
  const [favoriteKeys, setFavoriteKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [personalOnly, setPersonalOnly] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [unregisteredCodexOnly, setUnregisteredCodexOnly] = useState(false);
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
  const [auctionHours, setAuctionHours] = useState(preview?.auctionHours ?? 6);
  const [bidExtensionWindowMinutes, setBidExtensionWindowMinutes] = useState(
    preview?.bidExtensionWindowMinutes ?? 10,
  );
  const [bidExtensionMinutes, setBidExtensionMinutes] = useState(
    preview?.bidExtensionMinutes ?? 10,
  );
  const [serverClockOffsetMs, setServerClockOffsetMs] = useState(0);
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

  const [reads] = useState(createMarketplaceReadCoordinator);
  const browseSequence = useRef(0);
  useEffect(() => () => reads.invalidate(), [reads]);

  const loadBrowse = useCallback((mineOnly: boolean) => reads.run(
    `browse:${mineOnly}`,
    async () => {
      const sequence = ++browseSequence.current;
      return { j: await readMarketplaceBrowse(mineOnly), sequence };
    },
    ({ j, sequence }) => {
      if (mineOnly) setMine(j.listings ?? []);
      else setListings(j.listings ?? []);
      // Both tabs return shared wallet/clock metadata. Only the latest read may update it.
      if (sequence !== browseSequence.current) return;
      if (typeof j.viewerGold === "number") setGold(j.viewerGold);
      if (typeof j.serverNow === "number" && Number.isFinite(j.serverNow)) {
        setServerClockOffsetMs(j.serverNow - Date.now());
        setClockMs(j.serverNow);
      }
      if (typeof j.auctionHours === "number") setAuctionHours(j.auctionHours);
      if (typeof j.bidExtensionWindowMinutes === "number") {
        setBidExtensionWindowMinutes(j.bidExtensionWindowMinutes);
      }
      if (typeof j.bidExtensionMinutes === "number") {
        setBidExtensionMinutes(j.bidExtensionMinutes);
      }
    },
  ), [reads]);

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

  const loadPrices = useCallback(() => reads.run("prices", readMarketplacePrices, (prices) => {
    if (prices) setPriceRef(prices);
  }), [reads]);

  const loadHistory = useCallback((mineOnly: boolean) => reads.run(`history:${mineOnly}`, () => readMarketplaceHistory(mineOnly), (rows) => {
    if (mineOnly) setMyHistory(rows);
    else setRecentTrades(rows);
  }), [reads]);

  const loadMyBids = useCallback(() => reads.run("my-bids", readMarketplaceMyBids, setMyBids), [reads]);

  const loadPriceAlerts = useCallback(() => reads.run("price-alerts", async () => {
    const response = await fetch("/api/v2/marketplace/price-alerts");
    if (response.ok) {
      const payload = (await response.json()) as {
        ok?: boolean;
        alerts?: PriceAlert[];
      };
      if (payload.ok) return payload.alerts ?? [];
    }
    return null;
  }, (alerts) => { if (alerts) setPriceAlerts(alerts); }), [reads]);

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
      void loadMyBids().catch((e) => setError(String(e.message ?? e)));
      void loadEquipment();
      void loadPrices();
    } else {
      void loadInventory().catch(() => setError("인벤토리 로드 실패"));
      void loadPrices();
      void loadPriceAlerts();
    }
  }, [
    tab,
    loadBrowse,
    loadEquipment,
    loadInventory,
    loadPrices,
    loadHistory,
    loadPriceAlerts,
    loadMyBids,
    preview,
  ]);

  const automationSurfaceOpen =
    marketToolGroup != null ||
    (tab === "mine" && mineTab === "alerts");

  useEffect(() => {
    if (preview || !automationSurfaceOpen) return;
    void loadPriceAlerts();
  }, [automationSurfaceOpen, loadPriceAlerts, preview]);

  useEffect(() => {
    const timer = window.setInterval(
      () => setClockMs(Date.now() + serverClockOffsetMs),
      30_000,
    );
    return () => window.clearInterval(timer);
  }, [serverClockOffsetMs]);

  useEffect(() => {
    if (preview || (tab !== "browse" && tab !== "mine")) return;
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      const requests = [loadBrowse(tab === "mine")];
      if (tab === "mine") requests.push(loadMyBids());
      if (automationSurfaceOpen) requests.push(loadPriceAlerts());
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
    loadPriceAlerts,
    loadMyBids,
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
        reads.invalidate();
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
    [beginAction, setMsg, reads],
  );

  const cancel = (l: Listing) =>
    act("/api/v2/marketplace/cancel", { listingId: l.id }, "✓ 매물 취소 — 아이템 반환", () => loadBrowse(true));
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
      loadPriceAlerts,
    );
  const cancelPriceAlert = (alert: PriceAlert) =>
    act(
      "/api/v2/marketplace/price-alerts",
      { action: "cancel", alertId: alert.id },
      `✓ ${alert.itemName} 가격 알림 취소`,
      loadPriceAlerts,
    );

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

  const placeBid = async () => {
    const listing = confirmBid;
    const amount = parseAmount(bidAmount);
    if (!listing || !Number.isInteger(amount) || amount < listing.nextBid) {
      setError(
        `다음 입찰가는 ${listing?.nextBid.toLocaleString() ?? 1}골드 이상이어야 합니다.`,
      );
      return;
    }
    const release = beginAction();
    if (!release) return false;
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const response = await fetch("/api/v2/marketplace/bid", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ listingId: listing.id, amount }),
      });
      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        highestBid?: number;
        nextBid?: number;
        bidEndsAt?: string;
        extended?: boolean;
      } | null;
      if (!response.ok || !payload?.ok) {
        setError(actionErrorLabel(payload, response.status));
        return false;
      }
      reads.invalidate();
      const update = (row: Listing): Listing =>
        row.id === listing.id
          ? {
              ...row,
              highestBid: payload.highestBid ?? amount,
              nextBid: payload.nextBid ?? row.nextBid,
              bidEndsAt: payload.bidEndsAt ?? row.bidEndsAt,
              bidCount: row.bidCount + 1,
              isHighestBidder: !row.isMine,
            }
          : row;
      setListings((current) => current?.map(update) ?? current);
      setMine((current) => current?.map(update) ?? current);
      setConfirmBid(null);
      setMsg(
        `✓ ${amount.toLocaleString()}골드 입찰 완료${payload.extended ? ` · 마감 ${bidExtensionMinutes}분 연장` : ""}`,
      );
      await Promise.all([
        loadBrowse(false),
        ...(myBids !== null ? [loadMyBids()] : []),
      ]);
      await refreshGameState();
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "처리 실패");
      return false;
    } finally {
      release();
      setBusy(false);
    }
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
        durationHours,
        kind: "equip",
        iid: inst.iid,
        price,
      },
      `✓ ${V2_EQUIPMENT[inst.id]?.name ?? inst.id} 등록`,
      loadInventory,
    );
  };
  const listMaterial = (matId: string) => {
    const price = parseAmount(prices[matId]);
    const qty = Number(qtys[matId] ?? "1");
    if (!Number.isInteger(price) || price < 1) {
      setError("묶음 전체 시작 입찰가는 1 이상 정수로 입력하세요.");
      return;
    }
    if (!Number.isInteger(qty) || qty < 1) {
      setError("수량은 1 이상 정수로 입력하세요.");
      return;
    }
    if (!Number.isSafeInteger(price) || price > 999_999_999) {
      setError("시작 입찰가는 999,999,999골드를 넘을 수 없어요.");
      return;
    }
    return act(
      "/api/v2/marketplace/list",
      {
        durationHours,
        kind: "material",
        itemId: matId,
        quantity: qty,
        price,
      },
      `✓ ${V2_MATERIALS[matId]?.name ?? marketplaceLifeItemDefinition(matId)?.name ?? matId} ${qty}개 묶음 경매 등록`,
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
        durationHours,
        kind: "consumable",
        iid,
        price,
      },
      "✓ 레어맵 등록",
      loadInventory,
    );
  };

  const listCashItem = (itemId: MuseunCashItemId) => {
    const price = parseAmount(prices[itemId]);
    const quantity = parseAmount(qtys[itemId] ?? "1");
    if (!Number.isInteger(price) || price < 1) {
      setError("묶음 전체 시작 입찰가는 1 이상 정수로 입력하세요.");
      return;
    }
    if (!Number.isInteger(quantity) || quantity < 1) {
      setError("수량은 1 이상 정수로 입력하세요.");
      return;
    }
    if (!Number.isSafeInteger(price) || price > 999_999_999) {
      setError("시작 입찰가는 999,999,999골드를 넘을 수 없어요.");
      return;
    }
    return act(
      "/api/v2/marketplace/list",
      {
        durationHours,
        kind: "consumable",
        itemId,
        quantity,
        price,
      },
      `✓ ${MUSEUN_CASH_ITEMS[itemId].name} ${quantity}개 등록`,
      loadInventory,
    );
  };

  const listCookingFood = (itemId: CookingFoodId) => {
    const price = parseAmount(prices[itemId]);
    const quantity = parseAmount(qtys[itemId] ?? "1");
    if (!Number.isInteger(price) || price < 1) {
      setError("묶음 전체 시작 입찰가는 1 이상 정수로 입력하세요.");
      return;
    }
    if (!Number.isInteger(quantity) || quantity < 1) {
      setError("수량은 1 이상 정수로 입력하세요.");
      return;
    }
    if (!Number.isSafeInteger(price) || price > 999_999_999) {
      setError("시작 입찰가는 999,999,999골드를 넘을 수 없어요.");
      return;
    }
    const name = cookingFoodDefinitions[itemId]?.name ?? "음식";
    return act(
      "/api/v2/marketplace/list",
      {
        durationHours,
        kind: "consumable",
        itemId,
        quantity,
        price,
      },
      `✓ ${name} ${quantity}개 등록`,
      loadInventory,
    );
  };

  const listFishSpecimen = (fishId: FishId) => {
    const itemId = fishSpecimenItemId(fishId);
    const price = parseAmount(prices[itemId]);
    const quantity = parseAmount(qtys[itemId] ?? "1");
    if (!Number.isInteger(price) || price < 1) {
      setError("묶음 전체 시작 입찰가는 1 이상 정수로 입력하세요.");
      return;
    }
    if (!Number.isInteger(quantity) || quantity < 1) {
      setError("수량은 1 이상 정수로 입력하세요.");
      return;
    }
    if (!Number.isSafeInteger(price) || price > 999_999_999) {
      setError("시작 입찰가는 999,999,999골드를 넘을 수 없어요.");
      return;
    }
    return act(
      "/api/v2/marketplace/list",
      {
        durationHours,
        kind: "consumable",
        itemId,
        quantity,
        price,
      },
      `✓ ${FISH[fishId].name} 표본 ${quantity}개 등록`,
      loadInventory,
    );
  };

  const equippedIids = new Set(Object.values(equipped));
  const sellableEquip = owned.filter(
    (i) => !i.locked && !equippedIids.has(i.iid),
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
    .filter(
      (l) => !personalOnly || l.isMine || l.isHighestBidder || l.hasMyBid,
    )
    .filter((l) => !favoriteOnly || favoriteKeys.has(favoriteKeyForListing(l)))
    .filter(
      (l) =>
        !browseEquipmentTab ||
        matchesMarketplaceEquipmentTier(l.itemId, equipmentTierFilter),
    )
    .filter(
      (listing) =>
        !browseEquipmentTab ||
        matchesMarketplaceUnregisteredCodex(
          listing.itemId,
          unregisteredCodexOnly,
          equipmentCodexLoaded,
          equipmentCodex?.registeredIds,
        ),
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
  const displayedItemCount = displayedListings.length;
  const activeFilterCount =
    Number(favoriteOnly) +
    Number(personalOnly) +
    (browseEquipmentTab
      ? Number(equipmentTierFilter !== "all") +
        Number(unregisteredCodexOnly) +
        Number(craftedOnly) +
        Number(craftedQualityFilter !== "all") +
        Number(craftedLevelFilter !== "all")
      : 0);
  const activeSortLabel =
    browseSortOptions.find(([value]) => value === sort)?.[1] ?? "가격 낮은순";
  const resetBrowseFilters = () => {
    setEquipmentTierFilter("all");
    setUnregisteredCodexOnly(false);
    setCraftedOnly(false);
    setCraftedQualityFilter("all");
    setCraftedLevelFilter("all");
    setFavoriteOnly(false);
    setPersonalOnly(false);
  };
  const browsePager = usePagination(
    displayedListings,
    MARKETPLACE_PAGE_SIZE,
    `browse:${browseTab}:${q}:${favoriteOnly}:${personalOnly}:${equipmentTierFilter}:${unregisteredCodexOnly}:${craftedOnly}:${craftedQualityFilter}:${craftedLevelFilter}:${sort}`,
  );
  const filteredRecentTrades = filterMarketplaceRecentTrades(
    recentTrades ?? [],
    recentSearch,
  );
  const recentTradesPager = usePagination(
    filteredRecentTrades,
    MARKETPLACE_PAGE_SIZE,
    `recent-trades:${recentSearch.trim().toLocaleLowerCase("ko-KR")}`,
  );
  const myHistoryPager = usePagination(
    myHistory ?? [],
    MARKETPLACE_PAGE_SIZE,
    "my-history",
  );
  const minePager = usePagination(mine ?? [], MARKETPLACE_PAGE_SIZE, "mine");

  const openMarketTools = (listing: Listing) =>
    setMarketToolGroup({
      key: `${listing.kind}:${listing.itemId}`,
      kind: listing.kind as "material" | "consumable",
      itemId: listing.itemId,
      itemName: listing.itemName,
      totalQuantity: listing.quantity,
      minUnitPrice: Math.max(1, Math.ceil(listing.price / listing.quantity)),
      listings: [listing],
    });

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
    ? {
        ...marketToolGroup,
        listings: (listings ?? []).filter(
          (listing) => `${listing.kind}:${listing.itemId}` === marketToolGroup.key,
        ),
      }
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
                    ? "bg-sky-700 text-white shadow-sm"
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
                      active ? "text-sky-100" : "text-zinc-600 dark:text-zinc-400"
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
        <div
          role="alert"
          className={`${SURFACE_INSET} p-3 text-sm text-rose-600 dark:text-rose-400`}
        >
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
              <div className={`${SURFACE_INSET} px-3 py-2 text-[11px] text-zinc-600 dark:text-zinc-300`}>
                매물은 6·12·24시간 중 선택한 기간 동안 경매하며, 마감 {bidExtensionWindowMinutes}분 미만에 새 입찰이 들어오면 마감이 {bidExtensionMinutes}분 연장됩니다.
              </div>
              <button
                type="button"
                aria-pressed={personalOnly}
                aria-label="내 항목만 보기"
                onClick={() => setPersonalOnly((value) => !value)}
                className={`flex w-full items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-xs font-semibold transition ${
                  personalOnly
                    ? "border-sky-700 bg-sky-700 text-white"
                    : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                }`}
              >
                <Package size={15} weight={personalOnly ? "fill" : "duotone"} />
                내 항목만 보기
              </button>
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
                      ? "border-sky-700 bg-sky-700 text-white"
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
                          ? "border-sky-700 bg-sky-700 text-white"
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
                      <div className="space-y-1">
                        <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                          도감 상태
                        </span>
                        <button
                          type="button"
                          aria-pressed={unregisteredCodexOnly}
                          disabled={!equipmentCodexLoaded}
                          onClick={() =>
                            setUnregisteredCodexOnly((value) => !value)
                          }
                          className={`w-full rounded-md border px-3 py-2 text-left text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${
                            unregisteredCodexOnly
                              ? "border-sky-600 bg-sky-600 text-white"
                              : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                          }`}
                        >
                          {!equipmentCodexLoaded
                            ? "도감 불러오는 중"
                            : unregisteredCodexOnly
                              ? "✓ 도감 미등록만 보는 중"
                              : "도감 미등록만 보기"}
                        </button>
                      </div>
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
                    매물{" "}
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
                  {browseEquipmentTab && unregisteredCodexOnly ? (
                    <span
                      data-testid="marketplace-unregistered-codex-filter-chip"
                      className="rounded-full bg-sky-100 px-2 py-1 text-sky-700 dark:bg-sky-950 dark:text-sky-300"
                    >
                      도감 미등록
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
                  {personalOnly ? (
                    <span className="rounded-full bg-sky-100 px-2 py-1 text-sky-700 dark:bg-sky-950 dark:text-sky-300">
                      내 항목
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
          {!browseEquipmentTab ? (
            <MarketplaceStackBrowse
              listings={browsePager.pageItems}
              clockMs={clockMs}
              busy={busy}
              favoriteKeys={favoriteKeys}
              onToggleFavorite={toggleFavorite}
              onBid={(listing) => void openBid(listing)}
              onOpenTools={openMarketTools}
            />
          ) : null}
          {browseEquipmentTab ? (
            <ListingList
              rows={listings === null ? null : browsePager.pageItems}
              emptyText={
                browseEquipmentTab &&
                unregisteredCodexOnly &&
                equipmentCodexLoaded
                  ? "도감 미등록 매물이 없어요."
                  : listings && listings.length > 0
                    ? "조건에 맞는 매물이 없어요."
                    : "등록된 매물이 없어요."
              }
              action={(l) => {
                const bidding = new Date(l.bidEndsAt).getTime() > clockMs;
                const primaryAction = bidding ? (
                  <button
                    type="button"
                    onClick={() => void openBid(l)}
                    disabled={busy}
                    className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-sky-700 bg-sky-600 px-3 text-xs font-semibold text-white shadow-sm transition hover:bg-sky-700 disabled:opacity-50"
                  >
                    {l.isMine ? `입찰 ${l.bidCount}건` : "입찰"}
                  </button>
                ) : l.bidCount > 0 ? (
                  <button
                    type="button"
                    onClick={() => void openBid(l)}
                    className="h-9 shrink-0 rounded-md border border-amber-300 px-3 text-xs font-medium text-amber-800 dark:border-amber-800 dark:text-amber-300"
                  >
                    입찰 내역
                  </button>
                ) : (
                  <span className="shrink-0 text-[11px] text-zinc-400">
                    정산 중
                  </span>
                );
                return (
                  <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
                    {!l.isMine ? (
                      <MarketplaceTradeReportButton
                        tradeId={l.id}
                        itemName={l.itemName}
                        sourceType="marketplace_listing"
                      />
                    ) : null}
                    {primaryAction}
                  </div>
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
          {listings !== null && displayedListings.length > MARKETPLACE_PAGE_SIZE && (
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
            <label className="relative mt-3 block">
              <span className="sr-only">최근 거래 품목 검색</span>
              <MagnifyingGlass
                size={16}
                aria-hidden
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
              />
              <input
                type="search"
                value={recentSearch}
                onChange={(event) => setRecentSearch(event.target.value)}
                placeholder="체결 품목 검색"
                className="w-full rounded-md border border-zinc-300 bg-white py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 dark:border-zinc-700 dark:bg-zinc-900"
              />
            </label>
          </Card>
          <MarketplaceRecentTradeList
            rows={
              recentTrades === null ? null : recentTradesPager.pageItems
            }
            frontierDepth={frontierDepth}
            clockMs={clockMs}
            emptyText={
              recentTrades !== null && recentSearch.trim()
                ? "검색 결과가 없어요."
                : undefined
            }
          />
          {recentTrades !== null && filteredRecentTrades.length > 0 ? (
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
            <div className="grid grid-cols-4 p-1.5">
              {([
                ["active", "판매 중", Package],
                ["bids", "내 입찰", Gavel],
                ["alerts", "가격 알림", Star],
                ["history", "거래 내역", Receipt],
              ] as const).map(([key, label, Icon]) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={mineTab === key}
                  onClick={() => setMineTab(key)}
                  className={`flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold transition ${
                    mineTab === key
                      ? "bg-sky-700 text-white"
                      : "text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                  }`}
                >
                  <Icon size={15} weight={mineTab === key ? "fill" : "duotone"} />
                  {label}
                  {key === "active" && mine !== null && mine.length > 0 ? (
                    <span className="rounded-full bg-white px-1.5 py-0.5 text-[9px] leading-none text-sky-700">
                      {mine.length}
                    </span>
                  ) : key === "bids" && myBids !== null && myBids.length > 0 ? (
                    <span className="rounded-full bg-white px-1.5 py-0.5 text-[9px] leading-none text-sky-700">
                      {myBids.length}
                    </span>
                  ) : key === "alerts" && priceAlerts !== null ? (
                    <span className="rounded-full bg-white px-1.5 py-0.5 text-[9px] leading-none text-sky-700">
                      {priceAlerts.filter((alert) => alert.status === "active").length}
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
                action={(l) => {
                  const bidding = new Date(l.bidEndsAt).getTime() > clockMs;
                  if (l.bidCount > 0) return (
                    <button
                      type="button"
                      onClick={() => void openBid(l)}
                      className="h-9 shrink-0 rounded-md border border-sky-300 px-3 text-xs font-medium text-sky-800 dark:border-sky-800 dark:text-sky-300"
                    >
                      입찰 {l.bidCount}건
                    </button>
                  );
                  return bidding ? (
                      <button
                        type="button"
                        onClick={() => cancel(l)}
                        disabled={busy}
                        className="h-9 rounded-md border border-zinc-300 bg-white px-2.5 text-xs font-medium hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
                      >
                        취소
                      </button>
                  ) : (
                    <span className="shrink-0 text-[11px] text-zinc-400">정산 중</span>
                  );
                }}
              />
              {mine !== null && mine.length > 0 && (
                <Pagination
                  page={minePager.page}
                  pageCount={minePager.pageCount}
                  setPage={minePager.setPage}
                />
              )}
            </>
          ) : mineTab === "bids" ? (
            <MarketplaceMyBids
              rows={myBids}
              clockMs={clockMs}
              busy={busy}
              onOpenBid={(bid) =>
                void openBid({ ...bid, isMine: false, hasMyBid: true })
              }
            />
          ) : mineTab === "alerts" ? (
            <PriceAlertManagement
              alerts={priceAlerts}
              busy={busy}
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
          <MarketplaceAuctionSettings
            durationHours={durationHours}
            busy={busy}
            onDurationChange={setDurationHours}
            defaultHours={auctionHours}
            extensionWindowMinutes={bidExtensionWindowMinutes}
            extensionMinutes={bidExtensionMinutes}
          />
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
              onListEquip={listEquip}
              onOpenCard={openCardFor}
            />
          )}
        </div>
      )}

      {activeMarketToolGroup && (
        <MarketToolsDialog
          group={activeMarketToolGroup}
          existingAlert={priceAlerts?.find(
            (alert) =>
              alert.status === "active" &&
              `${alert.kind}:${alert.itemId}` === activeMarketToolGroup.key,
          )}
          busy={busy}
          onCreateAlert={createPriceAlert}
          onClose={() => setMarketToolGroup(null)}
        />
      )}

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
