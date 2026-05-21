"use client";

import { Card } from "@/components/ui/Card";
import { useChapterProgress } from "@/adventure/story/useChapterProgress";
import type { ChapterStatus } from "@/adventure/story/useChapterProgress";

const ACT_LABELS: Record<1 | 2 | 3 | 4 | 5 | 6, string> = {
  1: "1막 — 평범한 모험가",
  2: "2막 — 세 봉인",
  3: "3막 — 노룡의 유언",
  4: "4막 — 옥좌의 길",
  5: "5막 — 빈 옥좌의 시대",
  6: "6막 — 별을 잊은 것",
};

// 다크/라이트 양쪽에서 읽히도록 light 톤(zinc-700/800, emerald-700/800, amber-700/800)
// 과 dark 톤을 짝지어 둔다. 원래는 다크 전용 톤만 있어 라이트 모드에서 글이 안 보였다.
const STATUS_STYLE: Record<
  ChapterStatus,
  { badge: string; badgeText: string; titleClass: string; summaryClass: string }
> = {
  completed: {
    badge:
      "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700/40 dark:bg-emerald-600/20 dark:text-emerald-300",
    badgeText: "완료",
    titleClass: "text-emerald-700 dark:text-emerald-200",
    summaryClass: "text-zinc-700 dark:text-zinc-300",
  },
  current: {
    badge:
      "border-amber-400 bg-amber-50 text-amber-800 dark:border-amber-600/40 dark:bg-amber-500/20 dark:text-amber-200",
    badgeText: "진행 중",
    titleClass: "text-amber-800 dark:text-amber-100",
    summaryClass: "text-zinc-800 dark:text-zinc-200",
  },
  future: {
    badge:
      "border-zinc-300 bg-zinc-100 text-zinc-600 dark:border-zinc-700/60 dark:bg-zinc-700/40 dark:text-zinc-400",
    badgeText: "예정",
    titleClass: "text-zinc-500 dark:text-zinc-400",
    summaryClass: "text-zinc-500 dark:text-zinc-500",
  },
  tbd: {
    badge:
      "border-zinc-300 bg-zinc-100 text-zinc-500 dark:border-zinc-700/60 dark:bg-zinc-800/60 dark:text-zinc-500",
    badgeText: "준비 중",
    titleClass: "text-zinc-400 dark:text-zinc-500",
    summaryClass: "text-zinc-500 dark:text-zinc-600",
  },
};

export function StoryTab() {
  const { entries, currentChapter, completedCount, totalCount } =
    useChapterProgress();

  // 막별로 그룹화 — 1, 2, 3, 4, 5, 6 순서로 항상 표시.
  const acts: (1 | 2 | 3 | 4 | 5 | 6)[] = [1, 2, 3, 4, 5, 6];

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            메인 스토리 — 옥좌의 부름
          </h2>
          <span className="text-sm text-zinc-600 dark:text-zinc-400">
            {completedCount} / {totalCount}
          </span>
        </div>
        {currentChapter ? (
          <p className="mt-2 text-sm text-amber-700 dark:text-amber-200">
            지금: Ch.{currentChapter.number} {currentChapter.title}
          </p>
        ) : completedCount === totalCount ? (
          <p className="mt-2 text-sm text-emerald-700 dark:text-emerald-300">
            모든 챕터를 마쳤다. 옥좌의 주재 너머로.
          </p>
        ) : (
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-500">
            현재 진행 중인 챕터 없음 — 다음 콘텐츠 준비 중.
          </p>
        )}
      </Card>

      {acts.map((act) => {
        const actEntries = entries.filter((e) => e.chapter.act === act);
        if (actEntries.length === 0) return null;
        return (
          <div key={act} className="flex flex-col gap-2">
            <h3 className="px-1 text-sm font-semibold text-zinc-700 dark:text-zinc-400">
              {ACT_LABELS[act]}
            </h3>
            <div className="flex flex-col gap-2">
              {actEntries.map(({ chapter, status }) => {
                const style = STATUS_STYLE[status];
                return (
                  <Card
                    key={chapter.number}
                    className={`p-3 ${
                      status === "current"
                        ? "ring-1 ring-amber-500/40"
                        : ""
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-baseline gap-2">
                          <span className="text-xs text-zinc-500 dark:text-zinc-500">
                            Ch.{chapter.number}
                          </span>
                          <h4
                            className={`text-sm font-medium ${style.titleClass}`}
                          >
                            {chapter.title}
                          </h4>
                        </div>
                        <p className={`mt-1 text-xs ${style.summaryClass}`}>
                          {status === "future" || status === "tbd"
                            ? // 스포일러 방지 — 아직 도달 못한 챕터의 요약은 숨김.
                              status === "tbd"
                              ? "후속 업데이트에서 공개됩니다."
                              : "···"
                            : chapter.summary}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded border px-2 py-0.5 text-[10px] ${style.badge}`}
                      >
                        {style.badgeText}
                      </span>
                    </div>
                    {status === "completed" && chapter.memory && (
                      <div className="mt-2 border-t border-zinc-200 pt-2 dark:border-zinc-800">
                        <p className="whitespace-pre-line text-xs italic leading-relaxed text-zinc-600 dark:text-zinc-400">
                          {chapter.memory}
                        </p>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
