"use client";

import { Card } from "@/components/ui/Card";
import { MAIN_DUNGEON } from "@/adventure/data/v2/dungeon";
import { getFieldBoss } from "@/adventure/data/v2/dungeonBosses";
import type { DungeonFloorId } from "@/adventure/data/v2/types";

// 현재 거점의 던전(사냥터) 층 목록. 옛 V2BattleHome 본문 — town/character 패턴으로 entry
// 카드 분리하면서 (V2BattleHome 은 던전/지도 EntryCard) 층 list 만 떼옴.
// 보스가 있는 층은 사냥터 카드(70%) 옆에 보스 입장 버튼(30%)을 둔다 — 보스는 별도 페이지.

export function V2DungeonList({
  currentOutpost,
  onSelectFloor,
  onSelectBoss,
  onOpenMap,
}: {
  currentOutpost: { id: string; name: string } | null;
  onSelectFloor: (floorId: DungeonFloorId) => void;
  onSelectBoss: (floorId: DungeonFloorId) => void;
  onOpenMap: () => void;
}) {
  return (
    <main className="mx-auto max-w-[720px] space-y-4 p-6 text-zinc-900 dark:text-zinc-100">
      <header>
        <h1 className="text-lg font-bold">사냥터</h1>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          {currentOutpost
            ? `${currentOutpost.name} 의 사냥터. 구역을 선택해 입장.`
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
          {MAIN_DUNGEON.floors.map((floor) => {
            const boss = getFieldBoss(floor.id);
            const floorButton = (
              <button
                type="button"
                onClick={() => onSelectFloor(floor.id)}
                className="block h-full w-full text-left"
              >
                <Card padding="sm">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-base font-medium">
                        {floor.name}
                      </div>
                      <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                        {floor.requirement.kind === "power"
                          ? `권장 파워 ${floor.requirement.min}`
                          : `엔드 ${floor.requirement.tier}`}
                      </div>
                    </div>
                    <span className="shrink-0 rounded bg-zinc-200 px-2 py-0.5 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                      입장
                    </span>
                  </div>
                </Card>
              </button>
            );

            // 보스 없는 층 — 전폭 카드.
            if (!boss) return <div key={floor.id}>{floorButton}</div>;

            // 보스 있는 층 — 사냥터 카드 70% + 보스 입장 버튼 30% (보스는 별도 페이지).
            return (
              <div key={floor.id} className="flex items-stretch gap-2">
                <div className="min-w-0 basis-[70%]">{floorButton}</div>
                <button
                  type="button"
                  onClick={() => onSelectBoss(floor.id)}
                  aria-label={`${boss.name} 보스 입장`}
                  className="flex basis-[30%] shrink-0 flex-col justify-center gap-0.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-left transition-colors hover:bg-amber-100 dark:border-amber-800/60 dark:bg-amber-950/40 dark:hover:bg-amber-900/40"
                >
                  <span className="text-xs font-bold text-amber-700 dark:text-amber-400">
                    필드 보스
                  </span>
                  <span className="w-full truncate text-xs text-amber-800 dark:text-amber-300">
                    {boss.name}
                  </span>
                  <span className="mt-0.5 text-[10px] text-amber-600 dark:text-amber-500">
                    입장 →
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
