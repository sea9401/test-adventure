"use client";

import { useCallback, useRef } from "react";
import { FRAGMENTS_PER_MAP } from "./treasureFragments";
import type {
  DigOutcome,
  OpenOutcome,
  TreasureFragmentStatus,
  TreasureHandlers,
} from "./TreasureDigView";
import type { TreasureSitePublic } from "./treasureDig";

// 실게임용 open/dig — /api/v2/treasure/* 권위 라우트 래퍼. TreasureDigView 에 주입한다.
export function useTreasure(): TreasureHandlers {
  const openBusyRef = useRef(false);
  const digBusyRef = useRef(false);

  const open = useCallback(async (): Promise<OpenOutcome> => {
    if (openBusyRef.current) return { ok: false, reason: "error" };
    openBusyRef.current = true;
    try {
      const res = await fetch("/api/v2/treasure/open", { method: "POST" });
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
      openBusyRef.current = false;
    }
  }, []);

  // 보유 지도 조각 수 — 발굴 화면 진입 시 표시용. collection 라우트가 fragments 를 함께 반환한다.
  const loadFragments = useCallback(async (): Promise<TreasureFragmentStatus | null> => {
    try {
      const res = await fetch("/api/v2/treasure/collection");
      const j = await res.json().catch(() => null);
      if (res.ok && j?.ok && typeof j.fragments === "number") {
        return {
          fragments: j.fragments,
          needed:
            typeof j.needed === "number" ? j.needed : FRAGMENTS_PER_MAP,
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

  // 진행 중 발굴 세션 복원 — 마운트 시 호출. 조각 소비 없는 읽기 전용(open 의 resume 과 동일 뷰).
  //   다른 화면을 다녀와도 발굴이 사라지지 않게 격자를 그대로 이어준다.
  //   🔑 타임아웃(AbortController) 필수 — 멈춘 fetch 가 영영 안 끝나면 호출측 restoring 가드가
  //      true 로 굳어 화면이 빈 채로 잠긴다. 8초 내 항상 settle(실패 시 null=시작 화면 폴백).
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
    async (siteId: string, cell: number): Promise<DigOutcome> => {
      if (digBusyRef.current) return { outcome: "error" };
      digBusyRef.current = true;
      try {
        const res = await fetch("/api/v2/treasure/dig", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ siteId, cell }),
        });
        const j = await res.json().catch(() => null);
        if (!j?.ok) return { outcome: "error" };
        switch (j.outcome) {
          case "hit":
            return {
              outcome: "hit",
              clue: "hot",
              antique: j.antique,
              codexCount: Number(j.codexCount ?? 0),
            };
          case "miss":
            return {
              outcome: "miss",
              clue: j.clue,
              site: j.site as TreasureSitePublic,
            };
          case "exhausted":
            return {
              outcome: "exhausted",
              clue: j.clue,
              treasureCell: Number(j.treasureCell),
              missed: j.missed,
            };
          case "invalid":
            return { outcome: "invalid", site: j.site as TreasureSitePublic };
          default:
            return { outcome: "error" };
        }
      } finally {
        digBusyRef.current = false;
      }
    },
    [],
  );

  return { open, dig, loadFragments, loadSession };
}
