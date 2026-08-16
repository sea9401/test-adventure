import { SURFACE_INSET } from "@/components/ui/surfaces";
import {
  equipmentPowerDisplayValue,
  powerWithBonuses,
  type V2CraftQualityState,
} from "@/adventure/data/v2/v2Equipment";
import { enhanceBonusPct } from "@/adventure/data/v2/v2Enhance";

const STANDARD_PREVIEW_LEVELS = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
  11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
  30, 40,
] as const;

export type EnhancePowerPreviewRow = {
  level: number;
  bonusPct: number;
  power: number;
  gain: number;
};

export function enhancePowerPreviewLevels(currentLevel: number): number[] {
  const safeCurrentLevel = Math.max(0, Math.floor(currentLevel));
  const levels = new Set<number>(STANDARD_PREVIEW_LEVELS);
  if (safeCurrentLevel > 20) {
    levels.add(safeCurrentLevel);
    levels.add(safeCurrentLevel + 1);
  }
  return [...levels].sort((a, b) => a - b);
}

export function buildEnhancePowerPreview(
  basePower: number,
  craftQuality: V2CraftQualityState | undefined,
  currentLevel: number,
): EnhancePowerPreviewRow[] {
  const unenhancedPower = equipmentPowerDisplayValue(
    powerWithBonuses(basePower, undefined, craftQuality),
  );
  return enhancePowerPreviewLevels(currentLevel).map((level) => {
    const bonusPct = enhanceBonusPct(level);
    const power = equipmentPowerDisplayValue(
      powerWithBonuses(
        basePower,
        { level, bonusPct },
        craftQuality,
      ),
    );
    return {
      level,
      bonusPct,
      power,
      gain: power - unenhancedPower,
    };
  });
}

export function EnhancePowerPreview({
  basePower,
  craftQuality,
  currentLevel,
}: {
  basePower: number;
  craftQuality: V2CraftQualityState | undefined;
  currentLevel: number;
}) {
  const rows = buildEnhancePowerPreview(
    basePower,
    craftQuality,
    currentLevel,
  );

  return (
    <details className={`${SURFACE_INSET} group overflow-hidden`}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-semibold text-zinc-700 dark:text-zinc-200">
        <span>단계별 강화 수치</span>
        <span className="text-xs font-normal text-zinc-500 dark:text-zinc-400 group-open:hidden">
          +1~+20 · 그 이상
        </span>
        <span className="hidden text-xs font-normal text-zinc-500 dark:text-zinc-400 group-open:inline">
          접기
        </span>
      </summary>

      <div className="border-t border-zinc-200 px-3 pb-3 pt-2 dark:border-zinc-700">
        <p className="mb-2 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
          이 장비의 굴림과 제작 품질을 반영한 예상 위력입니다. 강화는 위력만
          올리고 옵션은 바꾸지 않습니다.
        </p>
        <div className="max-h-80 overflow-auto rounded-md border border-zinc-200 dark:border-zinc-700">
          <table className="w-full min-w-[360px] text-right text-xs tabular-nums">
            <thead className="sticky top-0 bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-300">
              <tr>
                <th scope="col" className="px-2 py-1.5 text-left font-medium">
                  단계
                </th>
                <th scope="col" className="px-2 py-1.5 font-medium">
                  누적 보너스
                </th>
                <th scope="col" className="px-2 py-1.5 font-medium">
                  예상 위력
                </th>
                <th scope="col" className="px-2 py-1.5 font-medium">
                  +0 대비
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-700">
              {rows.map((row) => {
                const isCurrent = row.level === currentLevel;
                return (
                  <tr
                    key={row.level}
                    className={
                      isCurrent
                        ? "bg-amber-100 font-semibold text-amber-950 dark:bg-amber-950 dark:text-amber-100"
                        : "bg-white dark:bg-zinc-900"
                    }
                  >
                    <th scope="row" className="px-2 py-1.5 text-left font-medium">
                      +{row.level}
                      {isCurrent && (
                        <span className="ml-1 text-[10px] text-amber-700 dark:text-amber-300">
                          현재
                        </span>
                      )}
                    </th>
                    <td className="px-2 py-1.5">+{row.bonusPct}%</td>
                    <td className="px-2 py-1.5 font-semibold">{row.power}</td>
                    <td className="px-2 py-1.5 text-emerald-600 dark:text-emerald-400">
                      +{row.gain}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
          강화 상한은 없습니다. +21~+30은 단계당 +2%p, +31부터는 단계당
          +1%p씩 누적됩니다.
        </p>
      </div>
    </details>
  );
}
