import Link from "next/link";
import { ArrowRight, ChartBar } from "@phosphor-icons/react";
import { Card } from "@/components/ui/Card";
import { SURFACE_INSET } from "@/components/ui/surfaces";

export function LifeMasterySummaryCard({
  level,
  maxLevel,
}: {
  level: number;
  maxLevel: number;
}) {
  const progress = Math.min(100, (level / Math.max(1, maxLevel)) * 100);

  return (
    <Card padding="md">
      <div className="flex items-start gap-3">
        <div
          className={`${SURFACE_INSET} flex size-10 shrink-0 items-center justify-center text-emerald-600 dark:text-emerald-400`}
        >
          <ChartBar size={24} weight="duotone" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <div>
              <h2 className="text-sm font-semibold">생활 기록</h2>
              <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                농사·벌목·채광·낚시·요리 합산
              </p>
            </div>
            <div className="font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
              {level}
              <span className="text-xs font-normal text-zinc-500 dark:text-zinc-400">
                {" "}/ {maxLevel}
              </span>
            </div>
          </div>
          <div
            className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700"
            role="progressbar"
            aria-label="생활 숙련도"
            aria-valuemin={0}
            aria-valuemax={maxLevel}
            aria-valuenow={level}
          >
            <div
              className="h-full rounded-full bg-emerald-600 dark:bg-emerald-400"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>
      <Link
        href="/character/life"
        className="mt-3 inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-md border border-zinc-300 px-3 py-2 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
      >
        자세히 보기
        <ArrowRight size={16} aria-hidden />
      </Link>
    </Card>
  );
}
