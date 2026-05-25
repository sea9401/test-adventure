"use client";

import { useCallback, useEffect, useState } from "react";
import { Sword } from "@phosphor-icons/react";
import {
  V2CharacterCard,
  type V2CharacterCardData,
} from "./V2CharacterCard";

// 모험 탭 — 캐릭 간략 카드 + placeholder. 향후 자동 사냥·일일 모험 등.

type StateResponse = {
  ok?: boolean;
  character?: V2CharacterCardData;
  guild?: { name: string };
};

export function V2AdventureHome() {
  const [state, setState] = useState<StateResponse | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/v2/me/state");
      const j = (await res.json().catch(() => null)) as StateResponse | null;
      setState(j ?? { ok: false });
    } catch {
      setState({ ok: false });
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

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
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          준비 중인 탭입니다.
        </p>
      </header>
      <div className="rounded-lg border border-dashed border-zinc-300 bg-white/90 p-10 text-center dark:border-zinc-700 dark:bg-zinc-950/90">
        <div className="mx-auto inline-flex text-zinc-400 dark:text-zinc-500">
          <Sword size={40} weight="duotone" />
        </div>
        <div className="mt-3 text-base font-medium text-zinc-700 dark:text-zinc-300">
          곧 만나요
        </div>
        <div className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          자동 사냥·일일 모험 등이 들어올 자리.
        </div>
      </div>
    </main>
  );
}
