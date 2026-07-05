"use client";

import { useCallback, useRef } from "react";
import {
  TreasureDigView,
  type DigOutcome,
  type OpenOutcome,
  type TreasureFragmentStatus,
} from "@/adventure/v2/TreasureDigView";
import {
  applyTreasureAction,
  applyTreasureAppraisalBonus,
  finalConditionForSession,
  rollNewSession,
  toPublicSite,
  treasureAppraisalBonusPct,
  type TreasureAction,
  type TreasureSession,
  type TreasureSiteOptionId,
} from "@/adventure/v2/treasureDig";
import { ANTIQUES, appraiseValue } from "@/adventure/data/v2/antique";
import { FRAGMENTS_PER_MAP, spendOneMapWithCost } from "@/adventure/v2/treasureFragments";

// /dev/treasure 하니스 — 서버 권위 로직을 클라에서 그대로 재사용한다.
export function TreasureHarness() {
  const session = useRef<TreasureSession | null>(null);
  const fragments = useRef({ fragments: FRAGMENTS_PER_MAP * 3 });

  const open = useCallback(
    async (siteOptionId: TreasureSiteOptionId): Promise<OpenOutcome> => {
      if (session.current) {
        return { ok: true, resumed: true, site: toPublicSite(session.current) };
      }
      const spent = spendOneMapWithCost(fragments.current, FRAGMENTS_PER_MAP);
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
    },
    [],
  );

  const loadFragments = useCallback(
    async (): Promise<TreasureFragmentStatus | null> => ({
      fragments: fragments.current.fragments,
      needed: FRAGMENTS_PER_MAP,
      baseNeeded: FRAGMENTS_PER_MAP,
      mapWorkshopLevel: 0,
      discountPct: 0,
    }),
    [],
  );

  const dig = useCallback(
    async (siteId: string, action: TreasureAction): Promise<DigOutcome> => {
      const s = session.current;
      if (!s || s.siteId !== siteId) return { outcome: "error" };
      const r = applyTreasureAction(s, action);
      if (r.kind === "invalid") {
        return { outcome: "invalid", site: toPublicSite(s) };
      }
      if (r.kind === "extracted") {
        const a = ANTIQUES[s.antiqueId];
        const finalCondition = finalConditionForSession(r.session);
        const appraisalBonusPct = treasureAppraisalBonusPct(r.session);
        const appraisedValue = applyTreasureAppraisalBonus(
          appraiseValue(s.antiqueId, finalCondition),
          appraisalBonusPct,
        );
        session.current = null;
        return {
          outcome: "hit",
          antique: {
            instanceId: `dev-${Date.now()}`,
            antiqueId: a.id,
            name: a.name,
            tier: a.tier,
            condition: finalCondition,
            conditionBonus: Math.max(0, finalCondition - s.condition),
            appraisalBonusPct,
            appraisedValue,
          },
          grantedTitles: [],
          codexCount: 0,
        };
      }
      if (r.kind === "collapsed" || r.kind === "failed") {
        const a = ANTIQUES[s.antiqueId];
        session.current = null;
        return {
          outcome: "exhausted",
          message: r.message,
          site: toPublicSite(r.session),
          missed: { antiqueId: a.id, name: a.name, tier: a.tier },
        };
      }
      session.current = r.session;
      return {
        outcome: "progress",
        message: r.message,
        site: toPublicSite(r.session),
      };
    },
    [],
  );

  return (
    <div className="space-y-3">
      <div className="mx-auto max-w-[520px] px-6 pt-4">
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          DEV 하니스 — 서버 없이 로컬 mock. 지도 조각 3회분으로 시작, 새로고침 시 초기화.
        </div>
      </div>
      <TreasureDigView open={open} dig={dig} loadFragments={loadFragments} />
    </div>
  );
}
