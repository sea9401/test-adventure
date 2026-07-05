"use client";

import { useCallback } from "react";
import { useSingleFlightGuard } from "@/lib/useSingleFlight";
import { FRAGMENTS_PER_MAP } from "./treasureFragments";
import type {
  DigOutcome,
  OpenOutcome,
  TreasureFragmentStatus,
  TreasureHandlers,
} from "./TreasureDigView";
import type {
  TreasureAction,
  TreasureSiteOptionId,
  TreasureSitePublic,
} from "./treasureDig";

// 실게임용 open/dig — /api/v2/treasure/* 권위 라우트 래퍼. TreasureDigView 에 주입한다.
export function useTreasure(): TreasureHandlers {
  const beginOpen = useSingleFlightGuard();
  const beginDig = useSingleFlightGuard();

  const open = useCallback(
    async (siteOptionId: TreasureSiteOptionId): Promise<OpenOutcome> => {
      const release = beginOpen();
      if (!release) return { ok: false, reason: "error" };
      try {
        const res = await fetch("/api/v2/treasure/open", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ siteOptionId }),
        });
        const j = await res.json().catch(() => null);
        if (res.ok && j?.ok) {
          return {
            ok: true,
            resumed: Boolean(j.resumed),
            site: j.site as TreasureSitePublic,
            fragments: typeof j.fragments === "number" ? j.fragments : undefined,
            needed: typeof j.needed === "number" ? j.needed : undefined,
            baseNeeded: typeof j.baseNeeded === "number" ? j.baseNeeded : undefined,
            mapWorkshopLevel:
              typeof j.mapWorkshopLevel === "number" ? j.mapWorkshopLevel : undefined,
            discountPct: typeof j.discountPct === "number" ? j.discountPct : undefined,
          };
        }
        if (j?.error === "not_enough_fragments") {
          return {
            ok: false,
            reason: "not_enough_fragments",
            fragments: Number(j.fragments ?? 0),
            needed: typeof j.needed === "number" ? j.needed : undefined,
            baseNeeded: typeof j.baseNeeded === "number" ? j.baseNeeded : undefined,
            mapWorkshopLevel:
              typeof j.mapWorkshopLevel === "number" ? j.mapWorkshopLevel : undefined,
            discountPct: typeof j.discountPct === "number" ? j.discountPct : undefined,
          };
        }
        return { ok: false, reason: "error" };
      } finally {
        release();
      }
    },
    [beginOpen],
  );

  const loadFragments = useCallback(async (): Promise<TreasureFragmentStatus | null> => {
    try {
      const res = await fetch("/api/v2/treasure/collection");
      const j = await res.json().catch(() => null);
      if (res.ok && j?.ok && typeof j.fragments === "number") {
        return {
          fragments: j.fragments,
          needed: typeof j.needed === "number" ? j.needed : FRAGMENTS_PER_MAP,
          baseNeeded:
            typeof j.baseNeeded === "number" ? j.baseNeeded : FRAGMENTS_PER_MAP,
          mapWorkshopLevel:
            typeof j.mapWorkshopLevel === "number" ? j.mapWorkshopLevel : 0,
          discountPct: typeof j.discountPct === "number" ? j.discountPct : 0,
        };
      }
    } catch {}
    return null;
  }, []);

  const loadSession = useCallback(async (): Promise<TreasureSitePublic | null> => {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 8000);
    try {
      const res = await fetch("/api/v2/treasure/session", { signal: ac.signal });
      const j = await res.json().catch(() => null);
      if (res.ok && j?.ok && j.site) return j.site as TreasureSitePublic;
    } catch {
      // 타임아웃/네트워크 — 복원 실패로 간주(시작 화면). 세션은 서버에 안전.
    } finally {
      clearTimeout(timer);
    }
    return null;
  }, []);

  const dig = useCallback(
    async (siteId: string, action: TreasureAction): Promise<DigOutcome> => {
      const release = beginDig();
      if (!release) return { outcome: "error" };
      try {
        const res = await fetch("/api/v2/treasure/dig", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ siteId, action }),
        });
        const j = await res.json().catch(() => null);
        if (!j?.ok) return { outcome: "error" };
        switch (j.outcome) {
          case "hit":
            return {
              outcome: "hit",
              antique: j.antique,
              grantedTitles: Array.isArray(j.grantedTitles) ? j.grantedTitles : [],
              codexCount: Number(j.codexCount ?? 0),
            };
          case "progress":
            return {
              outcome: "progress",
              message: String(j.message ?? ""),
              site: j.site as TreasureSitePublic,
            };
          case "exhausted":
            return {
              outcome: "exhausted",
              message: String(j.message ?? ""),
              site: j.site as TreasureSitePublic,
              missed: j.missed,
            };
          case "invalid":
            return { outcome: "invalid", site: j.site as TreasureSitePublic };
          default:
            return { outcome: "error" };
        }
      } finally {
        release();
      }
    },
    [beginDig],
  );

  return { open, dig, loadFragments, loadSession };
}
