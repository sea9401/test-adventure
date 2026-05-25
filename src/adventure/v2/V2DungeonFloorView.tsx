"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { HuntResultCard } from "@/adventure/v2/HuntResultCard";
import { ReplayBattleScene } from "@/adventure/v2/ReplayBattleScene";
import { useDungeonHunt } from "@/adventure/v2/useDungeonHunt";
import { HUNT_COST, type StaminaState } from "@/adventure/v2/stamina";
import { MAIN_DUNGEON } from "@/adventure/data/v2/dungeon";
import type { DungeonFloorId } from "@/adventure/data/v2/types";
import type { Gender } from "@/adventure/profile/avatars";

// 한 층 전용 던전 페이지. 사냥 버튼 + 자동 토글 + 결과 replay/card.
// 자동: 토글 ON + busy 아님 + replay 끝남 + stamina ≥ HUNT_COST → setTimeout 후 hunt.
// 스태미너 부족 시 자동 OFF (회복은 시간이 걸려 자동 재시도 비효율).

const AUTO_DELAY_MS = 600;

export function V2DungeonFloorView({
  floorId,
  outpostId,
  outpostName,
  playerName,
  playerGender,
  stamina,
  setStamina,
  onBack,
}: {
  floorId: DungeonFloorId;
  outpostId: string;
  outpostName: string;
  playerName: string;
  playerGender: Gender;
  // 전역 stamina + setter — V2GameFlow.
  stamina: StaminaState;
  setStamina: (s: StaminaState) => void;
  onBack: () => void;
}) {
  const floor = MAIN_DUNGEON.floors.find((f) => f.id === floorId);
  const { busy, lastResult, hunt } = useDungeonHunt({
    outpostId,
    setStamina,
  });
  const [autoMode, setAutoMode] = useState(false);
  const [autoMsg, setAutoMsg] = useState<string | null>(null);

  // 자동 트리거 — busy 아님 + stamina 충분 시 setTimeout 후 hunt.
  // 결과 즉시 표시 (replay step 폐기) 이므로 hunt 완료 = busy false 가 다음 trigger.
  useEffect(() => {
    if (!autoMode) return;
    if (busy) return;
    if (!floor) return;
    if (stamina.current < HUNT_COST) {
      setAutoMode(false);
      setAutoMsg("스태미너 부족 — 자동 중지. 회복 후 다시 켜세요.");
      return;
    }
    setAutoMsg(null);
    const id = setTimeout(() => void hunt(floor.id), AUTO_DELAY_MS);
    return () => clearTimeout(id);
  }, [autoMode, busy, stamina.current, hunt, floor]);

  if (!floor) {
    return (
      <main className="mx-auto max-w-2xl space-y-4 p-6">
        <button
          type="button"
          onClick={onBack}
          className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
        >
          ← 전투로
        </button>
        <div className="text-sm text-rose-600 dark:text-rose-400">
          알 수 없는 층입니다.
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-6 text-zinc-900 dark:text-zinc-100">
      <header className="space-y-2 border-b border-zinc-200 pb-3 dark:border-zinc-800">
        <button
          type="button"
          onClick={onBack}
          className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
        >
          ← 전투로
        </button>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-lg font-bold">{floor.name}</h1>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            {outpostName}
          </span>
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {floor.requirement.kind === "level"
            ? `권장 레벨 ${floor.requirement.min}~${floor.requirement.max}`
            : `엔드 컨텐츠 ${floor.requirement.tier}`}
        </p>
      </header>

      <Card padding="md">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => hunt(floor.id)}
            disabled={busy || autoMode}
            className="flex-1 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2.5 text-sm font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200 dark:hover:bg-emerald-900/40"
          >
            {busy ? "사냥 중…" : autoMode ? "자동 사냥 중" : "사냥 (스태미너 1)"}
          </button>
          <label className="flex shrink-0 cursor-pointer items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-400">
            <input
              type="checkbox"
              checked={autoMode}
              onChange={(e) => {
                setAutoMode(e.target.checked);
                if (!e.target.checked) setAutoMsg(null);
              }}
            />
            <span>자동</span>
          </label>
        </div>
        {autoMsg && (
          <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
            {autoMsg}
          </p>
        )}
      </Card>

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
    </main>
  );
}
