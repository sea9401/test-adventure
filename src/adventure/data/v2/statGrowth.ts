// v2 랜덤 레벨 성장 — 레벨업마다 1차 스탯이 직업 앵커 가중 랜덤으로 오른다(cap 까지만).
// 옛 수동 분배 대체. 누적 성장분(grownStats)은 character.v2.grownStats 에 저장.
// 설계: docs/v2-proficiency-redesign.md §2.

import { V2_STAT_KEYS, type V2StatKey } from "./v2StatKeys";
import { V2_BASE_STATS } from "./v2Stats";
import { V2_CLASS_DEFS, type V2Class } from "./classes";
import {
  capGain,
  V2_CAP_HEADROOM_BASE,
  totalCumLevel,
  V2_CULTIVATE_PROFILE,
  V2_FLOOR_GLOBAL,
  V2_FLOOR_PER_PROF,
  V2_TIER_FLOOR_MULT,
  V2_FLOOR_ANCHOR_WEIGHT,
  V2_FLOOR_RELATED_WEIGHT,
  type V2ProficiencyState,
} from "./proficiency";

// 레벨업당 성장 포인트(옛 5/lv 와 동등 총량, 랜덤 분배). §10 다이얼.
export const V2_GROWTH_POINTS_PER_LEVEL = 5;

// 스탯 floor(저점) — base + 총 누적레벨(일반) + 직군 누적레벨(프로필·차수 가중). docs §5.
// 입력 earned → cumLevel 전환(2026-06): 레벨 유한이라 floor 가 천장을 가짐(runaway 해소).
// 전직 시 레벨/grown 리셋돼도 스탯은 이 floor 부터 → prestige 루프(cumLevel 은 리셋 안 됨).
export function computeStatFloors(
  prof: V2ProficiencyState,
): Record<V2StatKey, number> {
  const total = totalCumLevel(prof);
  const floors = {} as Record<V2StatKey, number>;
  for (const stat of V2_STAT_KEYS) {
    floors[stat] = (V2_BASE_STATS[stat] ?? 0) + total * V2_FLOOR_GLOBAL;
  }
  for (const [group, g] of Object.entries(prof.groups)) {
    const profile = V2_CULTIVATE_PROFILE[group];
    if (!profile || g.cumLevel <= 0) continue;
    const tierMult = V2_TIER_FLOOR_MULT[g.tier] ?? 1;
    const anchor = V2_CLASS_DEFS[group as V2Class]?.anchorStat;
    for (const stat of V2_STAT_KEYS) {
      if ((profile[stat] ?? 0) <= 0) continue;
      const weight =
        stat === anchor ? V2_FLOOR_ANCHOR_WEIGHT : V2_FLOOR_RELATED_WEIGHT;
      floors[stat] += g.cumLevel * V2_FLOOR_PER_PROF * tierMult * weight;
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
  targetStats?: readonly V2StatKey[],
): Partial<Record<V2StatKey, number>> {
  const next: Partial<Record<V2StatKey, number>> = { ...grown };
  const anchor = V2_CLASS_DEFS[playerClass].anchorStat;
  const targetSet =
    targetStats && targetStats.length > 0 ? new Set(targetStats) : null;
  for (let i = 0; i < V2_GROWTH_POINTS_PER_LEVEL; i++) {
    // 헤드룸(= 기본 헤드룸 + 수행 이득) 미달 스탯만 후보, 앵커 가중. grown 이 floor→cap 사이를
    // 채우므로 cap 미달 = grown < 헤드룸+이득 (floor 상쇄, stat=floor+grown<cap 와 동치).
    const pool: { k: V2StatKey; w: number }[] = [];
    let totalW = 0;
    for (const k of V2_STAT_KEYS) {
      const room = V2_CAP_HEADROOM_BASE + capGain(prof, k);
      if ((next[k] ?? 0) < room) {
        // 자유 수행 지정 시 선택 스탯 가중 3(앵커 대체) — 클래스 무관. 미지정 = 기존 앵커 가중.
        const w = targetSet
          ? targetSet.has(k)
            ? 3
            : 1
          : playerClass === "none"
            ? 1
            : k === anchor
              ? 3
              : 1;
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
