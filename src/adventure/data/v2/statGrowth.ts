// 레벨업마다 6개 스탯을 독립적으로 굴린다. 관련 숙련도가 성장 범위를 넓힌다.
// 누적 성장분은 proficiency.v2.grown에 저장하며 각 수행 한계까지만 오른다.
// 설계: docs/v2-proficiency-redesign.md §2.

import { V2_STAT_KEYS, type V2StatKey } from "./v2StatKeys";
import { V2_BASE_STATS } from "./v2Stats";
import type { V2Class } from "./classes";
import {
  statGrowthRanges,
  statGrowthMasteryTotals,
  masteryGrowthBonus,
} from "./statGrowthMastery";
export {
  statGrowthRanges,
  statGrowthMasteryTotals,
  masteryGrowthBonus,
  masteryStartingStats,
  V2_MASTERY_GROWTH_SCALE,
} from "./statGrowthMastery";
import {
  LIFE_RESOURCE_GROWTH_VERSION,
  lifeResourceRanges,
  masteryResourceRange,
  unitRoll,
  type V2LifeResourceRanges,
  type V2LifeResourceGrowthVersion,
} from "./lifeResourceGrowth";
import {
  computeLegacyStatFloors,
  capGain,
  effectiveStatCap,
  type V2ProficiencyState,
} from "./proficiency";

// 관련 숙련도는 연속적인 범위 선택 확률에 반영한다.
// 총량 예산이나 고정 천장은 없다. 숙련도가 늘수록 증가 간격이 길어진다.
export type RollLevelGrowthOptions = {
  /** 밸런스 시뮬레이션에서 여러 레벨의 성장량을 한 번에 계산할 때 사용한다. */
  levels?: number;
};

function growthRoom(
  grown: Partial<Record<V2StatKey, number>>,
  prof: V2ProficiencyState,
  stat: V2StatKey,
  floors: Record<V2StatKey, number>,
): number {
  const current = (floors[stat] ?? V2_BASE_STATS[stat]) + (grown[stat] ?? 0);
  return effectiveStatCap(capGain(prof, stat)) - current;
}

// 현재 생애 시작값은 고정한다. 스냅샷이 없는 구형 입력만 종전 공식으로 복원한다.
export function computeStatFloors(prof: V2ProficiencyState): Record<V2StatKey, number> {
  return prof.lifeStartStats ? { ...prof.lifeStartStats } : computeLegacyStatFloors(prof);
}

export function lifeResourceRangesForProficiency(
  prof: V2ProficiencyState,
  version: V2LifeResourceGrowthVersion = LIFE_RESOURCE_GROWTH_VERSION,
): V2LifeResourceRanges {
  const floors = computeStatFloors(prof);
  const ranges = lifeResourceRanges(
    {
      strFloor: floors.str,
      vitCap: effectiveStatCap(capGain(prof, "vit")),
      spiFloor: floors.spi,
      intCap: effectiveStatCap(capGain(prof, "int")),
    },
    version,
  );
  const mastery = statGrowthMasteryTotals(prof);
  return {
    ...ranges,
    hpPerLevel: masteryResourceRange(
      ranges.hpPerLevel,
      3 * masteryGrowthBonus(mastery.str),
      3 * masteryGrowthBonus(mastery.vit),
    ),
    mpPerLevel: masteryResourceRange(
      ranges.mpPerLevel,
      3 * masteryGrowthBonus(mastery.spi),
      3 * masteryGrowthBonus(mastery.int),
    ),
  };
}

// 모든 스탯은 독립 주사위를 가진다. cap에 막힌 굴림은 다른 스탯으로 옮기지 않는다.
// class 인자는 호출부 호환용이다. 실제 성장 범위는 누적 경력으로 결정된다.
export function rollLevelGrowth(
  grown: Partial<Record<V2StatKey, number>>,
  _playerClass: V2Class,
  prof: V2ProficiencyState,
  rng: () => number,
  options: RollLevelGrowthOptions = {},
): Partial<Record<V2StatKey, number>> {
  const next: Partial<Record<V2StatKey, number>> = { ...grown };
  const rawLevels = options.levels ?? 1;
  const levels = Number.isFinite(rawLevels) ? Math.max(0, Math.floor(rawLevels)) : 0;
  const ranges = statGrowthRanges(prof);
  const floors = computeStatFloors(prof);
  for (let i = 0; i < levels; i++) {
    for (const k of V2_STAT_KEYS) {
      const range = ranges[k];
      const cap = range.lowerMax + (unitRoll(rng) < range.upperProbability ? 1 : 0);
      const rolled = Math.floor(unitRoll(rng) * (cap + 1));
      const gain = Math.min(rolled, Math.max(0, growthRoom(next, prof, k, floors)));
      if (gain > 0) next[k] = (next[k] ?? 0) + gain;
    }
  }
  return next;
}
