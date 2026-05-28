"use client";

import { Card } from "@/components/ui/Card";
import { MAIN_DUNGEON } from "@/adventure/data/v2/dungeon";
import type { DungeonFloorId } from "@/adventure/data/v2/types";

// 현재 거점의 8 층 던전 리스트. 옛 V2BattleHome 본문 — town/character 패턴으로 entry
// 카드 분리하면서 (V2BattleHome 은 던전/지도 EntryCard) 8 층 list 만 떼옴.

export function V2DungeonList({
  currentOutpost,
  onSelectFloor,
  onOpenMap,
}: {
  currentOutpost: { id: string; name: string } | null;
  onSelectFloor: (floorId: DungeonFloorId) => void;
  onOpenMap: () => void;
}) {
  return (
    <main className="mx-auto max-w-3xl space-y-4 p-6 text-zinc-900 dark:text-zinc-100">
      <header>
        <h1 className="text-lg font-bold">던전</h1>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          {currentOutpost
            ? `${currentOutpost.name} 의 던전. 층을 선택해 입장.`
            : "거점에 머문 적이 없어요. 지도에서 거점 진입 후 사냥 가능."}
        </p>
      </header>

      {!currentOutpost ? (
        <Card padding="md">
          <button
            type="button"
            onClick={onOpenMap}
            className="rounded-md border border-zinc-300 bg-zinc-50 px-3 py-1.5 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            지도 열기
          </button>
        </Card>
      ) : (
        <div className="space-y-2">
          {MAIN_DUNGEON.floors.map((floor) => (
            <button
              key={floor.id}
              type="button"
              onClick={() => onSelectFloor(floor.id)}
              className="block w-full text-left"
            >
              <Card padding="sm">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-base font-medium">
                      {floor.name}
                    </div>
                    <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                      {floor.requirement.kind === "level"
                        ? `Lv ${floor.requirement.min}~${floor.requirement.max}`
                        : `엔드 ${floor.requirement.tier}`}
                    </div>
                  </div>
                  <span className="shrink-0 rounded bg-zinc-200 px-2 py-0.5 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                    입장
                  </span>
                </div>
              </Card>
            </button>
          ))}
        </div>
      )}
    </main>
  );
}
