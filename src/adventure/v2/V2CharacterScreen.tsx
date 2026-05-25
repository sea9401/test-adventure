"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { StatBar } from "@/components/ui/StatBar";
import { StatsPanel } from "@/adventure/character/StatsPanel";
import type { StatKey } from "@/adventure/data/stats";

// v2 캐릭터 화면 — 라이브 CharacterScreen 의 일부(캐릭터 카드 + StatsPanel) 차용.
// 장비/스킬/룬 등은 별 PR 에서. 일단 캐릭이 어떻게 자랐는지 보는 게 최소.

type StateResponse = {
  ok?: boolean;
  character?: {
    name: string;
    level: number;
    exp: number;
    expToNext: number | null;
    hp: number;
    maxHp: number;
    gold: number;
  };
  guild?: { name: string };
  stats?: {
    base: Record<StatKey, number>;
    total: Record<StatKey, number>;
  } | null;
  combat?: { atk: number; def: number; spd: number } | null;
};

export function V2CharacterScreen({ onBack }: { onBack: () => void }) {
  const [state, setState] = useState<StateResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/v2/me/state");
        if (!cancelled && res.ok) {
          setState((await res.json()) as StateResponse);
        } else if (!cancelled) {
          setState({ ok: false });
        }
      } catch {
        if (!cancelled) setState({ ok: false });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const character = state?.character;
  const guild = state?.guild;
  const stats = state?.stats;
  const combat = state?.combat;

  return (
    <main className="mx-auto max-w-md space-y-4 p-6 text-zinc-900 dark:text-zinc-100">
      <header className="space-y-2 border-b border-zinc-200 pb-3 dark:border-zinc-800">
        <button
          type="button"
          onClick={onBack}
          className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
        >
          ← 메인으로
        </button>
        <h1 className="text-lg font-bold">내 정보</h1>
      </header>

      <Card padding="md">
        {character ? (
          <>
            <div className="flex items-baseline justify-between">
              <div className="min-w-0">
                <div className="truncate text-lg font-semibold">
                  {character.name}
                </div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400">
                  Lv {character.level}
                  {guild ? ` · ${guild.name}` : ""}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-xs text-zinc-500 dark:text-zinc-400">골드</div>
                <div className="font-medium tabular-nums text-yellow-600 dark:text-yellow-400">
                  {character.gold.toLocaleString()}
                </div>
              </div>
            </div>
            <div className="mt-3 space-y-1.5">
              <StatBar
                label="HP"
                value={character.hp}
                max={character.maxHp}
                color="bg-rose-500"
              />
              {character.expToNext != null && (
                <StatBar
                  label="EXP"
                  value={character.exp}
                  max={character.expToNext}
                  color="bg-emerald-500"
                />
              )}
            </div>
          </>
        ) : loading ? (
          <div className="text-sm text-zinc-500 dark:text-zinc-400">
            불러오는 중…
          </div>
        ) : (
          <div className="text-sm text-rose-600 dark:text-rose-400">
            캐릭터 정보를 불러오지 못했어요.
          </div>
        )}
      </Card>

      {stats && combat && (
        <Card padding="md">
          <StatsPanel stats={stats.base} totalStats={stats.total} combat={combat} />
        </Card>
      )}

      {stats == null && !loading && (
        <Card padding="md">
          <div className="text-xs text-zinc-500 dark:text-zinc-400">
            캐릭터가 아직 만들어지지 않았어요 (또는 v2 데이터 미생성).
            거점 입장 후 사냥을 한 번 시도하면 자동 생성됩니다.
          </div>
        </Card>
      )}
    </main>
  );
}
