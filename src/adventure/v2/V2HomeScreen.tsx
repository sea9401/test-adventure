"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowsClockwise,
  Buildings,
  Diamond,
  MapTrifold,
  User,
  UsersThree,
} from "@phosphor-icons/react";
import { Card } from "@/components/ui/Card";
import { EntryCard } from "@/components/ui/EntryCard";
import { StatBar } from "@/components/ui/StatBar";
import { ResourceBar } from "./ResourceBar";
import type { V2Resources } from "@/adventure/data/v2/resources";

// v2 메인 화면 — 라이브 TownScreen 의 EntryCard 패턴 차용.
// 캐릭터 카드(이름·레벨·HP·EXP·스태미너) + 자원풀 + 진입 EntryCard 목록.
// 메인이 지도였던 옛 구조 폐기 — 지도는 진입 카드 중 하나.

export type HomeAction =
  | { kind: "open-outposts" }
  | { kind: "open-map" }
  | { kind: "open-lineup" }
  | { kind: "open-character" }
  | { kind: "open-inventory" };

type StateResponse = {
  ok?: boolean;
  character?: {
    name: string;
    level: number;
    exp: number;
    expToNext: number | null;
    hp: number;
    maxHp: number;
    stamina: { current: number; max: number; lastUpdatedAt: number };
    gold: number;
  };
  guild?: { id: number; name: string };
  resources?: V2Resources;
};

export function V2HomeScreen({
  onAction,
}: {
  onAction: (action: HomeAction) => void;
}) {
  const [state, setState] = useState<StateResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v2/me/state");
      if (res.ok) {
        const j = (await res.json()) as StateResponse;
        setState(j);
      } else {
        setState({ ok: false });
      }
    } catch {
      setState({ ok: false });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const character = state?.character;
  const guild = state?.guild;
  const resources = state?.resources ?? null;

  return (
    <main className="mx-auto max-w-md space-y-4 p-6 text-zinc-900 dark:text-zinc-100">
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
              <div className="flex shrink-0 items-center gap-2">
                <div className="text-right">
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">골드</div>
                  <div className="font-medium tabular-nums text-yellow-600 dark:text-yellow-400">
                    {character.gold.toLocaleString()}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={refresh}
                  disabled={loading}
                  aria-label="새로고침"
                  className="rounded p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-50 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                >
                  <ArrowsClockwise size={16} weight="bold" />
                </button>
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
              <StatBar
                label="행동"
                value={character.stamina.current}
                max={character.stamina.max}
                color="bg-sky-500"
              />
            </div>
          </>
        ) : loading ? (
          <div className="text-sm text-zinc-500 dark:text-zinc-400">
            불러오는 중…
          </div>
        ) : (
          <div className="text-sm text-rose-600 dark:text-rose-400">
            캐릭터 상태를 불러오지 못했어요.
          </div>
        )}
      </Card>

      <ResourceBar resources={resources} />

      <div className="space-y-2">
        <EntryCard
          icon={<User size={28} weight="duotone" className="text-sky-600" />}
          title="내 정보"
          description="스탯·전투력 (장비/스킬/룬 은 후속)."
          onClick={() => onAction({ kind: "open-character" })}
        />
        <EntryCard
          icon={<Diamond size={28} weight="duotone" className="text-teal-600" />}
          title="인벤토리"
          description="던전 사냥 재료 (장비/스킬북 은 후속)."
          onClick={() => onAction({ kind: "open-inventory" })}
        />
        <EntryCard
          icon={<Buildings size={28} weight="duotone" className="text-amber-600" />}
          title="거점 목록"
          description="점령된 거점과 빈 자리를 한눈에. 클릭해서 입장."
          onClick={() => onAction({ kind: "open-outposts" })}
        />
        <EntryCard
          icon={
            <MapTrifold size={28} weight="duotone" className="text-emerald-600" />
          }
          title="대륙 지도"
          description="거점 배치를 지도에서 확인."
          onClick={() => onAction({ kind: "open-map" })}
        />
        <EntryCard
          icon={
            <UsersThree size={28} weight="duotone" className="text-violet-600" />
          }
          title="길드 라인업"
          description="3:3 토너먼트 마스터 라인업 설정."
          onClick={() => onAction({ kind: "open-lineup" })}
        />
      </div>
    </main>
  );
}
