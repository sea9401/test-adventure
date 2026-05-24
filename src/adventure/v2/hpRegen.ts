// HP 시간 회복 — 사냥 사이 hp 자동 회복. v2 의 단판 빈번 사냥에서 매번 포션 부담 없게.
//
// 패턴: 사냥 후 character.hp = finalState.playerHp, character.hpRegenSince = now.
// 다음 사냥 시 applyHpRegen 으로 흐른 시간만큼 hp 증가. 만피면 그냥 회복 시계 갱신.

// 0 → 만피 도달까지 걸리는 시간. 캐릭의 maxHp 와 무관 (절대 시간 기반).
export const HP_RESTORE_MS = 5 * 60 * 1000; // 5분

export type HpRegenState = { hp: number; lastUpdatedAt: number };

// 흐른 시간만큼 hp 증가. 단순 패턴 — lastUpdatedAt 을 nowMs 로 갱신.
// 잔여 ms 보존은 안 함 (5분 회복 페이스에서 무시 가능한 손실).
// 만피 도달 후 추가 시간은 다음 hp 차감 후 그 때부터 카운트.
export function applyHpRegen(
  hp: number,
  maxHp: number,
  lastUpdatedAt: number,
  nowMs: number,
): HpRegenState {
  const safeMaxHp = Math.max(1, maxHp);
  if (hp >= safeMaxHp) return { hp: safeMaxHp, lastUpdatedAt: nowMs };
  const elapsedMs = Math.max(0, nowMs - lastUpdatedAt);
  const regenPerMs = safeMaxHp / HP_RESTORE_MS;
  const gained = Math.floor(regenPerMs * elapsedMs);
  const nextHp = Math.min(safeMaxHp, Math.max(0, hp + gained));
  return { hp: nextHp, lastUpdatedAt: nowMs };
}

// saves 의 hpRegenSince 파싱. 비정상 모양 / 미존재면 fallback (보통 now).
// fallback 으로 now 를 주면 옛 캐릭은 첫 사냥 시 회복 시작점 = 지금 → hp 변경 없음.
export function parseHpRegenSince(raw: unknown, fallback: number): number {
  if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0) return raw;
  return fallback;
}
