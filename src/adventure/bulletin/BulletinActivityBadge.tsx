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
  "border-emerald-500 bg-emerald-100 text-emerald-950 ring-1 ring-emerald-300 dark:border-emerald-500 dark:bg-emerald-900 dark:text-emerald-100 dark:ring-emerald-700",
  "border-teal-500 bg-teal-100 text-teal-950 ring-1 ring-teal-300 dark:border-teal-500 dark:bg-teal-900 dark:text-teal-100 dark:ring-teal-700",
  "border-cyan-500 bg-cyan-100 text-cyan-950 ring-1 ring-cyan-300 dark:border-cyan-500 dark:bg-cyan-900 dark:text-cyan-100 dark:ring-cyan-700",
  "border-sky-500 bg-sky-100 text-sky-950 ring-1 ring-sky-300 dark:border-sky-500 dark:bg-sky-900 dark:text-sky-100 dark:ring-sky-700",
  "border-blue-500 bg-blue-100 text-blue-950 ring-1 ring-blue-300 dark:border-blue-500 dark:bg-blue-900 dark:text-blue-100 dark:ring-blue-700",
  "border-indigo-500 bg-indigo-100 text-indigo-950 ring-1 ring-indigo-300 dark:border-indigo-500 dark:bg-indigo-900 dark:text-indigo-100 dark:ring-indigo-700",
  "border-violet-500 bg-violet-100 text-violet-950 ring-1 ring-violet-300 dark:border-violet-500 dark:bg-violet-900 dark:text-violet-100 dark:ring-violet-700",
  "border-fuchsia-500 bg-fuchsia-100 text-fuchsia-950 ring-1 ring-fuchsia-300 dark:border-fuchsia-500 dark:bg-fuchsia-900 dark:text-fuchsia-100 dark:ring-fuchsia-700",
  "border-rose-500 bg-rose-100 text-rose-950 ring-1 ring-rose-300 dark:border-rose-500 dark:bg-rose-900 dark:text-rose-100 dark:ring-rose-700",
  "border-amber-500 bg-amber-200 text-amber-950 ring-2 ring-amber-300 shadow-sm dark:border-amber-400 dark:bg-amber-900 dark:text-amber-50 dark:ring-amber-600",
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
