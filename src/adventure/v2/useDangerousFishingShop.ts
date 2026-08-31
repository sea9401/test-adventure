"use client";

import { useCallback, useEffect, useState } from "react";
import type { DangerousGearKind } from "@/adventure/data/v2/dangerousFishing";
import type { BuyResult } from "./useFishingShop";
import type { DangerousFishingViewModel } from "./useDangerousFishing";

export type DangerousFishingShopResult = BuyResult & {
  fishingCoins?: number;
};

type ShopKind = DangerousGearKind | "bait";
type ShopAction = "buy" | "equip";

export function dangerousFishingShopMessage(
  ok: boolean,
  kind: ShopKind,
  action: ShopAction,
  error?: string,
): string {
  if (ok) {
    if (kind === "bait") return "특수 미끼를 보충했다.";
    return action === "equip" ? "위험 해역 장비를 장착했다." : "위험 해역 장비를 구매했다.";
  }
  if (error === "insufficient_coins") return "낚시 코인이 부족하다.";
  if (error === "not_owned") return "아직 보유하지 않은 장비다.";
  if (error === "encounter_active") return "진행 중인 조우를 먼저 마쳐야 한다.";
  if (error === "invalid_item" || error === "bad_request") return "구매할 수 없는 항목이다.";
  return "구매 처리 중 문제가 생겼다.";
}

export function useDangerousFishingShop() {
  const [model, setModel] = useState<DangerousFishingViewModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [buying, setBuying] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/v2/dangerous-fishing/status");
      const json = (await response.json().catch(() => null)) as DangerousFishingViewModel | null;
      if (!response.ok || !json?.ok) throw new Error("load_failed");
      setModel(json);
      setError(null);
      return true;
    } catch {
      setError("위험 해역 상점을 불러오지 못했다.");
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  const shop = useCallback(
    async (kind: ShopKind, id: string, action: ShopAction): Promise<DangerousFishingShopResult> => {
      if (buying) return { ok: false, message: "다른 구매를 처리하고 있다." };
      setBuying(`${kind}:${id}`);
      try {
        const response = await fetch("/api/v2/dangerous-fishing/shop", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ kind, id, action }),
        });
        const json = (await response.json().catch(() => null)) as Record<string, unknown> | null;
        if (response.ok && json?.ok === true) {
          const fishingCoins = typeof json.fishingCoins === "number" ? json.fishingCoins : undefined;
          setModel((current) =>
            current
              ? {
                  ...current,
                  ...(json.state && typeof json.state === "object"
                    ? { state: json.state as DangerousFishingViewModel["state"] }
                    : {}),
                  ...(fishingCoins !== undefined ? { fishingCoins } : {}),
                }
              : current,
          );
          return {
            ok: true,
            message: dangerousFishingShopMessage(true, kind, action),
            ...(fishingCoins !== undefined ? { fishingCoins } : {}),
          };
        }
        const code = typeof json?.error === "string" ? json.error : "network";
        return { ok: false, message: dangerousFishingShopMessage(false, kind, action, code) };
      } catch {
        return { ok: false, message: dangerousFishingShopMessage(false, kind, action, "network") };
      } finally {
        setBuying(null);
      }
    },
    [buying],
  );

  return { model, loading, error, buying, refresh, shop };
}
