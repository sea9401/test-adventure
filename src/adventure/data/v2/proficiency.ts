// v2 직업 숙련도 + 수행(스탯 cap). 설계: docs/v2-proficiency-redesign.md §3·§4.
//
// 직업군 키 = 그 직업군의 1차 직업 id (tier1ClassOf, 예: 검술=swordsman). none(무직) 적립 없음.
// 저장: proficiency.v2 = {
//   groups: { [tier1classId]: { earned, spent, cultivations } },  // 직업별 숙련도 + 수행 횟수
//   caps:   { [stat]: number },                                    // 수행으로 올린 stat cap
// }
//   - earned 누적(영구) · spent(수행·학습 소모 합) · cultivations(그 직업 수행 횟수, 비용 증가용).
//   - 직업 사용가능 = earned − spent. 총 숙련도 = Σ earned. cap 미지정 = V2_STAT_CAP_BASE.

import { V2_STAT_KEYS, type V2StatKey } from "./v2StatKeys";

export type V2ProficiencyGroup = {
  earned: number;
  spent: number;
  cultivations: number;
  tier: number; // 그 직업군에서 도달한 최고 차수(1~4). floor tierMult 에 사용.
};
export type V2ProficiencyState = {
  groups: Record<string, V2ProficiencyGroup>;
  caps: Partial<Record<V2StatKey, number>>;
  grown: Partial<Record<V2StatKey, number>>; // 랜덤 레벨 성장 누적분(1차 스탯).
};

// §10 다이얼.
export const V2_PROFICIENCY_PER_KILL = 2;
// cap 은 floor 상대(저점 위 성장 여유). 유효 cap = floor + V2_CAP_HEADROOM_BASE + 수행이득.
// fresh(floor=base15) → 15+45 = 60(옛 시작 cap 과 동일). floor 가 높아져도 cap 이 항상 그 위라
// floor>cap 핀(수행 시 스탯 즉시 점프) 이 생기지 않는다 — 수행은 "여유(헤드룸)"만 늘리고
// 실제 스탯은 레벨업 랜덤성장(grown)이 floor→cap 사이를 채운다.
export const V2_CAP_HEADROOM_BASE = 45;
// 표시/폴백용 기본 cap(floor=base 가정). 실제 클램프는 effectiveStatCap 사용.
export const V2_STAT_CAP_BASE = 60;

// 수행 1회 cap 헤드룸 상승 — 직업군별 프로필(앵커 +2, 관련 2스탯 +1). 키 = tier1ClassOf. docs §9.
export const V2_CULTIVATE_PROFILE: Record<
  string,
  Partial<Record<V2StatKey, number>>
> = {
  swordsman: { str: 2, dex: 1, luk: 1 }, // 검술
  archer: { dex: 2, luk: 1, str: 1 }, // 궁술
  martial: { vit: 2, str: 1, spi: 1 }, // 체술
  mage: { int: 2, spi: 1, luk: 1 }, // 마술
  priest: { spi: 2, int: 1, vit: 1 }, // 신술
  ninja: { luk: 2, dex: 1, int: 1 }, // 인술
};

// 수행 비용(사용가능 숙련도) — 횟수 비례가 아니라 "올린 cap 헤드룸 총합" 비례(§10 다이얼).
// 크리티컬 다중 수행이 더 많은 cap 을 한 번에 올리면 그만큼 다음 비용도 비싸진다(자연 throttle).
export const V2_CULT_COST_BASE = 8;
export const V2_CULT_COST_PER_CAP = 1.5;
export function cultivationCost(totalCapGains: number): number {
  return Math.round(
    V2_CULT_COST_BASE + Math.max(0, totalCapGains) * V2_CULT_COST_PER_CAP,
  );
}

// 크리티컬 수행 — 낮은 확률로 1회 비용에 여러 배 cap 상승. 누적 임계(rng < p) 순.
export const V2_CULT_CRIT_TABLE: { p: number; mult: number }[] = [
  { p: 0.015, mult: 5 }, // 1.5% — ×5
  { p: 0.095, mult: 3 }, // +8% (누적 9.5%) — ×3
];
export function rollCultivationMult(rng: () => number): number {
  const r = rng();
  for (const { p, mult } of V2_CULT_CRIT_TABLE) {
    if (r < p) return mult;
  }
  return 1;
}

function posInt(raw: unknown): number {
  return typeof raw === "number" && Number.isFinite(raw)
    ? Math.max(0, Math.floor(raw))
    : 0;
}

export function emptyProficiency(): V2ProficiencyState {
  return { groups: {}, caps: {}, grown: {} };
}

function parseStatMap(raw: unknown): Partial<Record<V2StatKey, number>> {
  const out: Partial<Record<V2StatKey, number>> = {};
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    for (const stat of V2_STAT_KEYS) {
      const v = obj[stat];
      if (typeof v === "number" && Number.isFinite(v) && v > 0) {
        out[stat] = Math.floor(v);
      }
    }
  }
  return out;
}

export function parseProficiency(raw: unknown): V2ProficiencyState {
  if (!raw || typeof raw !== "object") return emptyProficiency();
  const obj = raw as { groups?: unknown; caps?: unknown; grown?: unknown };
  const groups: Record<string, V2ProficiencyGroup> = {};
  if (obj.groups && typeof obj.groups === "object") {
    for (const [k, v] of Object.entries(obj.groups as Record<string, unknown>)) {
      if (!v || typeof v !== "object") continue;
      const earned = posInt((v as { earned?: unknown }).earned);
      const spent = posInt((v as { spent?: unknown }).spent);
      const cultivations = posInt((v as { cultivations?: unknown }).cultivations);
      // tier 1~4 클램프, 미지정(옛 세이브)=1.
      const tier = Math.min(4, Math.max(1, posInt((v as { tier?: unknown }).tier) || 1));
      // earned > 0 인 그룹만. spent 는 earned 초과 불가(손상 방어).
      if (earned > 0) {
        groups[k] = { earned, spent: Math.min(spent, earned), cultivations, tier };
      }
    }
  }
  // caps[stat] = 수행으로 올린 cap 헤드룸 이득(floor+base 위 추가분). 양수만 저장.
  // 마이그레이션 가드(수행개편 2026-06): 옛 포맷은 "절대 cap"(항상 ≥ 60+이득 = ≥61)을 저장했다.
  // 새 이득은 실측상 < 60(t4 앵커 ~33). 60 이상 값은 옛 절대 cap 으로 보고 드롭(이득 0 리셋) —
  // 새 의미로 재해석돼 cap/비용이 부풀지 않게. (staging 한정, 두 포맷이 60 에서 깔끔히 갈림.)
  const caps: Partial<Record<V2StatKey, number>> = {};
  if (obj.caps && typeof obj.caps === "object") {
    const rawCaps = obj.caps as Record<string, unknown>;
    for (const stat of V2_STAT_KEYS) {
      const c = rawCaps[stat];
      if (
        typeof c === "number" &&
        Number.isFinite(c) &&
        c > 0 &&
        c < V2_STAT_CAP_BASE
      ) {
        caps[stat] = Math.floor(c);
      }
    }
  }
  return { groups, caps, grown: parseStatMap(obj.grown) };
}

// 랜덤 레벨 성장분 교체(비파괴). 다른 필드 보존.
export function setGrown(
  p: V2ProficiencyState,
  grown: Partial<Record<V2StatKey, number>>,
): V2ProficiencyState {
  return { ...p, grown };
}

// 직업군 도달 최고 차수 갱신(전직 시). 기존 tier 와 max. 그룹 없으면 생성. 비파괴.
export function setGroupTier(
  p: V2ProficiencyState,
  group: string,
  tier: number,
): V2ProficiencyState {
  if (!group || group === "none") return p;
  const t = Math.min(4, Math.max(1, Math.floor(tier)));
  const cur = p.groups[group] ?? { earned: 0, spent: 0, cultivations: 0, tier: 1 };
  if (cur.tier >= t) return p;
  return { ...p, groups: { ...p.groups, [group]: { ...cur, tier: t } } };
}

// floor(저점) 다이얼 — docs §5. 총 숙련도 일반 베이스 + 직업 숙련도(프로필·차수 가중).
export const V2_FLOOR_GLOBAL = 0.004; // 총 숙련도 → 전 스탯 베이스.
// 직업 earned → 프로필 스탯 floor. PR-9 캘리브: 0.02 → 0.01. earned 는 선형(3000까지)인데
// cap 은 수행 지수비용(1.12ⁿ)에 throttle 돼 고차에서 floor 가 cap 을 추월(수행 무의미)했다.
// floor 가 cap 의 ~30~50% 에 머물도록(저점<천장 + grown 이 메우는 여지) 계수+tierMult 하향.
export const V2_FLOOR_PER_PROF = 0.01;
// 차수가 높을수록 floor 가 더 오르되(설계 의도), cap 을 넘지 않게 완만히. {1.5,2,3} → {1.15,1.3,1.5}.
export const V2_TIER_FLOOR_MULT: Record<number, number> = {
  1: 1,
  2: 1.15,
  3: 1.3,
  4: 1.5,
};
// 직업 프로필 floor 가중 — 앵커 1.0, 관련 0.4.
export const V2_FLOOR_ANCHOR_WEIGHT = 1.0;
export const V2_FLOOR_RELATED_WEIGHT = 0.4;

// 시그니처 학습 비용(사용가능 숙련도) — 그 차수 도달 + 비용 지불 시 습득(docs §6·§10).
export const V2_SIGNATURE_LEARN_COST: Record<number, number> = {
  1: 80,
  2: 150,
  3: 250,
  4: 400,
};
export function signatureLearnCost(tier: number): number {
  return V2_SIGNATURE_LEARN_COST[tier] ?? V2_SIGNATURE_LEARN_COST[1];
}

// 전직(차수 승급) 게이트 — 직업군 누적 숙련도(earned) 임계 + 최소 레벨. 골드 X(docs §7·§10).
// key = 목표 차수. earned 는 안 줄어드는 영구값이라 spent 와 무관하게 누적 마스터리 척도.
export const V2_ADVANCE_PROFICIENCY_REQ: Record<number, number> = {
  2: 300,
  3: 1200,
  4: 3000,
};
export function advanceProficiencyReq(tier: number): number {
  return V2_ADVANCE_PROFICIENCY_REQ[tier] ?? Infinity;
}
// 전직 최소 레벨 — 차수 승급 시 레벨이 1로 리셋되므로, 매 차수 사이 레벨 50 까지 키워야
// 다음 승급 가능(누적 숙련도와 함께 이중 게이트). 리셋 루프의 레벨 의미 부여(2026-06).
export const V2_ADVANCE_MIN_LEVEL = 50;

// 총 숙련도 = 모든 직업군 earned 합.
export function totalEarned(p: V2ProficiencyState): number {
  let t = 0;
  for (const v of Object.values(p.groups)) t += v.earned;
  return t;
}

export function groupEarned(p: V2ProficiencyState, group: string): number {
  return p.groups[group]?.earned ?? 0;
}

// 직업 사용가능 = earned − spent.
export function groupUsable(p: V2ProficiencyState, group: string): number {
  const g = p.groups[group];
  return g ? Math.max(0, g.earned - g.spent) : 0;
}

export function cultivationCount(p: V2ProficiencyState, group: string): number {
  return p.groups[group]?.cultivations ?? 0;
}

// stat cap — 수행으로 올린 값, 미지정이면 기본 cap.
// 수행으로 올린 cap 헤드룸 이득(저점/base 위 추가 성장 여유). 미수행 = 0.
export function capGain(p: V2ProficiencyState, stat: V2StatKey): number {
  return p.caps[stat] ?? 0;
}

// 유효 cap = floor + 기본 헤드룸 + 수행 이득. floor 가 높아져도 cap 이 항상 그 위.
export function effectiveStatCap(floorVal: number, gain: number): number {
  return Math.floor(floorVal + V2_CAP_HEADROOM_BASE + Math.max(0, gain));
}

// 전 스탯 수행 이득 총합 — 수행 비용 산정(cap 비례)에 사용.
export function totalCapGains(p: V2ProficiencyState): number {
  let t = 0;
  for (const stat of V2_STAT_KEYS) t += p.caps[stat] ?? 0;
  return t;
}

// 적립 — group 의 earned += amount. 비파괴. none/빈 group/0 이하는 무변경.
export function addEarned(
  p: V2ProficiencyState,
  group: string,
  amount: number,
): V2ProficiencyState {
  if (amount <= 0 || !group || group === "none") return p;
  const cur = p.groups[group] ?? {
    earned: 0,
    spent: 0,
    cultivations: 0,
    tier: 1,
  };
  return {
    ...p,
    groups: {
      ...p.groups,
      [group]: { ...cur, earned: cur.earned + amount },
    },
  };
}

// 수행 1회 — 사용가능 숙련도 cost 소모 + 현 직업 프로필 stat cap 상승 + cultivations++.
// 사용가능 부족/유효하지 않은 직업군이면 null. 비파괴.
// 수행 1회 — 사용가능 숙련도로 프로필 스탯 cap 헤드룸 상승. 비용 = 올린 cap 총합 비례.
// rng 주면 낮은 확률로 다중 수행(크리티컬, mult×) — 1회 비용에 여러 배 cap. rng 없으면 ×1.
export function applyCultivation(
  p: V2ProficiencyState,
  group: string,
  rng?: () => number,
): { next: V2ProficiencyState; cost: number; mult: number } | null {
  const profile = V2_CULTIVATE_PROFILE[group];
  if (!profile) return null; // none/무효 직업군
  const cost = cultivationCost(totalCapGains(p));
  if (groupUsable(p, group) < cost) return null; // 사용가능 부족
  const mult = rng ? rollCultivationMult(rng) : 1;
  const cur = p.groups[group] ?? {
    earned: 0,
    spent: 0,
    cultivations: 0,
    tier: 1,
  };
  const nextCaps: Partial<Record<V2StatKey, number>> = { ...p.caps };
  for (const stat of V2_STAT_KEYS) {
    const gain = (profile[stat] ?? 0) * mult;
    if (gain > 0) nextCaps[stat] = (nextCaps[stat] ?? 0) + gain;
  }
  return {
    cost,
    mult,
    next: {
      ...p,
      groups: {
        ...p.groups,
        [group]: {
          ...cur,
          spent: cur.spent + cost,
          cultivations: cur.cultivations + 1,
        },
      },
      caps: nextCaps,
    },
  };
}

// 사용가능 숙련도 소모(시그니처 학습용) — cap/cultivations 불변, spent 만 증가.
// 비파괴. 사용가능 부족이면 null. (수행과 달리 횟수 카운트 안 함 — 고정 비용.)
export function spendProficiency(
  p: V2ProficiencyState,
  group: string,
  amount: number,
): V2ProficiencyState | null {
  if (amount <= 0) return p;
  if (groupUsable(p, group) < amount) return null;
  const cur = p.groups[group] ?? {
    earned: 0,
    spent: 0,
    cultivations: 0,
    tier: 1,
  };
  return {
    ...p,
    groups: {
      ...p.groups,
      [group]: { ...cur, spent: cur.spent + amount },
    },
  };
}
