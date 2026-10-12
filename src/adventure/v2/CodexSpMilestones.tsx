import { codexSpMilestoneProgress } from "./codexProgress";

// 장비 도감·어보 공용 — 등록 수 기준 SP 단계. 받은 단계 / 다음 단계 / 남은 단계를 구분해 보여 준다.
export function codexNextSpLabel(
  count: number,
  milestones: readonly number[],
  completeLabel: string,
): string {
  const { next, remaining } = codexSpMilestoneProgress(count, milestones);
  if (next === null || remaining === null) return completeLabel;
  return `다음 SP까지 ${remaining}종 (${next}종 달성)`;
}

export function CodexSpMilestones({
  count,
  milestones,
}: {
  count: number;
  milestones: readonly number[];
}) {
  if (milestones.length === 0) return null;
  const progress = codexSpMilestoneProgress(count, milestones);
  return (
    <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs">
      <span className="font-semibold text-zinc-600 dark:text-zinc-300">
        SP 단계 {progress.earned}/{progress.total}
      </span>
      <ol
        aria-label="SP 지급 기준 등록 수"
        className="flex flex-wrap gap-x-2 gap-y-1 tabular-nums"
      >
        {milestones.map((need) => {
          const state =
            count >= need ? "earned" : need === progress.next ? "next" : "locked";
          return (
            <li
              key={need}
              data-sp-milestone={state}
              className={
                state === "earned"
                  ? "text-emerald-700 dark:text-emerald-300"
                  : state === "next"
                    ? "font-semibold text-amber-700 dark:text-amber-300"
                    : "text-zinc-400 dark:text-zinc-500"
              }
            >
              {state === "earned" ? "✓" : ""}
              {need}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
