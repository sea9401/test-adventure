// 레벨업마다 6개 스탯을 독립적으로 굴린다. 관련 숙련도가 성장 범위를 넓힌다.
// 누적 성장분은 proficiency.v2.grown에 저장하며 각 수행 한계까지만 오른다.
// 설계: docs/v2-proficiency-redesign.md §2.

import { V2_STAT_KEYS, type V2StatKey } from "./v2StatKeys";
import { V2_BASE_STATS } from "./v2Stats";
import type { V2Class } from "./classes";
import { V2_JOB_CATALOG } from "./v2JobCatalog";
import {
  LIFE_RESOURCE_GROWTH_VERSION,
  lifeResourceRanges,
  type V2LifeResourceRanges,
  type V2LifeResourceGrowthVersion,
  type V2ResourceRange,
} from "./lifeResourceGrowth";
import {
  capGain,
  effectiveStatCap,
  diminishedCumLevel,
  V2_CULTIVATE_PROFILE,
  V2_FLOOR_GLOBAL,
  V2_FLOOR_PER_PROF,
  V2_TIER_FLOOR_MULT,
  V2_FLOOR_ANCHOR_WEIGHT,
  type V2ProficiencyState,
} from "./proficiency";

// 관련 숙련도 0/1만/10만/100만 → 각 스탯 0~1/0~2/0~4/0~7.
// 총량 예산이나 고정 천장은 없다. 숙련도가 늘수록 증가 간격이 길어진다.
export const V2_MASTERY_GROWTH_SCALE = 10_000;
export type RollLevelGrowthOptions = {
  /** 밸런스 시뮬레이션에서 여러 레벨의 성장량을 한 번에 계산할 때 사용한다. */
  levels?: number;
};

function profileWeight(
  profile: Partial<Record<V2StatKey, number>> | undefined,
  stat: V2StatKey,
): number {
  if (!profile) return 0;
  const maxVal = Math.max(...V2_STAT_KEYS.map((s) => profile[s] ?? 0));
  if (maxVal <= 0) return 0;
  return (profile[stat] ?? 0) / maxVal;
}

export function statGrowthMasteryTotals(
  prof: V2ProficiencyState,
): Record<V2StatKey, number> {
  const totals = Object.fromEntries(V2_STAT_KEYS.map((s) => [s, 0])) as Record<
    V2StatKey,
    number
  >;
  const addProfile = (
    amount: number,
    profile: Partial<Record<V2StatKey, number>> | undefined,
  ) => {
    if (!profile || amount <= 0) return;
    for (const stat of V2_STAT_KEYS) {
      totals[stat] += amount * profileWeight(profile, stat);
    }
  };

  // 직군 숙련도는 그 직군으로 쌓은 전체 경력이다. 상위 직업을 거쳐도 해당 계열의 기본 성장 성향은 남긴다.
  for (const [group, g] of Object.entries(prof.groups)) {
    addProfile(Math.max(0, Math.floor(g.cumLevel)), V2_CULTIVATE_PROFILE[group]);
  }
  // 구체 직업 숙련도는 직군보다 더 세밀한 보정이다. 예: 궁수/자객/방패병/사제 경력이 각자 다른 스탯에 남는다.
  for (const [jobId, cumLevel] of Object.entries(prof.jobCumLevel ?? {})) {
    addProfile(
      Math.max(0, Math.floor(cumLevel)),
      V2_JOB_CATALOG[jobId]?.cultivateProfile,
    );
  }
  return totals;
}

export function masteryGrowthBonus(mastery: number): number {
  const m = Number.isFinite(mastery) ? Math.max(0, Math.floor(mastery)) : 0;
  return Math.floor(Math.log2(1 + m / V2_MASTERY_GROWTH_SCALE));
}

export function statGrowthRanges(
  prof: V2ProficiencyState,
): Record<V2StatKey, V2ResourceRange> {
  const totals = statGrowthMasteryTotals(prof);
  return Object.fromEntries(
    V2_STAT_KEYS.map((stat) => [
      stat,
      { min: 0, max: 1 + masteryGrowthBonus(totals[stat]) },
    ]),
  ) as Record<V2StatKey, V2ResourceRange>;
}

function growthRoom(
  grown: Partial<Record<V2StatKey, number>>,
  prof: V2ProficiencyState,
  stat: V2StatKey,
  floors: Record<V2StatKey, number>,
): number {
  const current = (floors[stat] ?? V2_BASE_STATS[stat]) + (grown[stat] ?? 0);
  return effectiveStatCap(capGain(prof, stat)) - current;
}

// 스탯 floor(저점) — base + 실제 레벨 상승 누적분(일반·직군 프로필 가중, off 모드는 차수 보정).
// 승리 기반 해금 숙련도(cumLevel)와 분리해 만렙 사냥만으로 스탯이 오르지 않게 한다.
// 전직 시 레벨/grown 이 리셋돼도 스탯은 이 floor 부터 시작한다.
export function computeStatFloors(
  prof: V2ProficiencyState,
): Record<V2StatKey, number> {
  // 환생 누적 완화 — 총 누적 레벨 기준 밴드 감쇠율(decayMult)을 global·profile 양쪽에 균일 적용
  // (천장 없이 증가율↓). 단일 직군은 선형과 동일, 다직군(respec)도 총량 기준이라 일관.
  // rawTotal×decayMult = diminishedCumLevel(rawTotal).
  let rawTotal = 0;
  for (const levels of Object.values(prof.statFloorLevels)) {
    rawTotal += Math.max(0, Math.floor(Number(levels) || 0));
  }
  const decayMult = rawTotal > 0 ? diminishedCumLevel(rawTotal) / rawTotal : 1;
  const floors = {} as Record<V2StatKey, number>;
  for (const stat of V2_STAT_KEYS) {
    floors[stat] = (V2_BASE_STATS[stat] ?? 0) + rawTotal * decayMult * V2_FLOOR_GLOBAL;
  }
  for (const [group, rawLevels] of Object.entries(prof.statFloorLevels)) {
    const profile = V2_CULTIVATE_PROFILE[group];
    const floorLevels = Math.max(0, Math.floor(Number(rawLevels) || 0));
    if (!profile || floorLevels <= 0) continue;
    const tierMult = V2_TIER_FLOOR_MULT[prof.groups[group]?.tier ?? 1] ?? 1;
    // 프로필 값 비례 가중 — 최댓값 스탯(직군 주력)=1.0, 나머지는 값 비율. cap(수행)과 동일 규칙.
    // 앵커-이진 폐기: mage {int:2,spi:2} 의 spi 가 int 와 동급 floor 를 받는다(spi/luk 고향 부여).
    const maxVal = Math.max(...V2_STAT_KEYS.map((s) => profile[s] ?? 0));
    for (const stat of V2_STAT_KEYS) {
      const pv = profile[stat] ?? 0;
      if (pv <= 0) continue;
      const weight = (pv / maxVal) * V2_FLOOR_ANCHOR_WEIGHT;
      floors[stat] +=
        floorLevels * decayMult * V2_FLOOR_PER_PROF * tierMult * weight;
    }
  }
  for (const stat of V2_STAT_KEYS) floors[stat] = Math.floor(floors[stat]);
  return floors;
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
  const str = masteryGrowthBonus(mastery.str);
  const vit = masteryGrowthBonus(mastery.vit);
  const spi = masteryGrowthBonus(mastery.spi);
  const int = masteryGrowthBonus(mastery.int);
  return {
    ...ranges,
    hpPerLevel: {
      min: ranges.hpPerLevel.min + str,
      max: ranges.hpPerLevel.max + str + vit,
    },
    mpPerLevel: {
      min: ranges.mpPerLevel.min + spi,
      max: ranges.mpPerLevel.max + spi + int,
    },
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
      const raw = rng();
      const r = Number.isFinite(raw)
        ? Math.max(0, Math.min(1 - Number.EPSILON, raw))
        : 0;
      const rolled = Math.floor(r * (ranges[k].max + 1));
      const gain = Math.min(rolled, Math.max(0, growthRoom(next, prof, k, floors)));
      if (gain > 0) next[k] = (next[k] ?? 0) + gain;
    }
  }
  return next;
}
