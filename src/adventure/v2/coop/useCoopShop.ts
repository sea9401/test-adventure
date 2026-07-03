"use client";

import { useCallback, useEffect, useState } from "react";
import { useGameState } from "@/adventure/v2/GameStateProvider";

export type CoopShopLimit = {
  scope: "daily" | "weekly";
  used: number;
  limit: number;
};

export type CoopShopState = {
  materials: Record<string, number>;
  ownedTitleIds: string[];
  staminaPotions: number;
  limits: Record<string, CoopShopLimit>;
};

export type CoopShopBuyResult = { ok: boolean; message: string };

function numberRecord(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (raw && typeof raw === "object") {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      const n = Math.floor(Number(v));
      out[k] = Number.isFinite(n) && n > 0 ? n : 0;
    }
  }
  return out;
}

function titleIds(raw: unknown): string[] {
  return Array.isArray(raw)
    ? raw.filter((id): id is string => typeof id === "string")
    : [];
}

function limitsOf(raw: unknown): Record<string, CoopShopLimit> {
  const out: Record<string, CoopShopLimit> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [itemId, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== "object") continue;
    const limit = value as Record<string, unknown>;
    const scope = limit.scope === "daily" ? "daily" : "weekly";
    const used = Math.max(0, Math.floor(Number(limit.used) || 0));
    const count = Math.max(0, Math.floor(Number(limit.limit) || 0));
    if (count > 0) out[itemId] = { scope, used, limit: count };
  }
  return out;
}

function stateFromResponse(j: Record<string, unknown>): CoopShopState {
  return {
    materials: numberRecord(j.materials),
    ownedTitleIds: titleIds(j.ownedTitleIds),
    staminaPotions:
      typeof j.staminaPotions === "number" ? Math.max(0, j.staminaPotions) : 0,
    limits: limitsOf(j.limits),
  };
}

export function useCoopShop() {
  const { applyResourcePatch } = useGameState();
  const [state, setState] = useState<CoopShopState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [buying, setBuying] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/v2/coop/shop");
      const j = (await res.json().catch(() => null)) as Record<
        string,
        unknown
      > | null;
      if (res.ok && j?.ok) {
        if (typeof j.staminaPotions === "number") {
          applyResourcePatch({
            staminaPotions: Math.max(0, j.staminaPotions),
          });
        }
        setState(stateFromResponse(j));
        setError(null);
      } else {
        setError("교환소를 불러오지 못했다.");
      }
    } catch {
      setError("교환소를 불러오지 못했다.");
    } finally {
      setLoading(false);
    }
  }, [applyResourcePatch]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- refresh 는 async(fetch 후 set)
    void refresh();
  }, [refresh]);

  const buy = useCallback(
    async (itemId: string): Promise<CoopShopBuyResult> => {
      setBuying(itemId);
      try {
        const res = await fetch("/api/v2/coop/shop", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ itemId }),
        });
        const j = (await res.json().catch(() => null)) as Record<
          string,
          unknown
        > | null;
        if (res.ok && j?.ok) {
          if (typeof j.staminaPotions === "number") {
            applyResourcePatch({
              staminaPotions: Math.max(0, j.staminaPotions),
            });
          }
          setState((prev) =>
            prev
              ? {
                  ...prev,
                  materials: numberRecord(j.materials),
                  limits: limitsOf(j.limits),
                  staminaPotions:
                    typeof j.staminaPotions === "number"
                      ? Math.max(0, j.staminaPotions)
                      : prev.staminaPotions,
                  ownedTitleIds:
                    typeof j.titleId === "string"
                      ? [...new Set([...prev.ownedTitleIds, j.titleId])]
                      : prev.ownedTitleIds,
                }
              : prev,
          );
          return { ok: true, message: "교환했다." };
        }
        if (j?.materials) {
          setState((prev) =>
            prev ? { ...prev, materials: numberRecord(j.materials) } : prev,
          );
        }
        if (j?.limits) {
          setState((prev) =>
            prev ? { ...prev, limits: limitsOf(j.limits) } : prev,
          );
        }
        if (j?.error === "insufficient_materials") {
          return { ok: false, message: "재료가 부족하다." };
        }
        if (j?.error === "limit_reached") {
          return { ok: false, message: "교환 제한에 도달했다." };
        }
        if (j?.error === "already_owned") {
          return { ok: false, message: "이미 보유한 칭호다." };
        }
        return { ok: false, message: "교환하지 못했다." };
      } catch {
        return { ok: false, message: "교환 처리 중 문제가 생겼다." };
      } finally {
        setBuying(null);
      }
    },
    [applyResourcePatch],
  );

  return { state, loading, error, buying, refresh, buy };
}
