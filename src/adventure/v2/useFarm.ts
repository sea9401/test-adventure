"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  FarmCrop,
  FarmCropId,
  FarmDeliveryRequest,
  FarmDeliveryResult,
  FarmHarvestResult,
  FarmPlotUpgradeResult,
  FarmRanchCollectResult,
  FarmRanchFeedResult,
  FarmRanchRebuildResult,
  FarmRanchUpgradeResult,
  FarmShopItem,
  FarmShopPurchaseResult,
  FarmSpecialDeliveryRequest,
  FarmSpecialDeliveryResult,
  FarmState,
  FarmWeeklyDeliveryRequest,
  FarmWeeklyDeliveryResult,
} from "./farm";
import { FARM_CROPS } from "./farm";
import {
  farmBatchOutcomeText,
  runFarmPlotBatch,
  type FarmBatchAction,
} from "./farmBatchActions";
import type { RanchAnimalId, RanchSlotId } from "./ranch";
import { useSystemToast } from "./RewardToastProvider";
import { LIFE_LEVEL_MIGRATION_NOTICE } from "./lifeLevelProgression";
import {
  farmEndgameShopView,
  type FarmEndgameShopPurchaseResult,
  type FarmEndgameShopView,
} from "./farmEndgameShop";

type FarmResponse = {
  ok: boolean;
  error?: string;
  now?: number;
  farm?: FarmState;
  farmJobId?: string | null;
  farmJobName?: string | null;
  learnedSkillIds?: string[];
  crops?: FarmCrop[];
  deliveries?: FarmDeliveryRequest[];
  specialDeliveries?: FarmSpecialDeliveryRequest[];
  weeklyDeliveries?: FarmWeeklyDeliveryRequest[];
  shopItems?: FarmShopItem[];
  result?: FarmHarvestResult;
  deliveryResult?: FarmDeliveryResult;
  specialDeliveryResult?: FarmSpecialDeliveryResult;
  weeklyDeliveryResult?: FarmWeeklyDeliveryResult;
  shopResult?: FarmShopPurchaseResult;
  plotUpgradeResult?: FarmPlotUpgradeResult;
  fertilizerBalance?: number;
  fertilizerResult?: { plotId: string; reducedMs: number };
  ranchFeedResult?: FarmRanchFeedResult;
  ranchCollectResult?: FarmRanchCollectResult;
  ranchRebuildResult?: FarmRanchRebuildResult;
  ranchUpgradeResult?: FarmRanchUpgradeResult;
  endgameShop?: FarmEndgameShopView;
  endgameShopResult?: FarmEndgameShopPurchaseResult;
  levelCurveMigrated?: boolean;
};

export type FarmClientState = {
  loading: boolean;
  busyPlotId: string | null;
  busyPlotAction: FarmBatchAction | null;
  busyDeliveryId: string | null;
  busySpecialDeliveryId: string | null;
  busyWeeklyDeliveryId: string | null;
  busyShopItemId: string | null;
  busyEndgameShopItemId: string | null;
  busyPlotUpgrade: boolean;
  busyRanchFeedSlotId: RanchSlotId | null;
  busyRanchCollect: boolean;
  busyRanchUpgradeSlotId: RanchSlotId | null;
  busyRanchRebuildSlotId: RanchSlotId | null;
  fertilizerBalance: number;
  error: string | null;
  notice: FarmNotice | null;
  now: number;
  farm: FarmState | null;
  farmJobId: string | null;
  farmJobName: string | null;
  learnedSkillIds: string[];
  crops: FarmCrop[];
  deliveries: FarmDeliveryRequest[];
  specialDeliveries: FarmSpecialDeliveryRequest[];
  weeklyDeliveries: FarmWeeklyDeliveryRequest[];
  shopItems: FarmShopItem[];
  endgameShop: FarmEndgameShopView | null;
  lastResult: FarmHarvestResult | null;
  lastDeliveryResult: FarmDeliveryResult | null;
  lastSpecialDeliveryResult: FarmSpecialDeliveryResult | null;
  lastWeeklyDeliveryResult: FarmWeeklyDeliveryResult | null;
  lastShopResult: FarmShopPurchaseResult | null;
  lastEndgameShopResult: FarmEndgameShopPurchaseResult | null;
  lastPlotUpgradeResult: FarmPlotUpgradeResult | null;
  clearNotice: () => void;
  refresh: () => Promise<void>;
  plant: (plotId: string, cropId: FarmCropId) => Promise<void>;
  harvest: (plotId: string) => Promise<void>;
  fertilize: (plotId: string) => Promise<void>;
  plantAll: (plotIds: readonly string[], cropId: FarmCropId) => Promise<void>;
  harvestAll: (plotIds: readonly string[]) => Promise<void>;
  fertilizeAll: (plotIds: readonly string[]) => Promise<void>;
  deliver: (requestId: string) => Promise<void>;
  deliverSpecial: (requestId: string) => Promise<void>;
  deliverWeekly: (requestId: string) => Promise<void>;
  buyShopItem: (itemId: string) => Promise<void>;
  buyEndgameShopItem: (itemId: string) => Promise<void>;
  buyPlotUpgrade: () => Promise<void>;
  feedRanchSlot: (slotId: RanchSlotId, amount: number) => Promise<void>;
  collectRanch: () => Promise<void>;
  buyRanchSlot: (slotId: RanchSlotId, animalId: RanchAnimalId) => Promise<void>;
  rebuildRanchSlot: (slotId: RanchSlotId, animalId: RanchAnimalId) => Promise<void>;
};

export type FarmNotice =
  | { id: number; kind: "error"; text: string }
  | { id: number; kind: "harvest"; result: FarmHarvestResult }
  | { id: number; kind: "delivery"; result: FarmDeliveryResult }
  | { id: number; kind: "specialDelivery"; result: FarmSpecialDeliveryResult }
  | { id: number; kind: "weeklyDelivery"; result: FarmWeeklyDeliveryResult }
  | { id: number; kind: "shop"; result: FarmShopPurchaseResult }
  | { id: number; kind: "endgameShop"; result: FarmEndgameShopPurchaseResult }
  | { id: number; kind: "plotUpgrade"; result: FarmPlotUpgradeResult }
  | { id: number; kind: "fertilizer"; reducedMs: number }
  | { id: number; kind: "batchPlant"; count: number; cropName: string }
  | { id: number; kind: "batchHarvest"; count: number }
  | { id: number; kind: "batchFertilizer"; count: number }
  | { id: number; kind: "ranchFeed"; result: FarmRanchFeedResult }
  | { id: number; kind: "ranchCollect"; result: FarmRanchCollectResult }
  | { id: number; kind: "ranchUpgrade"; result: FarmRanchUpgradeResult }
  | { id: number; kind: "ranchRebuild"; result: FarmRanchRebuildResult };

export function useFarm(): FarmClientState {
  const { notifySystem } = useSystemToast();
  const [loading, setLoading] = useState(true);
  const [busyPlotId, setBusyPlotId] = useState<string | null>(null);
  const [busyPlotAction, setBusyPlotAction] =
    useState<FarmBatchAction | null>(null);
  const [busyDeliveryId, setBusyDeliveryId] = useState<string | null>(null);
  const [busySpecialDeliveryId, setBusySpecialDeliveryId] = useState<
    string | null
  >(null);
  const [busyWeeklyDeliveryId, setBusyWeeklyDeliveryId] = useState<string | null>(
    null,
  );
  const [busyShopItemId, setBusyShopItemId] = useState<string | null>(null);
  const [busyEndgameShopItemId, setBusyEndgameShopItemId] = useState<string | null>(
    null,
  );
  const [busyPlotUpgrade, setBusyPlotUpgrade] = useState(false);
  const [busyRanchFeedSlotId, setBusyRanchFeedSlotId] =
    useState<RanchSlotId | null>(null);
  const [busyRanchCollect, setBusyRanchCollect] = useState(false);
  const [busyRanchUpgradeSlotId, setBusyRanchUpgradeSlotId] =
    useState<RanchSlotId | null>(null);
  const [busyRanchRebuildSlotId, setBusyRanchRebuildSlotId] =
    useState<RanchSlotId | null>(null);
  const [fertilizerBalance, setFertilizerBalance] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<FarmNotice | null>(null);
  const [now, setNow] = useState(0);
  const [farm, setFarm] = useState<FarmState | null>(null);
  const [farmJobId, setFarmJobId] = useState<string | null>(null);
  const [farmJobName, setFarmJobName] = useState<string | null>(null);
  const [learnedSkillIds, setLearnedSkillIds] = useState<string[]>([]);
  const [crops, setCrops] = useState<FarmCrop[]>([]);
  const [deliveries, setDeliveries] = useState<FarmDeliveryRequest[]>([]);
  const [specialDeliveries, setSpecialDeliveries] = useState<
    FarmSpecialDeliveryRequest[]
  >([]);
  const [weeklyDeliveries, setWeeklyDeliveries] = useState<
    FarmWeeklyDeliveryRequest[]
  >([]);
  const [shopItems, setShopItems] = useState<FarmShopItem[]>([]);
  const [endgameShop, setEndgameShop] = useState<FarmEndgameShopView | null>(null);
  const [lastResult, setLastResult] = useState<FarmHarvestResult | null>(null);
  const [lastDeliveryResult, setLastDeliveryResult] =
    useState<FarmDeliveryResult | null>(null);
  const [lastSpecialDeliveryResult, setLastSpecialDeliveryResult] =
    useState<FarmSpecialDeliveryResult | null>(null);
  const [lastWeeklyDeliveryResult, setLastWeeklyDeliveryResult] =
    useState<FarmWeeklyDeliveryResult | null>(null);
  const [lastShopResult, setLastShopResult] =
    useState<FarmShopPurchaseResult | null>(null);
  const [lastEndgameShopResult, setLastEndgameShopResult] =
    useState<FarmEndgameShopPurchaseResult | null>(null);
  const [lastPlotUpgradeResult, setLastPlotUpgradeResult] =
    useState<FarmPlotUpgradeResult | null>(null);

  const reportError = useCallback((e: unknown) => {
    const message = errorMessage(e);
    setError(message);
    setNotice({ id: Date.now(), kind: "error", text: message });
  }, []);

  const clearNotice = useCallback(() => setNotice(null), []);

  const apply = useCallback((
    data: FarmResponse,
    options: { suppressActionNotice?: boolean } = {},
  ) => {
    if (!data.ok || !data.farm || !data.crops || !data.deliveries) {
      throw new Error(data.error ?? "farm_failed");
    }
    setFarm(data.farm);
    if ("farmJobId" in data) setFarmJobId(data.farmJobId ?? null);
    if ("farmJobName" in data) setFarmJobName(data.farmJobName ?? null);
    if ("learnedSkillIds" in data) setLearnedSkillIds(data.learnedSkillIds ?? []);
    setCrops(data.crops);
    setDeliveries(data.deliveries);
    setSpecialDeliveries(data.specialDeliveries ?? []);
    setWeeklyDeliveries(data.weeklyDeliveries ?? []);
    setShopItems(data.shopItems ?? []);
    setEndgameShop((current) =>
      data.endgameShop ??
      (current ? farmEndgameShopView(data.farm!, current.ownedTitleIds) : null),
    );
    setNow(data.now ?? Date.now());
    if (data.levelCurveMigrated) {
      notifySystem(LIFE_LEVEL_MIGRATION_NOTICE, "info");
    }
    if ("fertilizerBalance" in data) setFertilizerBalance(Math.max(0, data.fertilizerBalance ?? 0));
    if (data.fertilizerResult && !options.suppressActionNotice) {
      setNotice({
        id: Date.now(),
        kind: "fertilizer",
        reducedMs: data.fertilizerResult.reducedMs,
      });
    }
    if (data.result) {
      setLastResult(data.result);
      if (!options.suppressActionNotice) {
        setNotice({ id: Date.now(), kind: "harvest", result: data.result });
      }
      window.dispatchEvent(new Event("v2notif:read"));
    }
    if (data.deliveryResult) {
      setLastDeliveryResult(data.deliveryResult);
      setNotice({
        id: Date.now(),
        kind: "delivery",
        result: data.deliveryResult,
      });
    }
    if (data.specialDeliveryResult) {
      setLastSpecialDeliveryResult(data.specialDeliveryResult);
      setNotice({
        id: Date.now(),
        kind: "specialDelivery",
        result: data.specialDeliveryResult,
      });
    }
    if (data.weeklyDeliveryResult) {
      setLastWeeklyDeliveryResult(data.weeklyDeliveryResult);
      setNotice({
        id: Date.now(),
        kind: "weeklyDelivery",
        result: data.weeklyDeliveryResult,
      });
    }
    if (data.shopResult) {
      setLastShopResult(data.shopResult);
      setNotice({ id: Date.now(), kind: "shop", result: data.shopResult });
    }
    if (data.endgameShopResult) {
      setLastEndgameShopResult(data.endgameShopResult);
      setNotice({
        id: Date.now(),
        kind: "endgameShop",
        result: data.endgameShopResult,
      });
    }
    if (data.plotUpgradeResult) {
      setLastPlotUpgradeResult(data.plotUpgradeResult);
      setNotice({
        id: Date.now(),
        kind: "plotUpgrade",
        result: data.plotUpgradeResult,
      });
    }
    if (data.ranchFeedResult) {
      setNotice({
        id: Date.now(),
        kind: "ranchFeed",
        result: data.ranchFeedResult,
      });
    }
    if (data.ranchCollectResult) {
      setNotice({
        id: Date.now(),
        kind: "ranchCollect",
        result: data.ranchCollectResult,
      });
    }
    if (data.ranchUpgradeResult) {
      setNotice({
        id: Date.now(),
        kind: "ranchUpgrade",
        result: data.ranchUpgradeResult,
      });
    }
    if (data.ranchRebuildResult) {
      setNotice({
        id: Date.now(),
        kind: "ranchRebuild",
        result: data.ranchRebuildResult,
      });
    }
  }, [notifySystem]);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/v2/farm", { cache: "no-store" });
      const data = (await res.json()) as FarmResponse;
      apply(data);
    } catch (e) {
      reportError(e);
    }
  }, [apply, reportError]);

  const plant = useCallback(
    async (plotId: string, cropId: FarmCropId) => {
      setBusyPlotId(plotId);
      setError(null);
      try {
        const res = await fetch("/api/v2/farm/plant", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ plotId, cropId }),
        });
        const data = (await res.json()) as FarmResponse;
        apply(data);
      } catch (e) {
        reportError(e);
      } finally {
        setBusyPlotId(null);
      }
    },
    [apply, reportError],
  );

  const harvest = useCallback(
    async (plotId: string) => {
      setBusyPlotId(plotId);
      setError(null);
      try {
        const res = await fetch("/api/v2/farm/harvest", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ plotId }),
        });
        const data = (await res.json()) as FarmResponse;
        apply(data);
      } catch (e) {
        reportError(e);
      } finally {
        setBusyPlotId(null);
      }
    },
    [apply, reportError],
  );

  const fertilize = useCallback(async (plotId: string) => {
    setBusyPlotId(plotId);
    setError(null);
    try {
      const res = await fetch("/api/v2/farm/fertilize", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ plotId }) });
      const data = await res.json() as FarmResponse;
      if (!res.ok) throw new Error(data.error ?? "fertilize_failed");
      apply(data);
    } catch (e) {
      reportError(e);
    } finally {
      setBusyPlotId(null);
    }
  }, [apply, reportError]);

  const runBatch = useCallback(
    async (
      action: FarmBatchAction,
      plotIds: readonly string[],
      cropId?: FarmCropId,
    ) => {
      if (plotIds.length === 0) return;
      setBusyPlotAction(action);
      setError(null);
      try {
        const result = await runFarmPlotBatch<FarmResponse>({
          action,
          plotIds,
          cropId,
          onSuccess: (data) =>
            apply(data, { suppressActionNotice: true }),
        });
        const cropName = cropId ? FARM_CROPS[cropId].name : undefined;
        const outcomeText = farmBatchOutcomeText(
          action,
          result.completed,
          result.error,
          cropName,
        );
        if (result.error) {
          const message =
            result.completed > 0
              ? outcomeText
              : errorMessage(new Error(outcomeText));
          setError(message);
          setNotice({ id: Date.now(), kind: "error", text: message });
        } else if (action === "plant") {
          setNotice({
            id: Date.now(),
            kind: "batchPlant",
            count: result.completed,
            cropName: cropName ?? "선택한 작물",
          });
        } else if (action === "harvest") {
          setNotice({
            id: Date.now(),
            kind: "batchHarvest",
            count: result.completed,
          });
        } else {
          setNotice({
            id: Date.now(),
            kind: "batchFertilizer",
            count: result.completed,
          });
        }
      } catch (batchError) {
        reportError(batchError);
      } finally {
        setBusyPlotAction(null);
      }
    },
    [apply, reportError],
  );

  const plantAll = useCallback(
    (plotIds: readonly string[], cropId: FarmCropId) =>
      runBatch("plant", plotIds, cropId),
    [runBatch],
  );
  const harvestAll = useCallback(
    (plotIds: readonly string[]) => runBatch("harvest", plotIds),
    [runBatch],
  );
  const fertilizeAll = useCallback(
    (plotIds: readonly string[]) => runBatch("fertilize", plotIds),
    [runBatch],
  );

  const deliver = useCallback(
    async (requestId: string) => {
      setBusyDeliveryId(requestId);
      setError(null);
      try {
        const res = await fetch("/api/v2/farm/deliver", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ requestId }),
        });
        const data = (await res.json()) as FarmResponse;
        apply(data);
      } catch (e) {
        reportError(e);
      } finally {
        setBusyDeliveryId(null);
      }
    },
    [apply, reportError],
  );

  const deliverSpecial = useCallback(
    async (requestId: string) => {
      setBusySpecialDeliveryId(requestId);
      setError(null);
      try {
        const res = await fetch("/api/v2/farm/special-deliver", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ requestId }),
        });
        const data = (await res.json()) as FarmResponse;
        apply(data);
      } catch (e) {
        reportError(e);
      } finally {
        setBusySpecialDeliveryId(null);
      }
    },
    [apply, reportError],
  );

  const deliverWeekly = useCallback(
    async (requestId: string) => {
      setBusyWeeklyDeliveryId(requestId);
      setError(null);
      try {
        const res = await fetch("/api/v2/farm/weekly", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ requestId }),
        });
        const data = (await res.json()) as FarmResponse;
        apply(data);
      } catch (e) {
        reportError(e);
      } finally {
        setBusyWeeklyDeliveryId(null);
      }
    },
    [apply, reportError],
  );

  const buyShopItem = useCallback(
    async (itemId: string) => {
      setBusyShopItemId(itemId);
      setError(null);
      try {
        const res = await fetch("/api/v2/farm/shop", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ itemId }),
        });
        const data = (await res.json()) as FarmResponse;
        apply(data);
      } catch (e) {
        reportError(e);
      } finally {
        setBusyShopItemId(null);
      }
    },
    [apply, reportError],
  );

  const buyEndgameShopItem = useCallback(
    async (itemId: string) => {
      setBusyEndgameShopItemId(itemId);
      setError(null);
      try {
        const res = await fetch("/api/v2/farm/endgame-shop", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ itemId }),
        });
        apply((await res.json()) as FarmResponse);
      } catch (e) {
        reportError(e);
      } finally {
        setBusyEndgameShopItemId(null);
      }
    },
    [apply, reportError],
  );

  const buyPlotUpgrade = useCallback(async () => {
    setBusyPlotUpgrade(true);
    setError(null);
    try {
      const res = await fetch("/api/v2/farm/plot-upgrade", {
        method: "POST",
      });
      const data = (await res.json()) as FarmResponse;
      apply(data);
    } catch (e) {
      reportError(e);
    } finally {
      setBusyPlotUpgrade(false);
    }
  }, [apply, reportError]);

  const feedRanchSlot = useCallback(
    async (slotId: RanchSlotId, amount: number) => {
      setBusyRanchFeedSlotId(slotId);
      setError(null);
      try {
        const res = await fetch("/api/v2/farm/ranch/feed", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ slotId, amount }),
        });
        const data = (await res.json()) as FarmResponse;
        apply(data);
      } catch (e) {
        reportError(e);
      } finally {
        setBusyRanchFeedSlotId(null);
      }
    },
    [apply, reportError],
  );

  const collectRanch = useCallback(async () => {
    setBusyRanchCollect(true);
    setError(null);
    try {
      const res = await fetch("/api/v2/farm/ranch/collect", {
        method: "POST",
      });
      const data = (await res.json()) as FarmResponse;
      apply(data);
    } catch (e) {
      reportError(e);
    } finally {
      setBusyRanchCollect(false);
    }
  }, [apply, reportError]);

  const buyRanchSlot = useCallback(
    async (slotId: RanchSlotId, animalId: RanchAnimalId) => {
      setBusyRanchUpgradeSlotId(slotId);
      setError(null);
      try {
        const res = await fetch("/api/v2/farm/ranch/upgrade", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ slotId, animalId }),
        });
        const data = (await res.json()) as FarmResponse;
        apply(data);
      } catch (e) {
        reportError(e);
      } finally {
        setBusyRanchUpgradeSlotId(null);
      }
    },
    [apply, reportError],
  );

  const rebuildRanchSlot = useCallback(
    async (slotId: RanchSlotId, animalId: RanchAnimalId) => {
      setBusyRanchRebuildSlotId(slotId);
      setError(null);
      try {
        const res = await fetch("/api/v2/farm/ranch/rebuild", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ slotId, animalId }),
        });
        const data = (await res.json()) as FarmResponse;
        apply(data);
      } catch (e) {
        reportError(e);
      } finally {
        setBusyRanchRebuildSlotId(null);
      }
    },
    [apply, reportError],
  );

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- farm state is loaded from the server on mount.
    refresh()
      .catch((e) => {
        if (!cancelled) reportError(e);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refresh, reportError]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  return {
    loading,
    busyPlotId,
    busyPlotAction,
    busyDeliveryId,
    busySpecialDeliveryId,
    busyWeeklyDeliveryId,
    busyShopItemId,
    busyEndgameShopItemId,
    busyPlotUpgrade,
    busyRanchFeedSlotId,
    busyRanchCollect,
    busyRanchUpgradeSlotId,
    busyRanchRebuildSlotId,
    fertilizerBalance,
    error,
    notice,
    now,
    farm,
    farmJobId,
    farmJobName,
    learnedSkillIds,
    crops,
    deliveries,
    specialDeliveries,
    weeklyDeliveries,
    shopItems,
    endgameShop,
    lastResult,
    lastDeliveryResult,
    lastSpecialDeliveryResult,
    lastWeeklyDeliveryResult,
    lastShopResult,
    lastEndgameShopResult,
    lastPlotUpgradeResult,
    clearNotice,
    refresh,
    plant,
    harvest,
    fertilize,
    plantAll,
    harvestAll,
    fertilizeAll,
    deliver,
    deliverSpecial,
    deliverWeekly,
    buyShopItem,
    buyEndgameShopItem,
    buyPlotUpgrade,
    feedRanchSlot,
    collectRanch,
    buyRanchSlot,
    rebuildRanchSlot,
  };
}

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "request_failed";
  return (
    {
      no_seed: "선택한 씨앗이 부족합니다.",
      not_enough_items: "납품에 필요한 작물이 부족합니다.",
      not_enough_reputation: "사용 가능한 농장 증표가 부족합니다.",
      delivery_already_claimed: "이미 완료한 납품입니다.",
      delivery_daily_limit: "오늘 가능한 납품 횟수를 모두 사용했습니다.",
      weekly_delivery_already_claimed: "이미 완료한 주간 납품입니다.",
      plot_upgrade_not_available: "더 늘릴 수 있는 밭이 없습니다.",
      crop_locked: "해당 작물을 심으려면 필요한 농부 계열 패시브를 먼저 배워야 합니다.",
      shop_item_locked: "해당 씨앗 상자를 구매하려면 필요한 농부 계열 패시브를 먼저 배워야 합니다.",
      not_ready: "아직 수확할 수 없습니다.",
      plot_occupied: "이미 작물이 심어진 밭입니다.",
      plot_empty: "수확할 작물이 없습니다.",
      no_fertilizer: "보유한 유기질 거름이 없습니다.",
      already_fertilized: "이번 파종에는 이미 거름을 사용했습니다.",
      already_ready: "이미 수확할 수 있는 작물에는 거름을 사용할 수 없습니다.",
      ranch_locked: "씨앗 선별을 배우면 목장을 이용할 수 있습니다.",
      slot_locked: "아직 열리지 않았거나 앞 부지를 먼저 열어야 합니다.",
      feed_capacity: "이 축사에는 사료가 이미 가득 차 있습니다.",
      not_enough_feed: "보유한 배합 사료가 부족합니다.",
      nothing_to_collect: "아직 수확할 축산물이 없습니다.",
      level_required: "농사 레벨이 부족합니다.",
      already_unlocked: "이미 열린 축사입니다.",
      slot_not_found: "목장 부지 정보를 찾을 수 없습니다.",
      animal_not_found: "선택한 축사 종류를 찾을 수 없습니다.",
      animal_level_required: "선택한 축사를 건설하려면 농사 레벨이 더 필요합니다.",
      slot_not_empty: "사료와 진행 중인 생산물, 수확 대기 물품을 모두 비워야 재건축할 수 있습니다.",
      same_animal: "현재와 다른 축사 종류를 선택해 주세요.",
      bad_quantity: "넣을 사료 수량을 확인해 주세요.",
      endgame_shop_locked: "밭과 유료 축사를 모두 열면 농장주의 교환소를 이용할 수 있습니다.",
      already_owned: "이미 보유한 칭호입니다.",
      shop_item_not_found: "교환 상품 정보를 찾을 수 없습니다.",
    }[message] ?? "요청에 실패했습니다."
  );
}
