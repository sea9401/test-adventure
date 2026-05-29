"use client";

import { useState } from "react";
import { Gear } from "@phosphor-icons/react";
import { Card } from "@/components/ui/Card";
import { HuntResultCard } from "@/adventure/v2/HuntResultCard";
import {
  BatchSummaryCard,
  type BatchSummary,
} from "@/adventure/v2/BatchSummaryCard";
import { ReplayBattleScene } from "@/adventure/v2/ReplayBattleScene";
import { useDungeonHunt } from "@/adventure/v2/useDungeonHunt";
import { HUNT_COST, type StaminaState } from "@/adventure/v2/stamina";
import { MAIN_DUNGEON } from "@/adventure/data/v2/dungeon";
import { TutorialOverlayInner } from "@/adventure/tutorial/TutorialOverlay";
import {
  TUTORIAL_ENABLED_FLAG,
  TUTORIAL_V2_FIRST_LEVELUP,
} from "@/adventure/tutorial/flags";
import { useStoryFlags } from "@/adventure/storyFlags/useStoryFlags";
import type {
  V2MaterialId,
} from "@/adventure/data/v2/dungeonDrops";
import type { V2EquipmentId } from "@/adventure/data/v2/v2Equipment";
import type { DungeonFloorId } from "@/adventure/data/v2/types";
import type { Gender } from "@/adventure/profile/avatars";

// 한 층 전용 던전 페이지. 1회 사냥 + 5/10회 일괄 사냥 (한 번에 N회, 합산 결과).
// 옛 무한 자동/연속 useEffect 트리거 폐기 — runBatch 가 직접 for-loop with await.

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
  // 일괄 사냥 상태.
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [batchSummary, setBatchSummary] = useState<BatchSummary | null>(null);

  const { state: storyFlags, set: setStoryFlag } = useStoryFlags();

  const showLevelupModal =
    !!lastResult &&
    lastResult.levelsGained > 0 &&
    storyFlags.flags.includes(TUTORIAL_ENABLED_FLAG) &&
    !storyFlags.flags.includes(TUTORIAL_V2_FIRST_LEVELUP);

  const runBatch = async (count: number) => {
    if (!floor) return;
    setSettingsOpen(false);
    setBatchSummary(null);
    setBatchRunning(true);
    setBatchProgress({ done: 0, total: count });

    let wins = 0;
    let losses = 0;
    let totalExp = 0;
    let totalGold = 0;
    let levelsGained = 0;
    const drops: Partial<Record<V2MaterialId, number>> = {};
    const droppedEquipments: V2EquipmentId[] = [];
    let stoppedReason: BatchSummary["stoppedReason"] = null;
    let completed = 0;

    for (let i = 0; i < count; i++) {
      const r = await hunt(floor.id);
      if (!r) {
        stoppedReason = "error";
        break;
      }
      completed++;
      setBatchProgress({ done: completed, total: count });
      if (r.won) wins++;
      else losses++;
      totalExp += r.expGained;
      totalGold += r.goldGained;
      levelsGained += r.levelsGained;
      for (const [id, n] of Object.entries(r.drops ?? {})) {
        const key = id as V2MaterialId;
        drops[key] = (drops[key] ?? 0) + (n ?? 0);
      }
      if (r.droppedEquipment) droppedEquipments.push(r.droppedEquipment);
      // 사망(패배) 시 그 사이 회복 없으니 다음 사냥 회피·중단.
      if (!r.won && r.hpAfter <= 0) {
        stoppedReason = "death";
        break;
      }
      // 다음 사냥 전 스태미너 사전 검사 — 직전 응답의 잔량 기준.
      // (response 의 stamina 가 setStamina 됐지만 React state 라 await 즉시 안 보임.
      //  마지막 hunt 가 실패 시 다음 시도가 error 로 처리되니 안전.)
    }

    setBatchSummary({
      attempted: count,
      completed,
      wins,
      losses,
      totalExp,
      totalGold,
      levelsGained,
      drops,
      droppedEquipments,
      stoppedReason,
    });
    setBatchProgress(null);
    setBatchRunning(false);
  };

  if (!floor) {
    return (
      <main className="mx-auto max-w-[720px] space-y-4 p-6">
        <button
          type="button"
          onClick={onBack}
          className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
        >
          ← 전투로
        </button>
        <div className="text-sm text-rose-600 dark:text-rose-400">
          알 수 없는 구역입니다.
        </div>
      </main>
    );
  }

  const lowStamina = stamina.current < HUNT_COST;
  const oneActionDisabled = busy || batchRunning;

  return (
    <main className="mx-auto max-w-[720px] space-y-4 p-6 text-zinc-900 dark:text-zinc-100">
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
            onClick={() => {
              setBatchSummary(null);
              void hunt(floor.id);
            }}
            disabled={oneActionDisabled || lowStamina}
            className="flex-1 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2.5 text-sm font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200 dark:hover:bg-emerald-900/40"
          >
            {batchRunning && batchProgress
              ? `${batchProgress.done}/${batchProgress.total} 처리 중…`
              : busy
                ? "사냥 중…"
                : "사냥 (스태미너 1)"}
          </button>
          <button
            type="button"
            onClick={() => setSettingsOpen((o) => !o)}
            disabled={batchRunning}
            aria-label="전투 설정"
            className="flex shrink-0 items-center justify-center rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-zinc-600 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            <Gear size={16} weight="duotone" />
          </button>
        </div>
        {settingsOpen && (
          <div className="mt-3 space-y-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">일괄 사냥</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void runBatch(5)}
                disabled={oneActionDisabled || lowStamina}
                className="flex-1 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200 dark:hover:bg-emerald-900/40"
              >
                5회 일괄
              </button>
              <button
                type="button"
                onClick={() => void runBatch(10)}
                disabled={oneActionDisabled || lowStamina}
                className="flex-1 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200 dark:hover:bg-emerald-900/40"
              >
                10회 일괄
              </button>
            </div>
          </div>
        )}
      </Card>

      {/* batch summary 가 우선 노출. 1회 사냥 결과(HuntResultCard) 는 summary 없을 때만. */}
      {batchSummary ? (
        <BatchSummaryCard summary={batchSummary} />
      ) : (
        lastResult && <HuntResultCard result={lastResult} />
      )}

      {showLevelupModal && (
        <TutorialOverlayInner
          title="레벨 업! 🎉"
          body={
            <>
              <p>새로운 레벨에 도달했습니다. 캐릭터가 더 강해졌어요.</p>
              <p>
                레벨업당 스탯 포인트 5점을 받습니다. <strong>훈련 탭</strong>
                에서 STR/DEX/VIT/SPD/LUK/INT 에 분배할 수 있어요.
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                계속 사냥해 다음 구역 입장 레벨까지 도달해보세요.
              </p>
            </>
          }
          dismissLabel="계속 사냥"
          onDismiss={() => setStoryFlag(TUTORIAL_V2_FIRST_LEVELUP)}
        />
      )}

      {/* 1회 사냥 replay — batch summary 표시 중에는 숨김(합산만 보길 원함). */}
      {!batchSummary && lastResult?.replay && (
        <ReplayBattleScene
          payload={lastResult.replay}
          startPlayerHp={lastResult.startPlayerHp}
          playerName={playerName}
          gender={playerGender}
          exp={lastResult.expForBar ?? 0}
          maxExp={lastResult.maxExpForBar ?? 1}
        />
      )}
    </main>
  );
}
