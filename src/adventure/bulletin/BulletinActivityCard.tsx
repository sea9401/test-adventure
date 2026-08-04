import { Card } from "@/components/ui/Card";
import { SURFACE_INSET } from "@/components/ui/surfaces";
import type { BulletinActivitySummary } from "@/lib/bulletinActivity";
import { BulletinActivityBadge } from "./BulletinActivityBadge";

export function BulletinActivityCard({
  activity,
}: {
  activity: BulletinActivitySummary;
}) {
  const progressLabel =
    activity.nextLevelPoints == null
      ? "최고 레벨"
      : `${activity.points} / ${activity.nextLevelPoints}점`;

  return (
    <Card padding="sm" className="space-y-2 shadow-none">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-100">
          내 게시판 활동
        </span>
        <BulletinActivityBadge activity={activity} showTitle />
        <span className="ml-auto text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400">
          {progressLabel}
        </span>
      </div>
      <div
        className={`${SURFACE_INSET} h-2 overflow-hidden border-0`}
        role="progressbar"
        aria-label="게시판 다음 레벨 진행도"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={activity.progressPct}
      >
        <div
          className="h-full rounded-full bg-amber-500 transition-[width]"
          style={{ width: `${activity.progressPct}%` }}
        />
      </div>
      <details className="text-[11px] text-zinc-500 dark:text-zinc-400">
        <summary className="cursor-pointer select-none">점수 기준</summary>
        <p className="mt-1 leading-relaxed">
          글 3점(하루 2개) · 각 글에 남긴 첫 댓글 1점(하루 5개) · 다른
          이용자에게 받은 좋아요 4점
        </p>
      </details>
    </Card>
  );
}
