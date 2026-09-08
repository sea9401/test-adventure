import { V2_STAT_KEYS, type V2StatKey } from "./v2StatKeys";
import { V2_CULTIVATE_PROFILE } from "./cultivateProfiles";
import { V2_JOB_CATALOG } from "./v2JobCatalog";
import type { V2ProficiencyState } from "./proficiency";

export const V2_MASTERY_GROWTH_SCALE = 5_000;

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
  const m = Number.isFinite(mastery) ? Math.max(0, mastery) : 0;
  return Math.log2(1 + m / V2_MASTERY_GROWTH_SCALE);
}

export type V2StatGrowthRange = {
  min: 0;
  max: number;
  lowerMax: number;
  upperProbability: number;
  expected: number;
};

export function statGrowthRanges(
  prof: V2ProficiencyState,
): Record<V2StatKey, V2StatGrowthRange> {
  const totals = statGrowthMasteryTotals(prof);
  return Object.fromEntries(
    V2_STAT_KEYS.map((stat) => {
      const upper = 1 + masteryGrowthBonus(totals[stat]);
      const lowerMax = Math.floor(upper);
      return [stat, {
        min: 0,
        max: Math.ceil(upper),
        lowerMax,
        upperProbability: upper - lowerMax,
        expected: upper / 2,
      }];
    }),
  ) as Record<V2StatKey, V2StatGrowthRange>;
}

/** 다음 생애 시작값. 현재 스탯이나 과거 레벨 수에 의존하지 않는다. */
export function masteryStartingStats(
  prof: V2ProficiencyState,
): Record<V2StatKey, number> {
  const totals = statGrowthMasteryTotals(prof);
  return Object.fromEntries(
    V2_STAT_KEYS.map((stat) => [
      stat,
      15 + Math.floor(22 * masteryGrowthBonus(totals[stat])),
    ]),
  ) as Record<V2StatKey, number>;
}
