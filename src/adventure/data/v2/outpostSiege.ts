// 거점 공성(성벽 HP) — 상수 + 순수 헬퍼. 설계: docs/v2-outpost-siege-plan.md
//
// 점령된 거점은 성벽 HP 를 가진다. 점령 시도 승리마다 siegeDamage(전투력 비율) 만큼 깎이고,
// 0 이하가 되는 순간 함락(소유권 이전 + 성벽 풀충전 + 보호막). 성벽은 시간당 자동 재생되므로
// (lazy 계산) 지속 압박이 있어야 함락한다. 비점령 NPC 거점은 단판 점령(성벽 없음).

import type { OutpostTier } from "./types";

// 다이얼 (라이브 실측 후 캘리브) ───────────────────────────────────────────
// 성벽 최대 HP — 단계(tier)별. 단계 오를수록 두꺼움 → 상위 거점은 한참 걸려야 함락.
//   타일 frontier/village/city/metropolis = tileTierToOutpostTier 로 1~4 매핑(카탈로그 거점 공용).
// 불변식: 최소 HP(tier1=300) > 최대 siegeDamage(BASE 75 × MAX 3.0 = 225) — 풀수리 성벽이
//   한 방에 안 무너져야 "금고 충분하면 방어" 가 성립(금고 자동 수리 전제).
export const FORT_MAX_HP_BY_TIER: Record<OutpostTier, number> = {
  1: 300, // 개척마을(frontier)
  2: 500, // 마을(village)
  3: 1000, // 도시(city)
  4: 1500, // 대도시(metropolis)
};
export function fortMaxHpForTier(tier: OutpostTier): number {
  return FORT_MAX_HP_BY_TIER[tier] ?? FORT_MAX_HP_BY_TIER[1];
}
// 기본/폴백 성벽 HP(tier 미상). 옛 상수 호환 — tier1(개척마을) 값.
export const FORT_MAX_HP = 300;

// 성벽 데미지 — 전투력 비율 기반. 압도적 전력차=큰 타격, 빠듯=찔끔(옛 고정 -20 폐지).
export const BASE_SIEGE_DAMAGE = 75; // 전력 동급(비율 1.0)일 때 데미지 — 다이얼
export const SIEGE_RATIO_MIN = 0.5;
export const SIEGE_RATIO_MAX = 3.0;
export function siegeDamage(attackerPower: number, defenderPower: number): number {
  const ratio = Math.min(
    SIEGE_RATIO_MAX,
    Math.max(SIEGE_RATIO_MIN, attackerPower / Math.max(1, defenderPower)),
  );
  return Math.max(1, Math.round(BASE_SIEGE_DAMAGE * ratio));
}

export const FORT_REGEN_PER_HOUR = 5; // 시간당 회복(상위 성벽일수록 상대적으로 작음 = 의도)
export const POST_CAPTURE_PROTECT_HOURS = 18; // 함락 후 재공성 금지

export const POST_CAPTURE_PROTECT_MS = POST_CAPTURE_PROTECT_HOURS * 3_600_000;

// 길드 금고 자동 수리(PR-2) — 공성 타격 시 데미지 전, 수비 길드 금고 골드로 성벽을 보강.
// HP 1 당 비용. 별도 일일 캡 없이 금고 잔액이 한도 — 금고가 마르면 수리 중단(골드 소진 공성).
export const REPAIR_GOLD_PER_HP = 50;

// 결손(deficit = fortMaxHp − 현재성벽)과 길드 금고로 보강 가능한 HP. 금고가 한도.
export function repairHpFromGold(deficit: number, guildGold: number): number {
  if (deficit <= 0 || guildGold <= 0) return 0;
  return Math.max(0, Math.min(deficit, Math.floor(guildGold / REPAIR_GOLD_PER_HP)));
}

// 마지막 갱신(fortUpdatedAt) 이후 경과로 재생한 현재 성벽(상한 fortMaxHp). lazy — 크론 불요.
export function currentFortHp(
  fortHp: number,
  fortMaxHp: number,
  fortUpdatedAt: Date,
  now: Date,
): number {
  const elapsedH = Math.max(
    0,
    (now.getTime() - fortUpdatedAt.getTime()) / 3_600_000,
  );
  return Math.min(
    fortMaxHp,
    Math.round(fortHp + FORT_REGEN_PER_HOUR * elapsedH),
  );
}

// 함락 직후 보호막 — protectedUntil 이 미래면 재공성 불가.
export function isOutpostProtected(protectedUntil: Date, now: Date): boolean {
  return protectedUntil.getTime() > now.getTime();
}

// 전황(war/overview) "최근" 범위 — 이 시간 안의 공성 시도·점령 변동을 교전/함락으로 집계.
export const WAR_OVERVIEW_WINDOW_H = 48;

// 현재 성벽 기준 함락까지 필요한 공성 승수 — UI "약 N승으로 함락" 표기용(재생 무시 근사).
//   perWin = 추정 1승 데미지(siegeDamage). 0 가드.
export function siegeWinsToFall(fortHp: number, perWin: number): number {
  return Math.max(1, Math.ceil(fortHp / Math.max(1, perWin)));
}
