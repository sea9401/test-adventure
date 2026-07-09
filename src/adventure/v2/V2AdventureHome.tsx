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

        <GuideQuestBanner />

        <V2AnnouncementsPanel />
      </div>
    </main>
  );
}
