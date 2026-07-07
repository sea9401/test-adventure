"use client";

import { useCallback, useEffect, useState } from "react";
import {
  V2CharacterCard,
  type V2CharacterCardData,
} from "./V2CharacterCard";
import { V2AnnouncementsPanel } from "./V2AnnouncementsPanel";
import { GuideQuestBanner } from "./GuideQuestBanner";
import { effectiveLevelCap } from "@/adventure/data/v2/proficiency";

// 모험 탭 — 캐릭터 상태 + 안내/공지.

type StateResponse = {
  ok?: boolean;
  character?: V2CharacterCardData;
  guild?: { id: number; name: string } | null;
  hotTime?: {
    title: string;
    endsAt: string;
    serverNow: number;
    bonuses: {
      goldPct: number;
      expPct: number;
      masteryPct: number;
      fishingCoinPct: number;
    };
  } | null;
  proficiency?: {
    groups?: Record<string, { tier?: number }>;
    current?: { group?: string };
  };
};

export function V2AdventureHome() {
  const [state, setState] = useState<StateResponse | null>(null);

  const refresh = useCallback(async () => {
    try {
      const stateRes = await fetch("/api/v2/me/state");
      const j = (await stateRes.json().catch(() => null)) as StateResponse | null;
      setState(j ?? { ok: false });
    } catch {
      setState({ ok: false });
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 1회 fetch(refresh 가 state 시드)
    refresh();
  }, [refresh]);

  const currentGroup = state?.proficiency?.current?.group ?? "none";
  const currentTier =
    currentGroup === "none"
      ? null
      : (state?.proficiency?.groups?.[currentGroup]?.tier ?? 1);
  const levelCap = currentTier == null ? null : effectiveLevelCap(currentTier);

  return (
    <main className="text-zinc-900 dark:text-zinc-100">
      <div className="mx-auto max-w-[720px] space-y-4 p-6">
        {state?.character && (
          <V2CharacterCard
            character={state.character}
            guild={state.guild ?? null}
            levelCap={levelCap}
            showGold={true}
          />
        )}

        {state?.hotTime ? <HotTimeBanner hotTime={state.hotTime} /> : null}

        <GuideQuestBanner />

        <V2AnnouncementsPanel />
      </div>
    </main>
  );
}

function HotTimeBanner({ hotTime }: { hotTime: NonNullable<StateResponse["hotTime"]> }) {
  const endsAt = Date.parse(hotTime.endsAt);
  const remainingMs = Number.isFinite(endsAt)
    ? Math.max(0, endsAt - hotTime.serverNow)
    : 0;
  const bonusLabels = [
    hotTime.bonuses.goldPct > 0 ? `골드 +${hotTime.bonuses.goldPct}%` : "",
    hotTime.bonuses.expPct > 0 ? `EXP +${hotTime.bonuses.expPct}%` : "",
    hotTime.bonuses.masteryPct > 0 ? `숙련 +${hotTime.bonuses.masteryPct}%` : "",
    hotTime.bonuses.fishingCoinPct > 0
      ? `낚시 코인 +${hotTime.bonuses.fishingCoinPct}%`
      : "",
  ].filter(Boolean);
  return (
    <section className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-amber-950 shadow-sm dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold">
            핫타임 {hotTime.title || "이벤트"}
          </div>
          <div className="mt-0.5 text-xs">
            {bonusLabels.length > 0 ? bonusLabels.join(" · ") : "보너스 적용 중"}
          </div>
        </div>
        <div className="rounded bg-white/70 px-2 py-1 text-xs font-medium tabular-nums dark:bg-zinc-900/60">
          {formatRemaining(remainingMs)}
        </div>
      </div>
    </section>
  );
}

function formatRemaining(ms: number) {
  const totalMin = Math.max(0, Math.ceil(ms / 60_000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h <= 0) return `${m}분 남음`;
  return `${h}시간 ${m}분 남음`;
}
