"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Compass, Gift, CaretRight, Circle } from "@phosphor-icons/react";
import {
  SURFACE_ACCENT,
  SURFACE_CARD,
  SURFACE_INSET,
} from "@/components/ui/surfaces";
import { isTutorialLine, type QuestView } from "@/adventure/data/v2/v2Quests";
import { isGrowthPassLine } from "@/adventure/data/v2/growthPass";
import type {
  RepeatBundleView,
  RepeatScope,
} from "@/adventure/data/v2/v2RepeatQuests";

type RepeatRewardSummary = {
  dailyBundle: RepeatBundleView;
  weeklyBundle: RepeatBundleView;
};

export type HomeGuidePlan = {
  /** 남은 기초 튜토리얼(받기 먼저). 성장 패스 단계는 넣지 않는다. */
  tutorialTodo: QuestView[];
  /** 지금 받을 수 있는 성장 패스 단계. */
  passClaimable: QuestView[];
  /** 목표 카드에 올릴 항목. 튜토리얼이 남아 있으면 없다. */
  goal: QuestView | null;
};

/** 진행 중인 목표 가운데 달성에 가장 가까운 것. 진행도가 없는 목표는 맨 뒤로 본다. */
function closestToDone(active: readonly QuestView[]): QuestView | null {
  let best: QuestView | null = null;
  let bestRatio = -1;
  for (const quest of active) {
    const ratio =
      quest.progress != null && quest.goal
        ? Math.min(1, quest.progress / quest.goal)
        : 0;
    if (ratio > bestRatio) {
      best = quest;
      bestRatio = ratio;
    }
  }
  return best;
}

/**
 * 홈에 무엇을 올릴지 정한다.
 * 성장 패스는 받을 단계가 있으면 늘 알리고, 없으면 진행 중인 단계를 목표로 보여 준다.
 * 플레이어가 직접 추적한 업적은 진행 중인 단계보다 먼저다.
 */
export function homeGuidePlan(
  quests: readonly QuestView[],
  current: QuestView | null,
  trackedQuestId: string | null,
): HomeGuidePlan {
  const isPass = (q: QuestView) => isGrowthPassLine(q.line);
  const tutorialTodo = quests
    .filter(
      (q) =>
        isTutorialLine(q.line) &&
        !isPass(q) &&
        (q.status === "active" || q.status === "claimable"),
    )
    .sort(
      (a, b) =>
        (a.status === "claimable" ? 0 : 1) - (b.status === "claimable" ? 0 : 1),
    );
  const passClaimable = quests.filter(
    (q) => isPass(q) && q.status === "claimable",
  );
  if (tutorialTodo.length > 0) {
    return { tutorialTodo, passClaimable, goal: null };
  }
  const tracked = current && current.id === trackedQuestId ? current : null;
  const passActive =
    passClaimable.length === 0
      ? closestToDone(quests.filter((q) => isPass(q) && q.status === "active"))
      : null;
  const recommended = current && !isPass(current) ? current : null;
  return {
    tutorialTodo,
    passClaimable,
    goal: tracked ?? passActive ?? recommended,
  };
}

// 홈 상단 배너 — 수령 가능한 일일·주간 보상을 먼저 알리고 기존 가이드 배너를 이어서 노출.
//   미완료(진행중/받기) 튜토리얼은 체크리스트로, 튜토리얼을 다 끝내면 "현재 목표"
//   업적 하나를 안내한다. 아무 알림도 없으면 렌더하지 않는다.
export function GuideQuestBanner() {
  const router = useRouter();
  const [quests, setQuests] = useState<QuestView[]>([]);
  const [current, setCurrent] = useState<QuestView | null>(null);
  const [repeat, setRepeat] = useState<RepeatRewardSummary | null>(null);
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
                repeat?: RepeatRewardSummary;
                trackedQuestId?: string | null;
              }
            | null,
        ) => {
          if (alive && j?.ok) {
            setQuests(Array.isArray(j.quests) ? j.quests : []);
            setCurrent(j.current ?? null);
            setRepeat(j.repeat ?? null);
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

  const { tutorialTodo, passClaimable, goal } = homeGuidePlan(
    quests,
    current,
    trackedQuestId,
  );

  const repeatRewardReady =
    repeat?.dailyBundle.claimable === true ||
    repeat?.weeklyBundle.claimable === true;
  const repeatRewardBanner = repeatRewardReady ? (
    <RepeatRewardBanner
      daily={repeat?.dailyBundle}
      weekly={repeat?.weeklyBundle}
      onOpen={(scope) => router.push(`/quests?tab=${scope}`)}
    />
  ) : null;

  let guideBanner = null;
  if (tutorialTodo.length > 0) {
    guideBanner = (
      <TutorialChecklist
        items={tutorialTodo}
        onOpen={() => router.push("/quests?tab=tutorial")}
      />
    );
  } else if (goal) {
    const pass = isGrowthPassLine(goal.line);
    guideBanner = (
      <CurrentGoalBanner
        current={goal}
        tracked={goal.id === trackedQuestId}
        label={pass ? "성장 패스" : undefined}
        onOpen={() =>
          router.push(pass ? "/quests?tab=tutorial" : "/quests?tab=achievement")
        }
      />
    );
  }
  const passBanner =
    passClaimable.length > 0 ? (
      <GrowthPassRewardBanner
        items={passClaimable}
        onOpen={() => router.push("/quests?tab=tutorial")}
      />
    ) : null;

  if (!repeatRewardBanner && !passBanner && !guideBanner) return null;
  return (
    <div className="space-y-2">
      {repeatRewardBanner}
      {passBanner}
      {guideBanner}
    </div>
  );
}

export function RepeatRewardBanner({
  daily,
  weekly,
  onOpen,
}: {
  daily?: RepeatBundleView;
  weekly?: RepeatBundleView;
  onOpen: (scope: RepeatScope) => void;
}) {
  const ready = [daily, weekly].filter(
    (bundle): bundle is RepeatBundleView => bundle?.claimable === true,
  );
  if (ready.length === 0) return null;

  return (
    <section
      className={`${SURFACE_ACCENT} ui-quest-card is-claimable space-y-2.5 p-3`}
      aria-label="받을 수 있는 퀘스트 보상"
    >
      <div className="flex items-center gap-2 px-1">
        <Gift size={18} weight="fill" className="shrink-0 text-amber-500" />
        <strong className="text-sm text-zinc-900 dark:text-zinc-100">
          받을 수 있는 퀘스트 보상
        </strong>
        <span className="rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
          수령 가능 {ready.length}
        </span>
      </div>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {ready.map((bundle) => {
          const label = bundle.scope === "daily" ? "일일" : "주간";
          return (
            <button
              key={bundle.scope}
              type="button"
              aria-label={`${label} 보상 받으러 가기`}
              onClick={() => onOpen(bundle.scope)}
              className={`${SURFACE_INSET} flex items-center gap-3 px-3 py-2.5 text-left transition hover:border-amber-400 dark:hover:border-amber-700`}
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                  {label} 보상
                </p>
                <p className="text-xs text-zinc-600 dark:text-zinc-300">
                  스태미나 포션 {bundle.potions}개
                </p>
              </div>
              <span className="shrink-0 text-[11px] font-bold text-amber-700 dark:text-amber-300">
                받으러 가기
              </span>
              <CaretRight
                size={15}
                className="shrink-0 text-amber-500"
                aria-hidden
              />
            </button>
          );
        })}
      </div>
    </section>
  );
}

/** 받을 수 있는 성장 패스 목표. 누르면 퀘스트의 튜토리얼 탭으로 간다. */
export function GrowthPassRewardBanner({
  items,
  onOpen,
}: {
  items: readonly QuestView[];
  onOpen: () => void;
}) {
  if (items.length === 0) return null;
  const rest = items.length - 1;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`${SURFACE_ACCENT} ui-quest-card is-claimable flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-amber-100 dark:hover:bg-amber-900`}
    >
      <Gift size={20} weight="fill" className="shrink-0 text-amber-500" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
          성장 패스
        </p>
        <p className="truncate text-sm font-semibold text-zinc-800 dark:text-zinc-100">
          받을 수 있는 목표 보상 {items.length}개
        </p>
        <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
          {rest > 0 ? `${items[0].title} 외 ${rest}개` : items[0].title}
        </p>
      </div>
      <CaretRight
        size={16}
        className="shrink-0 text-zinc-400 dark:text-zinc-600"
        aria-hidden
      />
    </button>
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
  label = "퀘스트",
  onOpen,
}: {
  current: QuestView;
  tracked?: boolean;
  /** 카드 머리의 분류 이름. */
  label?: string;
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
            {label}
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
            ? "완료! 보상을 받으세요"
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
