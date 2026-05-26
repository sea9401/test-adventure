"use client";

import { useEffect, useState } from "react";
import { Sword } from "@phosphor-icons/react";
import {
  V2CharacterCard,
  type V2CharacterCardData,
} from "./V2CharacterCard";

// 모험 탭 — 캐릭 간략 카드 + 아레나 진입 (PR-8a). 향후 자동 사냥·일일 모험 등.

type StateResponse = {
  ok?: boolean;
  character?: V2CharacterCardData;
  guild?: { name: string };
};

export function V2AdventureHome({
  onOpenArena,
}: {
  onOpenArena: () => void;
}) {
  const [state, setState] = useState<StateResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/v2/me/state");
        const j = (await res.json().catch(() => null)) as StateResponse | null;
        if (!cancelled) setState(j ?? { ok: false });
      } catch {
        if (!cancelled) setState({ ok: false });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-6 text-zinc-900 dark:text-zinc-100">
      {state?.character && (
        <V2CharacterCard
          character={state.character}
          guild={state.guild}
          showGold={false}
        />
      )}

      <header>
        <h1 className="text-lg font-bold">모험</h1>
      </header>

      <button
        type="button"
        onClick={onOpenArena}
        className="w-full rounded-lg border border-zinc-300 bg-white/90 p-5 text-left transition hover:border-amber-500 hover:bg-amber-50/50 dark:border-zinc-700 dark:bg-zinc-950/90 dark:hover:border-amber-400 dark:hover:bg-amber-950/30"
      >
        <div className="flex items-center gap-3">
          <Sword size={32} weight="duotone" className="text-amber-600 dark:text-amber-400" />
          <div className="flex-1">
            <div className="text-base font-semibold">아레나</div>
            <div className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">
              1:1 단판 결투 — 빌드 자랑의 무대
            </div>
          </div>
        </div>
      </button>
    </main>
  );
}
