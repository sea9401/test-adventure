"use client";

import { useEffect, useState } from "react";
import { Gear } from "@phosphor-icons/react";
import { Card } from "@/components/ui/Card";
import { HuntResultCard } from "@/adventure/v2/HuntResultCard";
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
import type { DungeonFloorId } from "@/adventure/data/v2/types";
import type { Gender } from "@/adventure/profile/avatars";

// 한 층 전용 던전 페이지. 사냥 버튼 + 전투 설정(연속 N회) + 결과 replay/card.
// 옛 무한 자동 토글은 폐기. 대신 ⚙ 전투 설정에서 5/10회 연속 사냥 옵션.

const MULTI_DELAY_MS = 600;

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
  // 연속 사냥 — multiTotal 회 만큼 자동 hunt. multiDone 진행 카운트.
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [multiTotal, setMultiTotal] = useState(0);
  const [multiDone, setMultiDone] = useState(0);
  const [multiMsg, setMultiMsg] = useState<string | null>(null);
  const multiActive = multiTotal > multiDone;

  // 진입 후크 — 첫 레벨업 모달만 1회성 (storyFlags). 드랍 배너는 매 사냥마다
  // HuntResultCard 가 result 자체에서 자동 표시 (2026-05-28 변경).
  const { state: storyFlags, set: setStoryFlag } = useStoryFlags();

  // 첫 레벨업 모달 — controlled 마운트. 같은 useStoryFlags 인스턴스로 shown/dismiss
  // 처리해 TutorialOverlay (uncontrolled) 의 별 인스턴스 PATCH race 차단.
  const showLevelupModal =
    !!lastResult &&
    lastResult.levelsGained > 0 &&
    storyFlags.flags.includes(TUTORIAL_ENABLED_FLAG) &&
    !storyFlags.flags.includes(TUTORIAL_V2_FIRST_LEVELUP);

  // 사냥 결과 도착 → multiDone += 1. 다음 useEffect 가 multiActive 재평가.
  useEffect(() => {
    if (!lastResult) return;
    if (multiTotal === 0) return;
    setMultiDone((d) => d + 1);
  }, [lastResult, multiTotal]);

  // 연속 사냥 트리거 — busy 아님 + stamina 충분 + 모달 안 떠있으면 다음 hunt.
  // 옛 자동 토글 자리를 횟수 제한으로 대체. showLevelupModal 동안 일시정지.
  useEffect(() => {
    if (!multiActive) return;
    if (busy) return;
    if (!floor) return;
    if (showLevelupModal) return;
    if (stamina.current < HUNT_COST) {
      setMultiTotal(0);
      setMultiDone(0);
      setMultiMsg("스태미너 부족 — 연속 사냥 중지.");
      return;
    }
    setMultiMsg(null);
    const id = setTimeout(() => void hunt(floor.id), MULTI_DELAY_MS);
    return () => clearTimeout(id);
  }, [multiActive, busy, stamina.current, hunt, floor, showLevelupModal]);

  const startMulti = (n: number) => {
    setMultiTotal(n);
    setMultiDone(0);
    setMultiMsg(null);
    setSettingsOpen(false);
  };
  const cancelMulti = () => {
    setMultiTotal(0);
    setMultiDone(0);
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
          알 수 없는 층입니다.
        </div>
      </main>
    );
  }

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
            onClick={() => hunt(floor.id)}
            disabled={busy || multiActive}
            className="flex-1 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2.5 text-sm font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200 dark:hover:bg-emerald-900/40"
          >
            {busy
              ? "사냥 중…"
              : multiActive
                ? `${multiDone + 1}/${multiTotal} 진행 중`
                : "사냥 (스태미너 1)"}
          </button>
          <button
            type="button"
            onClick={() => setSettingsOpen((o) => !o)}
            aria-label="전투 설정"
            className="flex shrink-0 items-center justify-center rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            <Gear size={16} weight="duotone" />
          </button>
        </div>
        {settingsOpen && (
          <div className="mt-3 space-y-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">연속 전투</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => startMulti(5)}
                disabled={busy || multiActive}
                className="flex-1 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200 dark:hover:bg-emerald-900/40"
              >
                5회 연속
              </button>
              <button
                type="button"
                onClick={() => startMulti(10)}
                disabled={busy || multiActive}
                className="flex-1 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200 dark:hover:bg-emerald-900/40"
              >
                10회 연속
              </button>
            </div>
          </div>
        )}
        {multiActive && (
          <div className="mt-2 flex items-center justify-between gap-2">
            <p className="text-xs text-emerald-600 dark:text-emerald-400">
              연속 사냥 {multiDone}/{multiTotal}
            </p>
            <button
              type="button"
              onClick={cancelMulti}
              className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            >
              중지
            </button>
          </div>
        )}
        {multiMsg && (
          <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
            {multiMsg}
          </p>
        )}
      </Card>

      {lastResult && <HuntResultCard result={lastResult} />}

      {/* 첫 레벨업 모달 — controlled. 같은 useStoryFlags 인스턴스로 dismiss 처리해
          PATCH race 차단. 자동전투 effect 도 showLevelupModal 동안 일시정지. */}
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
                계속 사냥해 다음 층 입장 레벨까지 도달해보세요.
              </p>
            </>
          }
          dismissLabel="계속 사냥"
          onDismiss={() => setStoryFlag(TUTORIAL_V2_FIRST_LEVELUP)}
        />
      )}

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
    </main>
  );
}
