"use client";

import { Card } from "@/components/ui/Card";
import { DungeonHunt } from "@/app/dev/dungeon-hunt/DungeonHunt";
import type { Gender } from "@/adventure/profile/avatars";

// 전투 탭 — 현재 거점의 던전 사냥.
// V2TopBar 의 currentOutpost 가 자동 outpostId 로 사용 (세금/정책 게이트 적용).
// 거점 없으면 안내 + 지도 탭으로 가도록.

export function V2BattleHome({
  currentOutpost,
  playerName,
  playerGender,
  onOpenMap,
}: {
  currentOutpost: { id: string; name: string } | null;
  playerName: string;
  playerGender: Gender;
  onOpenMap: () => void;
}) {
  if (!currentOutpost) {
    return (
      <main className="mx-auto max-w-2xl space-y-4 p-6 text-zinc-900 dark:text-zinc-100">
        <header>
          <h1 className="text-lg font-bold">전투</h1>
        </header>
        <Card padding="md">
          <div className="text-sm text-zinc-700 dark:text-zinc-200">
            아직 머문 거점이 없어요.
          </div>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            지도 탭에서 거점에 들어가면 그 거점의 던전을 여기서 사냥할 수 있어요.
          </p>
          <button
            type="button"
            onClick={onOpenMap}
            className="mt-3 rounded-md border border-zinc-300 bg-zinc-50 px-3 py-1.5 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            지도 열기
          </button>
        </Card>
      </main>
    );
  }

  return (
    <DungeonHunt
      outpostId={currentOutpost.id}
      playerName={playerName}
      playerGender={playerGender}
    />
  );
}
