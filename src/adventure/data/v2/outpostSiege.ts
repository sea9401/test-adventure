// 거점 공성(성벽 HP) — 상수 + 순수 헬퍼. 설계: docs/v2-outpost-siege-plan.md
//
// 점령된 거점은 성벽 HP 를 가진다. 점령 시도 승리마다 SIEGE_DAMAGE_PER_WIN 만큼 깎이고,
// 0 이하가 되는 순간 함락(소유권 이전 + 성벽 풀충전 + 보호막). 성벽은 시간당 자동 재생되므로
// (lazy 계산) 지속 압박이 있어야 함락한다. 비점령 NPC 거점은 단판 점령(성벽 없음).

// 다이얼 (라이브 실측 후 캘리브) ───────────────────────────────────────────
export const FORT_MAX_HP = 100;
export const SIEGE_DAMAGE_PER_WIN = 20; // ≈ 5승 함락
export const FORT_REGEN_PER_HOUR = 5; // 하루 120 회복 ≈ 6승분
export const POST_CAPTURE_PROTECT_HOURS = 18; // 함락 후 재공성 금지

export const POST_CAPTURE_PROTECT_MS = POST_CAPTURE_PROTECT_HOURS * 3_600_000;

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
