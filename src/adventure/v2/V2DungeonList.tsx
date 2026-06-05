"use client";

import { Card } from "@/components/ui/Card";
import { BackButton } from "@/components/ui/BackButton";
import { depthName } from "@/adventure/data/v2/dungeon";
import { floorPowerGate } from "@/adventure/data/v2/dungeonLadder";

// 무한 프론티어 사냥터 목록. 깊이 1(들판)~최고도달+1(도전)까지 표시.
// frontierDepth = 최고 도달 깊이(기본 2). 그 이상은 "도전(미정복)" 구역.

export function V2DungeonList({
  currentOutpost,
  onSelectFloor,
  onOpenMap,
  frontierDepth = 2,
}: {
  currentOutpost: { id: string; name: string } | null;
  onSelectFloor: (depth: number) => void;
  onOpenMap: () => void;
  frontierDepth?: number;
}) {
  // 표시할 깊이: 1 ~ frontierDepth+1
  const maxDepth = Math.max(2, frontierDepth);
  const depths = Array.from({ length: maxDepth + 1 }, (_, i) => i + 1);

  return (
    <main className="mx-auto max-w-[720px] space-y-4 p-6 text-zinc-900 dark:text-zinc-100">
      <header>
        <BackButton onClick={onOpenMap} />
        <h1 className="mt-3 text-lg font-bold">사냥터</h1>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          {currentOutpost
            ? `${currentOutpost.name} — 구역을 선택해 입장.`
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
        <div className="grid grid-cols-2 gap-2">
          {depths.map((depth) => {
            const isChallenge = depth === maxDepth + 1;
            return (
              <button
                key={depth}
                type="button"
                onClick={() => onSelectFloor(depth)}
                className="group block h-full text-left"
              >
                <Card
                  padding="sm"
                  className={`flex h-full flex-col transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:shadow-sm ${
                    isChallenge
                      ? "border-amber-400 hover:border-amber-500 dark:border-amber-600 dark:hover:border-amber-400"
                      : "hover:border-rose-300 dark:hover:border-rose-600"
                  }`}
                >
                  <div
                    className={`truncate text-sm font-medium transition-colors ${
                      isChallenge
                        ? "text-amber-700 dark:text-amber-400 group-hover:text-amber-800 dark:group-hover:text-amber-300"
                        : "group-hover:text-rose-600 dark:group-hover:text-rose-400"
                    }`}
                  >
                    {depthName(depth)}
                  </div>
                  <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                    권장 파워 {floorPowerGate(depth)}
                  </div>
                  {isChallenge && (
                    <div className="mt-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                      도전 (미정복)
                    </div>
                  )}
                  <span
                    className={`mt-2 self-start rounded px-2 py-0.5 text-xs transition-colors ${
                      isChallenge
                        ? "bg-amber-100 text-amber-800 group-hover:bg-amber-500 group-hover:text-white dark:bg-amber-900 dark:text-amber-100 dark:group-hover:bg-amber-600"
                        : "bg-zinc-200 text-zinc-700 group-hover:bg-rose-500 group-hover:text-white dark:bg-zinc-800 dark:text-zinc-200 dark:group-hover:bg-rose-600"
                    }`}
                  >
                    입장
                  </span>
                </Card>
              </button>
            );
          })}
        </div>
      )}
    </main>
  );
}
