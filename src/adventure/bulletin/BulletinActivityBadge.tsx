import type { BulletinActivitySummary } from "@/lib/bulletinActivity";

export function BulletinActivityBadge({
  activity,
  showTitle = false,
}: {
  activity: BulletinActivitySummary;
  showTitle?: boolean;
}) {
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-full border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
      title={`게시판 Lv.${activity.level} ${activity.title}`}
    >
      Lv.{activity.level}
      {showTitle ? ` ${activity.title}` : ""}
    </span>
  );
}
