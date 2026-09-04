import { SURFACE_INSET } from "@/components/ui/surfaces";

export function TrackingThreatMeter({
  value,
  max,
}: {
  value: number;
  max: number;
}) {
  const safeMax = Math.max(0, Math.floor(max));
  if (safeMax <= 0) return null;
  const safeValue = Math.max(0, Math.min(safeMax, Math.floor(value)));
  const pct = (safeValue / safeMax) * 100;
  const ready = safeValue >= safeMax;
  const warning = !ready && pct >= 70;
  const status = ready
    ? "추적 섬멸 준비"
    : warning
      ? "추적 섬멸 임박"
      : "분석 중";

  return (
    <span className={`${SURFACE_INSET} block space-y-1 px-2 py-1.5`}>
      <span className="flex items-center justify-between gap-2 text-[10px]">
        <span className="font-semibold text-zinc-700 dark:text-zinc-200">
          추적 위협
        </span>
        <span
          className={
            ready
              ? "font-semibold text-rose-700 dark:text-rose-300"
              : warning
                ? "font-semibold text-amber-700 dark:text-amber-300"
                : "text-zinc-500 dark:text-zinc-400"
          }
        >
          {status} · {safeValue} / {safeMax}
        </span>
      </span>
      <span
        role="progressbar"
        aria-label="추적 위협"
        aria-valuemin={0}
        aria-valuemax={safeMax}
        aria-valuenow={safeValue}
        className="block h-2 w-full overflow-hidden rounded bg-zinc-200 dark:bg-zinc-800"
      >
        <span
          className={`block h-full rounded transition-[width] ${
            ready ? "bg-rose-600" : warning ? "bg-amber-500" : "bg-violet-500"
          }`}
          style={{ width: `${pct}%` }}
        />
      </span>
    </span>
  );
}
