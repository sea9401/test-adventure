import { SURFACE_INSET } from "@/components/ui/surfaces";
import { V2_STAT_KEYS, V2_STAT_LABELS, type V2StatKey } from "../data/v2/v2StatKeys";
import type { V2StatGrowthRange } from "../data/v2/statGrowthMastery";
import type { V2LifeResourceRanges, V2ResourceRange } from "../data/v2/lifeResourceGrowth";

export type GrowthPreviewState = {
  statGrowth?: {
    ranges: Record<V2StatKey, V2StatGrowthRange>;
    nextStartStats: Record<V2StatKey, number>;
  };
  lifeResourceGrowth?: {
    mode: "legacy" | "rolled";
    appliesAfterRejob: boolean;
    currentRanges: V2LifeResourceRanges;
    nextRejobRanges: V2LifeResourceRanges | null;
  };
};

const mean = (range: V2ResourceRange) => (range.expected ?? (range.min + range.max) / 2).toFixed(2);
function ResourceLine({ label, hp, mp }: { label: string; hp: V2ResourceRange; mp: V2ResourceRange }) {
  return <p>{label}: HP {hp.min}~{hp.max} (평균 {mean(hp)}) · MP {mp.min}~{mp.max} (평균 {mean(mp)})</p>;
}

export function GrowthPreview({ statGrowth, lifeResourceGrowth: resources }: GrowthPreviewState) {
  if (!statGrowth && !resources) return null;
  return (
    <div className={`${SURFACE_INSET} mt-4 space-y-3 p-3 text-xs`}>
      {statGrowth && <div>
        <div className="font-semibold">레벨업 스탯 성장</div>
        <p className="mt-1 text-zinc-600 dark:text-zinc-300">매 레벨 여섯 스탯을 각각 굴립니다. 평균은 한계 적용 전 수치이며, 실제로는 남은 수행 한계까지만 오릅니다.</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {V2_STAT_KEYS.map(stat => {
            const range = statGrowth.ranges[stat];
            return <p key={stat}>
              <span className="font-semibold">{V2_STAT_LABELS[stat]}</span>{" "}
              0~{range.lowerMax}
              {range.upperProbability > 0 && <> · {(range.upperProbability * 100).toFixed(2)}%로 0~{range.max} 범위 선택</>}
              {" · "}평균 +{range.expected.toFixed(2)}
              <span className="block text-zinc-600 dark:text-zinc-300">현재 숙련도로 재전직 시 시작 {statGrowth.nextStartStats[stat]} (수행 한계 적용 전)</span>
            </p>;
          })}
        </div>
      </div>}
      {resources && <div className="space-y-1 text-zinc-600 dark:text-zinc-300">
        <div className="font-semibold text-zinc-900 dark:text-zinc-100">HP·MP 성장</div>
        {resources.mode === "rolled"
          ? <ResourceLine label="현재 레벨업 증가" hp={resources.currentRanges.hpPerLevel} mp={resources.currentRanges.mpPerLevel} />
          : <p>현재 캐릭터는 기존 HP·MP 성장 공식을 사용합니다. 다음 Lv.100 전투 재전직부터 아래 범위를 적용합니다.</p>}
        {resources.nextRejobRanges && <>
          <ResourceLine label="다음 전투 재전직 시작" hp={resources.nextRejobRanges.baseHp} mp={resources.nextRejobRanges.baseMp} />
          <ResourceLine label="다음 전투 재전직 후 레벨업 증가" hp={resources.nextRejobRanges.hpPerLevel} mp={resources.nextRejobRanges.mpPerLevel} />
        </>}
        <p>현재 숙련도와 수행 한계를 기준으로 한 고유 자원 값입니다. 레벨업 범위는 소수 확률을 반영한 전체 가능 범위로, 모든 결과의 확률이 같지는 않습니다. 직업·스탯·장비 보너스는 별도입니다.</p>
      </div>}
    </div>
  );
}
