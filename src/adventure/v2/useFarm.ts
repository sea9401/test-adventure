"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  FarmCrop,
  FarmCropId,
  FarmDeliveryRequest,
  FarmDeliveryResult,
  FarmHarvestResult,
  FarmShopItem,
  FarmShopPurchaseResult,
  FarmSpecialDeliveryRequest,
  FarmSpecialDeliveryResult,
  FarmState,
  FarmWeeklyDeliveryRequest,
  FarmWeeklyDeliveryResult,
} from "./farm";

type FarmResponse = {
  ok: boolean;
  error?: string;
  now?: number;
  farm?: FarmState;
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
};

export type FarmClientState = {
  loading: boolean;
  busyPlotId: string | null;
  busyDeliveryId: string | null;
  busySpecialDeliveryId: string | null;
  busyWeeklyDeliveryId: string | null;
  busyShopItemId: string | null;
  error: string | null;
  now: number;
  farm: FarmState | null;
  crops: FarmCrop[];
  deliveries: FarmDeliveryRequest[];
  specialDeliveries: FarmSpecialDeliveryRequest[];
  weeklyDeliveries: FarmWeeklyDeliveryRequest[];
  shopItems: FarmShopItem[];
  lastResult: FarmHarvestResult | null;
  lastDeliveryResult: FarmDeliveryResult | null;
  lastSpecialDeliveryResult: FarmSpecialDeliveryResult | null;
  lastWeeklyDeliveryResult: FarmWeeklyDeliveryResult | null;
  lastShopResult: FarmShopPurchaseResult | null;
  refresh: () => Promise<void>;
  plant: (plotId: string, cropId: FarmCropId) => Promise<void>;
  harvest: (plotId: string) => Promise<void>;
  deliver: (requestId: string) => Promise<void>;
  deliverSpecial: (requestId: string) => Promise<void>;
  deliverWeekly: (requestId: string) => Promise<void>;
  buyShopItem: (itemId: string) => Promise<void>;
};

export function useFarm(): FarmClientState {
  const [loading, setLoading] = useState(true);
  const [busyPlotId, setBusyPlotId] = useState<string | null>(null);
  const [busyDeliveryId, setBusyDeliveryId] = useState<string | null>(null);
  const [busySpecialDeliveryId, setBusySpecialDeliveryId] = useState<
    string | null
  >(null);
  const [busyWeeklyDeliveryId, setBusyWeeklyDeliveryId] = useState<string | null>(
    null,
  );
  const [busyShopItemId, setBusyShopItemId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const [farm, setFarm] = useState<FarmState | null>(null);
  const [crops, setCrops] = useState<FarmCrop[]>([]);
  const [deliveries, setDeliveries] = useState<FarmDeliveryRequest[]>([]);
  const [specialDeliveries, setSpecialDeliveries] = useState<
    FarmSpecialDeliveryRequest[]
  >([]);
  const [weeklyDeliveries, setWeeklyDeliveries] = useState<
    FarmWeeklyDeliveryRequest[]
  >([]);
  const [shopItems, setShopItems] = useState<FarmShopItem[]>([]);
  const [lastResult, setLastResult] = useState<FarmHarvestResult | null>(null);
  const [lastDeliveryResult, setLastDeliveryResult] =
    useState<FarmDeliveryResult | null>(null);
  const [lastSpecialDeliveryResult, setLastSpecialDeliveryResult] =
    useState<FarmSpecialDeliveryResult | null>(null);
  const [lastWeeklyDeliveryResult, setLastWeeklyDeliveryResult] =
    useState<FarmWeeklyDeliveryResult | null>(null);
  const [lastShopResult, setLastShopResult] =
    useState<FarmShopPurchaseResult | null>(null);

  const apply = useCallback((data: FarmResponse) => {
    if (!data.ok || !data.farm || !data.crops || !data.deliveries) {
      throw new Error(data.error ?? "farm_failed");
    }
    setFarm(data.farm);
    setCrops(data.crops);
    setDeliveries(data.deliveries);
    setSpecialDeliveries(data.specialDeliveries ?? []);
    setWeeklyDeliveries(data.weeklyDeliveries ?? []);
    setShopItems(data.shopItems ?? []);
    setNow(data.now ?? Date.now());
    if (data.result) setLastResult(data.result);
    if (data.deliveryResult) setLastDeliveryResult(data.deliveryResult);
    if (data.specialDeliveryResult) {
      setLastSpecialDeliveryResult(data.specialDeliveryResult);
    }
    if (data.weeklyDeliveryResult) setLastWeeklyDeliveryResult(data.weeklyDeliveryResult);
    if (data.shopResult) setLastShopResult(data.shopResult);
  }, []);

  const refresh = useCallback(async () => {
    setError(null);
    const res = await fetch("/api/v2/farm", { cache: "no-store" });
    const data = (await res.json()) as FarmResponse;
    apply(data);
  }, [apply]);

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
        setError(errorMessage(e));
      } finally {
        setBusyPlotId(null);
      }
    },
    [apply],
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
        setError(errorMessage(e));
      } finally {
        setBusyPlotId(null);
      }
    },
    [apply],
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
        setError(errorMessage(e));
      } finally {
        setBusyDeliveryId(null);
      }
    },
    [apply],
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
        setError(errorMessage(e));
      } finally {
        setBusySpecialDeliveryId(null);
      }
    },
    [apply],
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
        setError(errorMessage(e));
      } finally {
        setBusyWeeklyDeliveryId(null);
      }
    },
    [apply],
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
        setError(errorMessage(e));
      } finally {
        setBusyShopItemId(null);
      }
    },
    [apply],
  );

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- farm state is loaded from the server on mount.
    refresh()
      .catch((e) => {
        if (!cancelled) setError(errorMessage(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  return {
    loading,
    busyPlotId,
    busyDeliveryId,
    busySpecialDeliveryId,
    busyWeeklyDeliveryId,
    busyShopItemId,
    error,
    now,
    farm,
    crops,
    deliveries,
    specialDeliveries,
    weeklyDeliveries,
    shopItems,
    lastResult,
    lastDeliveryResult,
    lastSpecialDeliveryResult,
    lastWeeklyDeliveryResult,
    lastShopResult,
    refresh,
    plant,
    harvest,
    deliver,
    deliverSpecial,
    deliverWeekly,
    buyShopItem,
  };
}

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "request_failed";
  return (
    {
      no_seed: "선택한 씨앗이 부족합니다.",
      not_enough_items: "납품에 필요한 작물이 부족합니다.",
      not_enough_reputation: "사용 가능한 농장 명성이 부족합니다.",
      delivery_already_claimed: "이미 완료한 납품입니다.",
      delivery_daily_limit: "오늘 가능한 납품 횟수를 모두 사용했습니다.",
      weekly_delivery_already_claimed: "이미 완료한 주간 납품입니다.",
      not_ready: "아직 수확할 수 없습니다.",
      plot_occupied: "이미 작물이 심어진 밭입니다.",
      plot_empty: "수확할 작물이 없습니다.",
    }[message] ?? "요청에 실패했습니다."
  );
}
