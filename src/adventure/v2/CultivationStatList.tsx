import { V2_STAT_KEYS, V2_STAT_LABELS, type V2StatKey } from "@/adventure/data/v2/v2StatKeys";
import { V2_STAT_CAP_BASE } from "@/adventure/data/v2/proficiency";
import { SURFACE_INSET } from "@/components/ui/surfaces";

type StatValues = Partial<Record<V2StatKey, number>>;

export function CultivationStatList({
  base,
  total,
  caps,
  gains,
}: {
  base: StatValues;
  total: StatValues;
  caps: StatValues;
  gains: StatValues;
}) {
  return (
    <ul className="mt-3 space-y-1.5">
      {V2_STAT_KEYS.map((stat) => {
        const baseValue = base[stat] ?? 0;
        const totalValue = total[stat] ?? baseValue;
        const cap = caps[stat] ?? V2_STAT_CAP_BASE;
        const gain = gains[stat] ?? 0;
        return (
          <li key={stat} className={`${SURFACE_INSET} flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2`}>
            <div className="flex min-w-0 items-baseline gap-2">
              <span className="text-sm font-semibold uppercase">{stat.toUpperCase()}</span>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">{V2_STAT_LABELS[stat]}</span>
            </div>
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 tabular-nums text-xs">
              <span>기본 <strong>{baseValue.toLocaleString()}</strong></span>
              <span className="text-zinc-500 dark:text-zinc-400">한계 {cap.toLocaleString()}</span>
              <span className="font-semibold">효과 적용 {totalValue.toLocaleString()}</span>
              {gain > 0 && <span className="text-emerald-600 dark:text-emerald-400">한계 +{gain.toLocaleString()}</span>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
