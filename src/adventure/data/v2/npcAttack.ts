// v2 NPC 정기 공격 — 점령된 거점이 속해 있던 NPC 세력의 탈환 공격.
//
// 주기: tier 별. 약한 거점일수록 자주 공격 (자주 풀릴 위험), 강한 거점은 가끔.
// 공격 1회 = NPC 챔피언 vs 점령자 영웅 단판 sim (라이브 resolveBattle).
// 점령자 패배 시 점령 풀림 (outpost_occupations row 삭제).
// 점령자 승리 시 nextAttackAt 갱신 (interval 이후).

import type { OutpostTier } from "./types";

export const ATTACK_INTERVAL_HOURS: Record<OutpostTier, number> = {
  1: 6, // 마을 — 자주 공격
  2: 12, // 거점
  3: 24, // 도시
  4: 48, // 왕국 — 가끔 공격
};

// 다음 공격 시각 = baseMs + tier interval. Date 객체 반환 (Drizzle timestamp 호환).
export function computeNextAttackAt(tier: OutpostTier, baseMs: number): Date {
  return new Date(baseMs + ATTACK_INTERVAL_HOURS[tier] * 3600_000);
}
