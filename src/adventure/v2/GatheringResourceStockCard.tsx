import { Card } from "@/components/ui/Card";

type GatheringResourceStockTone = "mining" | "woodcutting";

const TONE_STYLE: Record<
  GatheringResourceStockTone,
  { dot: string; count: string }
> = {
  mining: {
    dot: "bg-amber-500",
    count: "text-amber-700 dark:text-amber-300",
  },
  woodcutting: {
    dot: "bg-emerald-500",
    count: "text-emerald-700 dark:text-emerald-300",
  },
};

/** 장소 선택·수동 진행 화면에서 공용으로 쓰는 선택 자원 보유량 카드. */
export function GatheringResourceStockCard({
  resourceName,
  count,
  tone,
}: {
  resourceName: string;
  count: number;
  tone: GatheringResourceStockTone;
}) {
  const style = TONE_STYLE[tone];
  return (
    <Card padding="sm">
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex shrink-0 items-center gap-2 text-xs font-semibold text-zinc-500 dark:text-zinc-400">
          <span aria-hidden="true" className={`h-2 w-2 rounded-full ${style.dot}`} />
          현재 자원 보유량
        </span>
        <span className="min-w-0 truncate text-right text-sm font-bold text-zinc-800 dark:text-zinc-100">
          {resourceName}
          <span className={`ml-2 tabular-nums ${style.count}`}>
            {Math.max(0, Math.floor(count)).toLocaleString()}개
          </span>
        </span>
      </div>
    </Card>
  );
}
