"use client";

import { useCallback, useEffect, useState } from "react";
import type { DangerousFishingState } from "./dangerousFishingState";
import type { DangerousFishingExchangeEntry } from "./dangerousFishingExchange";
import type { BuyResult } from "./useFishingShop";

export type DangerousFishingExchangeEntryView =
  DangerousFishingExchangeEntry & {
    alreadyOwned: boolean;
    maxBatches: number;
  };

export type DangerousFishingExchangeViewModel = {
  ok: true;
  unlocked: boolean;
  requiredLevel: number;
  fishingLevel: number;
  materials: Record<string, number>;
  fishingCoins: number;
  state: Pick<DangerousFishingState, "ownedGear" | "baitCounts">;
  ownedTitleIds: string[];
  ownedCosmeticIds: string[];
  entries: DangerousFishingExchangeEntryView[];
};

export type DangerousFishingExchangeRequest = {
  operationId: string;
  entryId: string;
  batches: number;
  selectedMaterials?: Record<string, number>;
};

export type DangerousFishingExchangeResult = BuyResult & {
  fishingCoins?: number;
  alreadyProcessed?: boolean;
};

export function dangerousFishingExchangeMessage(
  ok: boolean,
  error?: string,
  alreadyProcessed = false,
): string {
  if (ok) {
    return alreadyProcessed
      ? "이미 처리된 교환을 확인했다. 추가 차감은 없었다."
      : "위험 해역 교환을 완료했다.";
  }
  if (error === "fishing_level_locked") return "낚시 15레벨부터 교환할 수 있다.";
  if (error === "insufficient_materials") return "교환에 필요한 재료가 부족하다.";
  if (error === "insufficient_coins") return "교환에 필요한 낚시 코인이 부족하다.";
  if (error === "already_owned") return "이미 보유한 보상이다.";
  if (error === "invalid_material_selection") return "납품할 어획물 구성이 올바르지 않다.";
  if (error === "invalid_quantity") return "교환 횟수를 다시 확인해 주세요.";
  if (error === "invalid_entry" || error === "bad_request") return "교환할 수 없는 항목이다.";
  return "교환 처리 중 문제가 생겼다. 같은 확인창에서 다시 시도해 주세요.";
}

export function useDangerousFishingExchange() {
  const [model, setModel] =
    useState<DangerousFishingExchangeViewModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exchanging, setExchanging] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/v2/dangerous-fishing/exchange");
      const json = (await response.json().catch(() => null)) as
        | DangerousFishingExchangeViewModel
        | null;
      if (!response.ok || !json?.ok) throw new Error("load_failed");
      setModel(json);
      setError(null);
      return true;
    } catch {
      setError("위험 해역 교환 목록을 불러오지 못했다.");
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  const exchange = useCallback(
    async (
      request: DangerousFishingExchangeRequest,
    ): Promise<DangerousFishingExchangeResult> => {
      if (exchanging) {
        return { ok: false, message: "다른 교환을 처리하고 있다." };
      }
      setExchanging(request.entryId);
      try {
        const response = await fetch("/api/v2/dangerous-fishing/exchange", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(request),
        });
        const json = (await response.json().catch(() => null)) as
          | (Partial<DangerousFishingExchangeViewModel> & {
              ok?: boolean;
              error?: string;
              alreadyProcessed?: boolean;
            })
          | null;
        if (response.ok && json?.ok === true) {
          const next = json as DangerousFishingExchangeViewModel & {
            alreadyProcessed?: boolean;
          };
          setModel(next);
          setError(null);
          return {
            ok: true,
            message: dangerousFishingExchangeMessage(
              true,
              undefined,
              next.alreadyProcessed,
            ),
            fishingCoins: next.fishingCoins,
            alreadyProcessed: next.alreadyProcessed,
          };
        }
        const code = typeof json?.error === "string" ? json.error : "network";
        return {
          ok: false,
          message: dangerousFishingExchangeMessage(false, code),
        };
      } catch {
        return {
          ok: false,
          message: dangerousFishingExchangeMessage(false, "network"),
        };
      } finally {
        setExchanging(null);
      }
    },
    [exchanging],
  );

  return { model, loading, error, exchanging, refresh, exchange };
}
