// 거점 공성(성벽 HP) — 상수 + 순수 헬퍼. 설계: docs/v2-outpost-siege-plan.md
//
// 점령된 거점은 성벽 HP 를 가진다. 점령 시도 승리마다 SIEGE_DAMAGE_PER_WIN 만큼 깎이고,
// 0 이하가 되는 순간 함락(소유권 이전 + 성벽 풀충전 + 보호막). 성벽은 시간당 자동 재생되므로
// (lazy 계산) 지속 압박이 있어야 함락한다. 비점령 NPC 거점은 단판 점령(성벽 없음).

// 다이얼 (라이브 실측 후 캘리브) ───────────────────────────────────────────
// 불변식: FORT_MAX_HP > SIEGE_DAMAGE_PER_WIN — 풀충전/완전수리된 성벽이 한 방에 함락되지
//   않아야 "금고 충분하면 방어" 가 성립(금고 자동 수리 PR-2 전제).
export const FORT_MAX_HP = 100;
export const SIEGE_DAMAGE_PER_WIN = 20; // ≈ 5승 함락
export const FORT_REGEN_PER_HOUR = 5; // 하루 120 회복 ≈ 6승분
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
export function siegeWinsToFall(fortHp: number): number {
  return Math.max(1, Math.ceil(fortHp / SIEGE_DAMAGE_PER_WIN));
}
