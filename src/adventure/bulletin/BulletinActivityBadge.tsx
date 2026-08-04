import type { BulletinActivitySummary } from "@/lib/bulletinActivity";

const LEVEL_BADGE_CLASS = [
  "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-200",
  "border-teal-300 bg-teal-50 text-teal-800 dark:border-teal-700 dark:bg-teal-950 dark:text-teal-200",
  "border-cyan-300 bg-cyan-50 text-cyan-800 dark:border-cyan-700 dark:bg-cyan-950 dark:text-cyan-200",
  "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-700 dark:bg-sky-950 dark:text-sky-200",
  "border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-200",
  "border-indigo-300 bg-indigo-50 text-indigo-800 dark:border-indigo-700 dark:bg-indigo-950 dark:text-indigo-200",
  "border-violet-300 bg-violet-50 text-violet-800 dark:border-violet-700 dark:bg-violet-950 dark:text-violet-200",
  "border-fuchsia-300 bg-fuchsia-50 text-fuchsia-800 dark:border-fuchsia-700 dark:bg-fuchsia-950 dark:text-fuchsia-200",
  "border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-700 dark:bg-rose-950 dark:text-rose-200",
  "border-amber-400 bg-amber-100 text-amber-900 dark:border-amber-600 dark:bg-amber-950 dark:text-amber-100",
] as const;

export function bulletinActivityBadgeClass(level: number): string {
  const normalized = Number.isFinite(level)
    ? Math.min(LEVEL_BADGE_CLASS.length, Math.max(1, Math.floor(level)))
    : 1;
  return LEVEL_BADGE_CLASS[normalized - 1];
}

export function BulletinActivityBadge({
  activity,
  showTitle = false,
}: {
  activity: BulletinActivitySummary;
  showTitle?: boolean;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${bulletinActivityBadgeClass(activity.level)}`}
      title={`게시판 Lv.${activity.level} ${activity.title}`}
    >
      Lv.{activity.level}
      {showTitle ? ` ${activity.title}` : ""}
    </span>
  );
}
