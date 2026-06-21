"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Compass, Gift, CaretRight, Circle } from "@phosphor-icons/react";
import { isTutorialLine, type QuestView } from "@/adventure/data/v2/v2Quests";

// 홈 상단 배너 — 튜토리얼 우선.
//   미완료(진행중/받기) 튜토리얼 퀘가 있으면 그 목록을 체크리스트로 우선 노출(신규
//   플레이어가 쉬운 기초부터 바로 깨도록). 튜토리얼을 다 끝내면 기존처럼 "현재 목표"
//   하나만 안내. 둘 다 없으면 렌더 안 함. 클릭 → /quests.
export function GuideQuestBanner() {
  const router = useRouter();
  const [quests, setQuests] = useState<QuestView[]>([]);
  const [current, setCurrent] = useState<QuestView | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/v2/me/quests")
      .then((r) => r.json())
      .then(
        (
          j:
            | { ok?: boolean; quests?: QuestView[]; current?: QuestView | null }
            | null,
        ) => {
          if (alive && j?.ok) {
            setQuests(Array.isArray(j.quests) ? j.quests : []);
            setCurrent(j.current ?? null);
          }
        },
      )
      .catch(() => {})
      .finally(() => {
        if (alive) setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  if (!loaded) return null;

  // 미완료(진행중/받기) 튜토리얼 — 받기(claimable) 먼저.
  const tutorialTodo = quests
    .filter(
      (q) =>
        isTutorialLine(q.line) &&
        (q.status === "active" || q.status === "claimable"),
    )
    .sort(
      (a, b) =>
        (a.status === "claimable" ? 0 : 1) - (b.status === "claimable" ? 0 : 1),
    );

  if (tutorialTodo.length > 0) {
    return (
      <TutorialChecklist
        items={tutorialTodo}
        onOpen={() => router.push("/quests?tab=tutorial")}
      />
    );
  }

  // 튜토리얼 완료 — 기존 단일 "현재 목표" 배너.
  if (!current) return null;
  return (
    <CurrentGoalBanner current={current} onOpen={() => router.push("/quests")} />
  );
}

const MAX_SHOWN = 5;

function TutorialChecklist({
  items,
  onOpen,
}: {
  items: QuestView[];
  onOpen: () => void;
}) {
  const shown = items.slice(0, MAX_SHOWN);
  const extra = items.length - shown.length;
  const claimableCount = items.filter((q) => q.status === "claimable").length;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full flex-col gap-2 rounded-md border border-emerald-300 bg-emerald-50 px-4 py-3 text-left transition hover:bg-emerald-100 dark:border-emerald-800/60 dark:bg-emerald-950/30 dark:hover:bg-emerald-950/50"
    >
      <div className="flex items-center gap-2">
        <Compass
          size={18}
          weight="fill"
          className="shrink-0 text-emerald-500"
        />
        <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          튜토리얼
        </span>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          남은 {items.length}개
        </span>
        {claimableCount > 0 && (
          <span className="rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
            받기 {claimableCount}
          </span>
        )}
        <CaretRight
          size={16}
          className="ml-auto shrink-0 text-zinc-400 dark:text-zinc-600"
        />
      </div>
      <ul className="space-y-1">
        {shown.map((q) => (
          <li key={q.id} className="flex items-center gap-2 text-sm">
            {q.status === "claimable" ? (
              <Gift
                size={15}
                weight="fill"
                className="shrink-0 text-amber-500"
              />
            ) : (
              <Circle
                size={14}
                className="shrink-0 text-zinc-400 dark:text-zinc-600"
              />
            )}
            <span className="truncate text-zinc-700 dark:text-zinc-200">
              {q.title}
            </span>
            {q.status === "claimable" && (
              <span className="shrink-0 text-[10px] font-bold text-amber-600 dark:text-amber-400">
                완료
              </span>
            )}
          </li>
        ))}
        {extra > 0 && (
          <li className="text-xs text-zinc-500 dark:text-zinc-400">
            외 {extra}개 더…
          </li>
        )}
      </ul>
    </button>
  );
}

function CurrentGoalBanner({
  current,
  onOpen,
}: {
  current: QuestView;
  onOpen: () => void;
}) {
  const claimable = current.status === "claimable";
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`flex w-full items-center gap-3 rounded-md border px-4 py-3 text-left transition ${
        claimable
          ? "border-amber-300 bg-amber-50 hover:bg-amber-100 dark:border-amber-700/60 dark:bg-amber-950/40 dark:hover:bg-amber-950/60"
          : "border-emerald-300 bg-emerald-50 hover:bg-emerald-100 dark:border-emerald-800/60 dark:bg-emerald-950/30 dark:hover:bg-emerald-950/50"
      }`}
    >
      {claimable ? (
        <Gift size={20} weight="fill" className="shrink-0 text-amber-500" />
      ) : (
        <Compass size={20} weight="fill" className="shrink-0 text-emerald-500" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            퀘스트
          </span>
          {claimable && (
            <span className="rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
              보상 받기
            </span>
          )}
        </div>
        <p className="truncate text-sm font-semibold text-zinc-800 dark:text-zinc-100">
          {current.title}
        </p>
        <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
          {claimable ? "완료 — 보상을 받으세요" : current.desc}
        </p>
      </div>
      <CaretRight
        size={16}
        className="shrink-0 text-zinc-400 dark:text-zinc-600"
      />
    </button>
  );
}
