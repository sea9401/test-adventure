import { ArrowRight, Check } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import type {
  ReferralTutorialProgressTaskId,
  ReferralTutorialTask,
} from "@/adventure/data/v2/referralTutorial";
import { SURFACE_INSET } from "@/components/ui/surfaces";

type ReferralTutorialRoadmapProps = {
  tasks: readonly ReferralTutorialTask[];
  signupRewarded: boolean;
  completedTaskIds: readonly ReferralTutorialProgressTaskId[];
  showActions?: boolean;
};

export function ReferralTutorialRoadmap({
  tasks,
  signupRewarded,
  completedTaskIds,
  showActions = false,
}: ReferralTutorialRoadmapProps) {
  const completedIds = new Set<string>(completedTaskIds);
  const completedCount = tasks.filter((task) =>
    task.id === "signup" ? signupRewarded : completedIds.has(task.id),
  ).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-bold">튜토리얼 로드맵</p>
        <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
          {completedCount}/{tasks.length} 완료
        </p>
      </div>
      <ol className="space-y-2">
        {tasks.map((task, index) => {
          const completed =
            task.id === "signup" ? signupRewarded : completedIds.has(task.id);
          return (
            <li
              key={task.id}
              className={`${SURFACE_INSET} grid grid-cols-[auto_minmax(0,1fr)] gap-3 p-3`}
            >
              <span
                aria-label={completed ? `${index + 1}단계 완료` : `${index + 1}단계`}
                className={[
                  "flex size-8 shrink-0 items-center justify-center rounded-full border text-sm font-bold",
                  completed
                    ? "border-emerald-600 bg-emerald-600 text-white dark:border-emerald-500 dark:bg-emerald-600"
                    : "border-zinc-300 bg-white text-zinc-600 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200",
                ].join(" ")}
              >
                {completed ? <Check size={17} weight="bold" /> : index + 1}
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                      {task.title}
                    </p>
                    <p className="mt-0.5 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                      {task.description}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs font-semibold text-amber-700 dark:text-amber-300">
                    양쪽 회복약 {task.staminaPotionsPerUser}개
                  </span>
                </div>
                {showActions && !completed && task.href ? (
                  <Link
                    href={task.href}
                    className="mt-2 inline-flex min-h-8 items-center gap-1 rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
                  >
                    바로가기
                    <ArrowRight size={14} weight="bold" />
                  </Link>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
