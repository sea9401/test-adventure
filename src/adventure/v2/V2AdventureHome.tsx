"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MapPin, Sword } from "@phosphor-icons/react";
import {
  V2CharacterCard,
  type V2CharacterCardData,
} from "./V2CharacterCard";
import { OUTPOSTS } from "@/adventure/data/v2/outposts";
import type { OutpostType, OutpostTier } from "@/adventure/data/v2/types";

// 모험 탭 — 캐릭 간략 카드 + 현 위치 거점 카드 + placeholder.

type StateResponse = {
  ok?: boolean;
  character?: V2CharacterCardData;
  guild?: { name: string };
};

const TYPE_LABEL: Record<OutpostType, string> = {
  mine: "광산",
  tower: "마탑",
  fort: "요새",
  village: "마을",
};
const TIER_LABEL: Record<OutpostTier, string> = {
  1: "마을",
  2: "거점",
  3: "도시",
  4: "왕국",
};

export function V2AdventureHome({
  currentOutpost,
}: {
  currentOutpost: { id: string; name: string } | null;
}) {
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

  const outpost = useMemo(
    () =>
      currentOutpost
        ? OUTPOSTS.find((o) => o.id === currentOutpost.id) ?? null
        : null,
    [currentOutpost],
  );

  return (
    <main className="text-zinc-900 dark:text-zinc-100">
      <div className="mx-auto max-w-2xl space-y-4 p-6">
        {state?.character && (
          <V2CharacterCard
            character={state.character}
            guild={state.guild}
            showGold={false}
          />
        )}

        {outpost && (
          <section className="rounded-md border border-zinc-200 bg-white/90 p-4 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-950/90">
            <div className="flex items-baseline gap-2">
              <MapPin
                size={16}
                weight="fill"
                className="shrink-0 text-emerald-500"
              />
              <h2 className="text-base font-semibold text-zinc-800 dark:text-zinc-100">
                {outpost.name}
              </h2>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                {TYPE_LABEL[outpost.type]} · {TIER_LABEL[outpost.tier]}
              </span>
              {outpost.neutral && (
                <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
                  중립
                </span>
              )}
            </div>
            {outpost.description && (
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                {outpost.description}
              </p>
            )}
          </section>
        )}

        <header className="rounded-md bg-white/80 px-3 py-2 backdrop-blur-sm dark:bg-zinc-950/70">
          <h1 className="text-lg font-bold">모험</h1>
          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
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
      </div>
    </main>
  );
}
