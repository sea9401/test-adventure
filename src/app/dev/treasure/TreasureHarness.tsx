"use client";

import { useCallback, useRef } from "react";
import {
  TreasureDigView,
  type DigOutcome,
  type OpenOutcome,
} from "@/adventure/v2/TreasureDigView";
import {
  applyDig,
  rollNewSession,
  toPublicSite,
  treasureConditionAfterHit,
  type TreasureDigToolId,
  type TreasureSession,
  type TreasureSiteOptionId,
} from "@/adventure/v2/treasureDig";
import { ANTIQUES, appraiseValue } from "@/adventure/data/v2/antique";
import {
  FRAGMENTS_PER_MAP,
  spendOneMap,
} from "@/adventure/v2/treasureFragments";

// /dev/treasure 하니스 — 서버 권위 로직을 클라에서 그대로 재사용(같은 순수 함수 rollNewSession/
// applyDig). 로그인·DB 없이 발굴 미니게임 UI 만 QA. 지도 조각 55개로 시작, 새로고침 시 초기화.
export function TreasureHarness() {
  const session = useRef<TreasureSession | null>(null);
  const fragments = useRef({ fragments: 55 });

  const open = useCallback(async (
    siteOptionId: TreasureSiteOptionId,
  ): Promise<OpenOutcome> => {
    if (session.current) {
      return { ok: true, resumed: true, site: toPublicSite(session.current) };
    }
    const spent = spendOneMap(fragments.current);
    if (!spent) {
      return {
        ok: false,
        reason: "not_enough_fragments",
        fragments: fragments.current.fragments,
        needed: FRAGMENTS_PER_MAP,
        baseNeeded: FRAGMENTS_PER_MAP,
        mapWorkshopLevel: 0,
        discountPct: 0,
      };
    }
    fragments.current = spent;
    session.current = rollNewSession({
      siteId: `${Date.now()}-${Math.random()}`,
      siteOptionId,
      rng: Math.random,
      now: Date.now(),
    });
    return {
      ok: true,
      resumed: false,
      site: toPublicSite(session.current),
      fragments: spent.fragments,
      needed: FRAGMENTS_PER_MAP,
      baseNeeded: FRAGMENTS_PER_MAP,
      mapWorkshopLevel: 0,
      discountPct: 0,
    };
  }, []);

  const loadFragments = useCallback(async () => ({
    fragments: fragments.current.fragments,
    needed: FRAGMENTS_PER_MAP,
    baseNeeded: FRAGMENTS_PER_MAP,
    mapWorkshopLevel: 0,
    discountPct: 0,
  }), []);

  const dig = useCallback(
    async (
      siteId: string,
      cell: number,
      tool: TreasureDigToolId,
    ): Promise<DigOutcome> => {
      const s = session.current;
      if (!s || s.siteId !== siteId) return { outcome: "error" };
      const r = applyDig(s, cell, tool);
      if (r.kind === "invalid") {
        return { outcome: "invalid", site: toPublicSite(s) };
      }
      if (r.kind === "hit") {
        const a = ANTIQUES[s.antiqueId];
        const finalCondition = treasureConditionAfterHit(r.session);
        session.current = null;
        return {
          outcome: "hit",
          clue: "hot",
          antique: {
            instanceId: `dev-${Date.now()}`,
            antiqueId: a.id,
            name: a.name,
            tier: a.tier,
            condition: finalCondition,
            conditionBonus: Math.max(0, finalCondition - s.condition),
            appraisedValue: appraiseValue(s.antiqueId, finalCondition),
          },
          codexCount: 0,
        };
      }
      if (r.kind === "exhausted") {
        const a = ANTIQUES[s.antiqueId];
        session.current = null;
        return {
          outcome: "exhausted",
          clue: r.clue,
          treasureCell: s.treasureCell,
          missed: { antiqueId: a.id, name: a.name, tier: a.tier },
        };
      }
      if (r.kind === "probe") {
        session.current = r.session;
        return { outcome: "probe", clue: r.clue, site: toPublicSite(r.session) };
      }
      session.current = r.session;
      return { outcome: "miss", clue: r.clue, site: toPublicSite(r.session) };
    },
    [],
  );

  return (
    <div className="space-y-3">
      <div className="mx-auto max-w-[520px] px-6 pt-4">
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          DEV 하니스 — 서버 없이 로컬 mock(같은 순수 로직). 지도 조각 55개로 시작, 새로고침 시
          초기화.
        </div>
      </div>
      <TreasureDigView open={open} dig={dig} loadFragments={loadFragments} />
    </div>
  );
}
