"use client";

import { useState } from "react";
import { StaminaBar } from "@/adventure/v2/StaminaBar";
import { HuntResultCard } from "@/adventure/v2/HuntResultCard";
import { ReplayBattleScene } from "@/adventure/v2/ReplayBattleScene";
import { useDungeonHunt } from "@/adventure/v2/useDungeonHunt";
import { initialStamina, type StaminaState } from "@/adventure/v2/stamina";
import { MAIN_DUNGEON } from "@/adventure/data/v2/dungeon";
import type { Gender } from "@/adventure/profile/avatars";

// 던전 사냥 dev preview — useDungeonHunt 사용. 5층 한 페이지에서 사냥 (구식).
// 실제 게임은 V2BattleHome → V2DungeonFloorView (페이지 분리).
// dev 라 자체 stamina state (실제 게임은 V2GameFlow 의 전역 stamina 사용).

export function DungeonHunt({
  outpostId,
  playerName = "모험가",
  playerGender = "male1",
}: {
  outpostId?: string;
  playerName?: string;
  playerGender?: Gender;
} = {}) {
  const [stamina, setStamina] = useState<StaminaState>(() =>
    initialStamina(Date.now()),
  );
  const { busy, lastResult, log, hunt } = useDungeonHunt({
    outpostId,
    setStamina,
  });

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-6 text-zinc-900 dark:text-zinc-100">
      <header>
        <h1 className="text-lg font-bold">던전 사냥 (dev)</h1>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          층 클릭 = 단판 사냥. 실 게임은 전투 탭 → 층 → 던전 페이지.
        </p>
      </header>

      <StaminaBar state={stamina} />

      <div className="grid grid-cols-1 gap-2">
        {MAIN_DUNGEON.floors.map((floor) => (
          <button
            key={floor.id}
            onClick={() => hunt(floor.id)}
            disabled={busy}
            className="flex items-center justify-between rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 text-left text-sm hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900/50 dark:hover:bg-zinc-800"
          >
            <span className="font-medium">{floor.name}</span>
            <span className="text-xs text-zinc-500">
              {floor.requirement.kind === "level"
                ? `Lv ${floor.requirement.min}~${floor.requirement.max}`
                : `엔드 ${floor.requirement.tier}`}
            </span>
          </button>
        ))}
      </div>

      {lastResult?.replay && (
        <ReplayBattleScene
          payload={lastResult.replay}
          startPlayerHp={lastResult.startPlayerHp}
          playerName={playerName}
          gender={playerGender}
          exp={lastResult.expForBar ?? 0}
          maxExp={lastResult.maxExpForBar ?? 1}
        />
      )}

      {lastResult && <HuntResultCard result={lastResult} />}

      {log.length > 0 && (
        <section className="space-y-1">
          <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            최근 호출
          </div>
          <div className="rounded-md border border-zinc-200 bg-zinc-50 p-2 text-xs font-mono dark:border-zinc-800 dark:bg-zinc-900/50">
            {log.map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
