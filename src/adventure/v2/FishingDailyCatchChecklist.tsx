import { CheckCircle } from "@phosphor-icons/react";
import { FishingCatchItemIcon } from "./FishingCatchItemIcon";
import type { FishingCatchItemDailyProgress } from "./fishingStock";
import { SURFACE_INSET } from "@/components/ui/surfaces";

export function FishingDailyCatchChecklist({
  items,
}: {
  items: readonly FishingCatchItemDailyProgress[];
}) {
  return (
    <section
      aria-labelledby="fishing-daily-catch-checklist-title"
      className={`${SURFACE_INSET} mt-2 p-2.5`}
    >
      <div className="flex items-center justify-between gap-2">
        <h2
          id="fishing-daily-catch-checklist-title"
          className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-200"
        >
          요리 재료 일일 획득
        </h2>
        <span className="text-[10px] text-zinc-500 dark:text-zinc-400">
          매일 00:00 초기화
        </span>
      </div>
      <ul className="mt-1.5 grid gap-x-3 gap-y-1 sm:grid-cols-2">
        {items.map((item) => {
          const completed = item.awarded >= item.cap;
          return (
            <li
              key={item.itemId}
              className="flex min-w-0 items-center gap-1.5 border-t border-zinc-200 pt-1 text-[11px] first:border-t-0 first:pt-0 sm:[&:nth-child(2)]:border-t-0 sm:[&:nth-child(2)]:pt-0 dark:border-zinc-700"
            >
              <FishingCatchItemIcon itemId={item.itemId} size={14} />
              <span className="min-w-0 flex-1 truncate text-zinc-600 dark:text-zinc-300">
                {item.name}
              </span>
              <span className="shrink-0 tabular-nums font-semibold text-zinc-800 dark:text-zinc-100">
                {item.awarded.toLocaleString()} / {item.cap.toLocaleString()}
              </span>
              {completed ? (
                <span
                  aria-label={`${item.name} 완료`}
                  className="inline-flex shrink-0 items-center gap-0.5 font-semibold text-emerald-700 dark:text-emerald-400"
                >
                  <CheckCircle size={12} weight="fill" aria-hidden="true" />
                  완료
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
