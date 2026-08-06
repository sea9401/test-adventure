"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Compass, Gift, CaretRight, Circle } from "@phosphor-icons/react";
import { SURFACE_ACCENT, SURFACE_CARD } from "@/components/ui/surfaces";
import { isTutorialLine, type QuestView } from "@/adventure/data/v2/v2Quests";

// 홈 상단 배너 — 튜토리얼 우선.
//   미완료(진행중/받기) 튜토리얼 퀘가 있으면 그 목록을 체크리스트로 우선 노출(신규
//   플레이어가 쉬운 기초부터 바로 깨도록). 튜토리얼을 다 끝내면 기존처럼 "현재 목표"
//   하나만 안내. 둘 다 없으면 렌더 안 함. 클릭 → /quests.
export function GuideQuestBanner() {
  const router = useRouter();
  const [quests, setQuests] = useState<QuestView[]>([]);
  const [current, setCurrent] = useState<QuestView | null>(null);
  const [trackedQuestId, setTrackedQuestId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/v2/me/quests")
      .then((r) => r.json())
      .then(
        (
          j:
            | {
                ok?: boolean;
                quests?: QuestView[];
                current?: QuestView | null;
                trackedQuestId?: string | null;
              }
            | null,
        ) => {
          if (alive && j?.ok) {
            setQuests(Array.isArray(j.quests) ? j.quests : []);
            setCurrent(j.current ?? null);
            setTrackedQuestId(j.trackedQuestId ?? null);
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
    <CurrentGoalBanner
      current={current}
      tracked={current.id === trackedQuestId}
      onOpen={() => router.push("/quests?tab=achievement")}
    />
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
      className={`${SURFACE_CARD} ui-quest-card flex w-full flex-col gap-2 border-emerald-300 px-4 py-3 text-left transition hover:bg-emerald-50 dark:border-emerald-800 dark:hover:bg-emerald-950 ${
        claimableCount > 0 ? "is-claimable" : ""
      }`}
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

export function CurrentGoalBanner({
  current,
  tracked = false,
  onOpen,
}: {
  current: QuestView;
  tracked?: boolean;
  onOpen: () => void;
}) {
  const claimable = current.status === "claimable";
  const hasProgress = current.progress != null && current.goal != null;
  const progress = hasProgress
    ? Math.min(current.progress ?? 0, current.goal ?? 0)
    : 0;
  const progressPct = hasProgress
    ? Math.min(100, (progress / Math.max(1, current.goal ?? 1)) * 100)
    : 0;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`${claimable ? SURFACE_ACCENT : SURFACE_CARD} ui-quest-card ${claimable ? "is-claimable" : ""} flex w-full items-center gap-3 px-4 py-3 text-left transition ${
        claimable
          ? "hover:bg-amber-100 dark:border-amber-800 dark:hover:bg-amber-900"
          : "border-emerald-300 hover:bg-emerald-50 dark:border-emerald-800 dark:hover:bg-emerald-950"
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
          {tracked && (
            <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold text-sky-700 dark:bg-sky-950 dark:text-sky-300">
              추적 중
            </span>
          )}
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
          {claimable
            ? "완료 — 보상을 받으세요"
            : hasProgress
              ? `${progress.toLocaleString("ko-KR")} / ${(current.goal ?? 0).toLocaleString("ko-KR")} · ${current.desc}`
              : current.desc}
        </p>
        {!claimable && hasProgress && (
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
            <div
              className="h-full rounded-full bg-emerald-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        )}
      </div>
      <CaretRight
        size={16}
        className="shrink-0 text-zinc-400 dark:text-zinc-600"
      />
    </button>
  );
}
