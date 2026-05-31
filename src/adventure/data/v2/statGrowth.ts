// v2 랜덤 레벨 성장 — 레벨업마다 1차 스탯이 직업 앵커 가중 랜덤으로 오른다(cap 까지만).
// 옛 수동 분배 대체. 누적 성장분(grownStats)은 character.v2.grownStats 에 저장.
// 설계: docs/v2-proficiency-redesign.md §2.

import { V2_STAT_KEYS, type V2StatKey } from "./v2StatKeys";
import { V2_BASE_STATS } from "./v2Stats";
import { V2_CLASS_DEFS, type V2Class } from "./classes";
import { statCap, type V2ProficiencyState } from "./proficiency";

// 레벨업당 성장 포인트(옛 5/lv 와 동등 총량, 랜덤 분배). §10 다이얼.
export const V2_GROWTH_POINTS_PER_LEVEL = 5;

// 레벨 1회 성장 — 앵커 가중(앵커 3 : 그 외 1)으로 POINTS 만큼 +1씩, cap 미달 스탯에만.
// cap 가득이면 그 스탯 제외(낭비 없이 다른 스탯으로). 전부 cap 이면 중단(docs §2-c).
// 비파괴. rng = () => [0,1). 직업 none = 균등 가중.
export function rollLevelGrowth(
  grown: Partial<Record<V2StatKey, number>>,
  playerClass: V2Class,
  prof: V2ProficiencyState,
  rng: () => number,
): Partial<Record<V2StatKey, number>> {
  const next: Partial<Record<V2StatKey, number>> = { ...grown };
  const anchor = V2_CLASS_DEFS[playerClass].anchorStat;
  for (let i = 0; i < V2_GROWTH_POINTS_PER_LEVEL; i++) {
    // cap 미달 스탯만 후보, 앵커 가중.
    const pool: { k: V2StatKey; w: number }[] = [];
    let totalW = 0;
    for (const k of V2_STAT_KEYS) {
      const cur = (V2_BASE_STATS[k] ?? 0) + (next[k] ?? 0);
      if (cur < statCap(prof, k)) {
        const w = playerClass === "none" ? 1 : k === anchor ? 3 : 1;
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
