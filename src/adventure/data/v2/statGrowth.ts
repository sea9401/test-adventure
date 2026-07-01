// v2 랜덤 레벨 성장 — 레벨업마다 1차 스탯이 직업 앵커 가중 랜덤으로 오른다(cap 까지만).
// 옛 수동 분배 대체. 누적 성장분(grownStats)은 character.v2.grownStats 에 저장.
// 설계: docs/v2-proficiency-redesign.md §2.

import { V2_STAT_KEYS, type V2StatKey } from "./v2StatKeys";
import { V2_BASE_STATS } from "./v2Stats";
import type { V2Class } from "./classes";
import { V2_JOB_CATALOG } from "./v2JobCatalog";
import {
  capGain,
  V2_CAP_HEADROOM_BASE,
  balanceCumLevel,
  diminishedCumLevel,
  V2_CULTIVATE_PROFILE,
  V2_FLOOR_GLOBAL,
  V2_FLOOR_PER_PROF,
  V2_TIER_FLOOR_MULT,
  V2_FLOOR_ANCHOR_WEIGHT,
  type V2ProficiencyState,
} from "./proficiency";

// 레벨업당 성장 포인트. 5/lv 는 100레벨 전에 전 스탯 cap 을 채워 수행이 사실상 현재 스탯이 되는
// 문제가 있어 3/lv 로 낮춘다. cap 추격은 만렙 이후 전투 게이지가 별도로 맡는다.
export const V2_GROWTH_POINTS_PER_LEVEL = 3;
export const V2_CURRENT_PROFILE_GROWTH_BONUS = 2;
export const V2_TARGET_STAT_GROWTH_BONUS = 2;
export const V2_MASTERY_GROWTH_BONUS_MAX = 3;
export const V2_MASTERY_GROWTH_SOFTCAP = 1500;
export const V2_POST_CAP_GROWTH_BATTLES_PER_POINT = 100;

export type RollLevelGrowthOptions = {
  /** 현재 장착/선택한 구체 직업 id. 없으면 class 직군 프로필을 쓴다. */
  currentJobId?: string | null;
  /** 자유 수행/집중 성장 선택. 지정 시 현재 직업 프로필 대신 이 스탯들을 우선한다. */
  targetStats?: readonly V2StatKey[];
  /** 테스트·만렙 추격 성장용. 기본은 레벨업 1회 성장량. */
  points?: number;
};

function normalizeGrowthOptions(
  raw?: readonly V2StatKey[] | RollLevelGrowthOptions,
): RollLevelGrowthOptions {
  if (!raw) return {};
  return Array.isArray(raw) ? { targetStats: raw } : (raw as RollLevelGrowthOptions);
}

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
  const m = Math.max(0, Math.floor(Number(mastery) || 0));
  if (m <= 0) return 0;
  return (
    V2_MASTERY_GROWTH_BONUS_MAX *
    (m / (m + V2_MASTERY_GROWTH_SOFTCAP))
  );
}

function growthRoom(
  grown: Partial<Record<V2StatKey, number>>,
  prof: V2ProficiencyState,
  stat: V2StatKey,
): number {
  return V2_CAP_HEADROOM_BASE + capGain(prof, stat) - (grown[stat] ?? 0);
}

export function hasGrowthRoom(
  grown: Partial<Record<V2StatKey, number>>,
  prof: V2ProficiencyState,
): boolean {
  return V2_STAT_KEYS.some((stat) => growthRoom(grown, prof, stat) > 0);
}

function growthWeight(
  stat: V2StatKey,
  playerClass: V2Class,
  masteryTotals: Record<V2StatKey, number>,
  options: RollLevelGrowthOptions,
): number {
  const targetSet =
    options.targetStats && options.targetStats.length > 0
      ? new Set(options.targetStats)
      : null;
  const currentProfile =
    options.currentJobId && V2_JOB_CATALOG[options.currentJobId]
      ? V2_JOB_CATALOG[options.currentJobId]?.cultivateProfile
      : V2_CULTIVATE_PROFILE[playerClass];

  const focusBonus = targetSet
    ? targetSet.has(stat)
      ? V2_TARGET_STAT_GROWTH_BONUS
      : 0
    : profileWeight(currentProfile, stat) * V2_CURRENT_PROFILE_GROWTH_BONUS;

  return 1 + focusBonus + masteryGrowthBonus(masteryTotals[stat] ?? 0);
}

// 스탯 floor(저점) — base + 총 숙련도(일반) + 직군 숙련도(프로필 가중, off 모드는 차수 보정). docs §5.
// 해금용 숙련도는 승리 기반 9배 스케일이므로, floor 는 balanceCumLevel 로 기존 성장 체감에 맞춘다.
// 전직 시 레벨/grown 리셋돼도 스탯은 이 floor 부터 → prestige 루프(cumLevel 은 리셋 안 됨).
export function computeStatFloors(
  prof: V2ProficiencyState,
): Record<V2StatKey, number> {
  // 환생 누적 완화 — 총 숙련도 기준 밴드 감쇠율(decayMult)을 global·profile 양쪽에 균일 적용
  // (천장 없이 증가율↓). 단일 직군은 선형과 동일, 다직군(respec)도 총량 기준이라 일관.
  // rawTotal×decayMult = diminishedCumLevel(rawTotal).
  const balancedByGroup: Record<string, number> = {};
  let rawTotal = 0;
  for (const [group, g] of Object.entries(prof.groups)) {
    const balanced = balanceCumLevel(g.cumLevel);
    balancedByGroup[group] = balanced;
    rawTotal += balanced;
  }
  const decayMult = rawTotal > 0 ? diminishedCumLevel(rawTotal) / rawTotal : 1;
  const floors = {} as Record<V2StatKey, number>;
  for (const stat of V2_STAT_KEYS) {
    floors[stat] = (V2_BASE_STATS[stat] ?? 0) + rawTotal * decayMult * V2_FLOOR_GLOBAL;
  }
  for (const [group, g] of Object.entries(prof.groups)) {
    const profile = V2_CULTIVATE_PROFILE[group];
    const balancedCum = balancedByGroup[group] ?? 0;
    if (!profile || balancedCum <= 0) continue;
    const tierMult = V2_TIER_FLOOR_MULT[g.tier] ?? 1;
    // 프로필 값 비례 가중 — 최댓값 스탯(직군 주력)=1.0, 나머지는 값 비율. cap(수행)과 동일 규칙.
    // 앵커-이진 폐기: mage {int:2,spi:2} 의 spi 가 int 와 동급 floor 를 받는다(spi/luk 고향 부여).
    const maxVal = Math.max(...V2_STAT_KEYS.map((s) => profile[s] ?? 0));
    for (const stat of V2_STAT_KEYS) {
      const pv = profile[stat] ?? 0;
      if (pv <= 0) continue;
      const weight = (pv / maxVal) * V2_FLOOR_ANCHOR_WEIGHT;
      floors[stat] +=
        balancedCum * decayMult * V2_FLOOR_PER_PROF * tierMult * weight;
    }
  }
  for (const stat of V2_STAT_KEYS) floors[stat] = Math.floor(floors[stat]);
  return floors;
}

// 레벨 1회 성장 — 앵커 가중(앵커 3 : 그 외 1)으로 POINTS 만큼 +1씩, cap 미달 스탯에만.
// cap 가득이면 그 스탯 제외(낭비 없이 다른 스탯으로). 전부 cap 이면 중단(docs §2-c).
// 비파괴. rng = () => [0,1). 직업 none = 균등 가중.
export function rollLevelGrowth(
  grown: Partial<Record<V2StatKey, number>>,
  playerClass: V2Class,
  prof: V2ProficiencyState,
  rng: () => number,
  // 자유 수행(가이드형, docs/v2-job-spec-passives-plan.md §6) — 지정 시 클래스 앵커 대신 이 스탯들에
  // 성장 가중(3:1)을 둬 grown 이 선택 스탯으로 차오르게 한다. 미지정/빈 배열 = 현 동작(클래스 앵커).
  optionsOrTargetStats?: readonly V2StatKey[] | RollLevelGrowthOptions,
): Partial<Record<V2StatKey, number>> {
  const next: Partial<Record<V2StatKey, number>> = { ...grown };
  const options = normalizeGrowthOptions(optionsOrTargetStats);
  const points = Math.max(
    0,
    Math.floor(options.points ?? V2_GROWTH_POINTS_PER_LEVEL),
  );
  const masteryTotals = statGrowthMasteryTotals(prof);
  for (let i = 0; i < points; i++) {
    // 헤드룸(= 기본 헤드룸 + 수행 이득) 미달 스탯만 후보. grown 이 floor→cap 사이를 채우므로
    // cap 미달 = grown < 헤드룸+이득 (floor 상쇄, stat=floor+grown<cap 와 동치).
    const pool: { k: V2StatKey; w: number }[] = [];
    let totalW = 0;
    for (const k of V2_STAT_KEYS) {
      if (growthRoom(next, prof, k) > 0) {
        const w = growthWeight(k, playerClass, masteryTotals, options);
        pool.push({ k, w });
        totalW += w;
      }
    }
    if (pool.length === 0) break; // 전부 cap
    let r = rng() * totalW;
    for (const { k, w } of pool) {
      r -= w;
      if (r <= 0) {
        next[k] = (next[k] ?? 0) + 1;
        break;
      }
    }
  }
  return next;
}

export function applyPostCapGrowth(
  prof: V2ProficiencyState,
  playerClass: V2Class,
  rng: () => number,
  optionsOrTargetStats?: readonly V2StatKey[] | RollLevelGrowthOptions,
): {
  proficiency: V2ProficiencyState;
  statGains: Partial<Record<V2StatKey, number>>;
  pointsGained: number;
} {
  if (!hasGrowthRoom(prof.grown, prof)) {
    return {
      proficiency: { ...prof, postCapGrowthProgress: 0 },
      statGains: {},
      pointsGained: 0,
    };
  }
  const progress = Math.max(0, Math.floor(prof.postCapGrowthProgress ?? 0)) + 1;
  const points = Math.floor(progress / V2_POST_CAP_GROWTH_BATTLES_PER_POINT);
  const remainder = progress % V2_POST_CAP_GROWTH_BATTLES_PER_POINT;
  if (points <= 0) {
    return {
      proficiency: { ...prof, postCapGrowthProgress: progress },
      statGains: {},
      pointsGained: 0,
    };
  }

  const before = prof.grown;
  let grown = before;
  let pointsGained = 0;
  const options = normalizeGrowthOptions(optionsOrTargetStats);
  for (let i = 0; i < points; i++) {
    const prevTotal = V2_STAT_KEYS.reduce((sum, stat) => sum + (grown[stat] ?? 0), 0);
    grown = rollLevelGrowth(grown, playerClass, prof, rng, {
      ...options,
      points: 1,
    });
    const nextTotal = V2_STAT_KEYS.reduce((sum, stat) => sum + (grown[stat] ?? 0), 0);
    if (nextTotal <= prevTotal) break;
    pointsGained += nextTotal - prevTotal;
  }

  const statGains: Partial<Record<V2StatKey, number>> = {};
  for (const stat of V2_STAT_KEYS) {
    const d = (grown[stat] ?? 0) - (before[stat] ?? 0);
    if (d > 0) statGains[stat] = d;
  }
  return {
    proficiency: {
      ...prof,
      grown,
      postCapGrowthProgress: pointsGained > 0 ? remainder : 0,
    },
    statGains,
    pointsGained,
  };
}
