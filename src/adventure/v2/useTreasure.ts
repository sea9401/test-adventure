"use client";

import { useCallback } from "react";
import type {
  DigOutcome,
  OpenOutcome,
  TreasureHandlers,
} from "./TreasureDigView";
import type { TreasureSitePublic } from "./treasureDig";

// 실게임용 open/dig — /api/v2/treasure/* 권위 라우트 래퍼. TreasureDigView 에 주입한다.
export function useTreasure(): TreasureHandlers {
  const open = useCallback(async (): Promise<OpenOutcome> => {
    const res = await fetch("/api/v2/treasure/open", { method: "POST" });
    const j = await res.json().catch(() => null);
    if (res.ok && j?.ok) {
      return {
        ok: true,
        resumed: Boolean(j.resumed),
        site: j.site as TreasureSitePublic,
        fragments: typeof j.fragments === "number" ? j.fragments : undefined,
      };
    }
    if (j?.error === "not_enough_fragments") {
      return {
        ok: false,
        reason: "not_enough_fragments",
        fragments: Number(j.fragments ?? 0),
      };
    }
    return { ok: false, reason: "error" };
  }, []);

  // 보유 지도 조각 수 — 발굴 화면 진입 시 표시용. collection 라우트가 fragments 를 함께 반환한다.
  const loadFragments = useCallback(async (): Promise<number | null> => {
    try {
      const res = await fetch("/api/v2/treasure/collection");
      const j = await res.json().catch(() => null);
      if (res.ok && j?.ok && typeof j.fragments === "number") return j.fragments;
    } catch {}
    return null;
  }, []);

  // 진행 중 발굴 세션 복원 — 마운트 시 호출. 조각 소비 없는 읽기 전용(open 의 resume 과 동일 뷰).
  //   다른 화면을 다녀와도 발굴이 사라지지 않게 격자를 그대로 이어준다.
  const loadSession = useCallback(async (): Promise<TreasureSitePublic | null> => {
    try {
      const res = await fetch("/api/v2/treasure/session");
      const j = await res.json().catch(() => null);
      if (res.ok && j?.ok && j.site) return j.site as TreasureSitePublic;
    } catch {}
    return null;
  }, []);

  const dig = useCallback(
    async (siteId: string, cell: number): Promise<DigOutcome> => {
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
    },
    [],
  );

  return { open, dig, loadFragments, loadSession };
}
