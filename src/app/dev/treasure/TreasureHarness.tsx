"use client";

import { useCallback, useRef } from "react";
import {
  TreasureDigView,
  type DigOutcome,
  type OpenOutcome,
} from "@/adventure/v2/TreasureDigView";
import {
  applyTreasureAction,
  rollNewSession,
  toPublicSite,
  type TreasureAction,
  type TreasureSession,
} from "@/adventure/v2/treasureDig";
import { ANTIQUES, appraiseValue } from "@/adventure/data/v2/antique";
import { FRAGMENTS_PER_MAP, spendOneMap } from "@/adventure/v2/treasureFragments";

// /dev/treasure 하니스 — 서버 권위 로직을 클라에서 그대로 재사용(같은 순수 함수 rollNewSession/
// applyTreasureAction). 로그인·DB 없이 발굴 미니게임 UI 만 QA. 지도 조각 3회분으로 시작.
export function TreasureHarness() {
  const session = useRef<TreasureSession | null>(null);
  const fragments = useRef({ fragments: FRAGMENTS_PER_MAP * 3 });

  const open = useCallback(async (): Promise<OpenOutcome> => {
    if (session.current) {
      return { ok: true, resumed: true, site: toPublicSite(session.current) };
    }
    const spent = spendOneMap(fragments.current);
    if (!spent) {
      return {
        ok: false,
        reason: "not_enough_fragments",
        fragments: fragments.current.fragments,
      };
    }
    fragments.current = spent;
    session.current = rollNewSession({
      siteId: `${Date.now()}-${Math.random()}`,
      rng: Math.random,
      now: Date.now(),
    });
    return {
      ok: true,
      resumed: false,
      site: toPublicSite(session.current),
      fragments: spent.fragments,
    };
  }, []);

  const loadFragments = useCallback(
    async (): Promise<number | null> => fragments.current.fragments,
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
        session.current = null;
        return {
          outcome: "hit",
          antique: {
            instanceId: `dev-${Date.now()}`,
            antiqueId: a.id,
            name: a.name,
            tier: a.tier,
            condition: r.condition,
            appraisedValue: appraiseValue(s.antiqueId, r.condition),
          },
          codexCount: 0,
        };
      }
      if (r.kind === "collapsed" || r.kind === "failed") {
        const a = ANTIQUES[s.antiqueId];
        session.current = null;
        return {
          outcome: "exhausted",
          site: toPublicSite(r.session),
          message: r.message,
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
          DEV 하니스 — 서버 없이 로컬 mock(같은 순수 로직). 지도 조각 3회분으로 시작,
          새로고침 시 초기화.
        </div>
      </div>
      <TreasureDigView open={open} dig={dig} loadFragments={loadFragments} />
    </div>
  );
}
