// 스태미너(행동력) 도메인 로직.
//
// 라이브의 1시간 자동 사냥 흐름을 폐기하고 v2 는 스태미너 기반 사냥.
// 사냥 1회마다 스태미너 N 소모, 시간으로 자동 회복.
//
// 이 파일은 순수 함수만 — DB/API/UI 분리. 저장 형태 (saves_kv 의 JSON 필드)
// 는 다음 PR 에서 통합. 사냥 로직 통합도 후속.

// === 튜닝 다이얼 ====================================================
// 첫 가닥 수치 — "총량 크게, 회복 적당히 낮게" 의 디자인 원칙 따라 sketch.
// 라이브 측정 보고 조정 예정.

export const MAX_STAMINA = 200;
export const REGEN_SECONDS_PER_POINT = 300; // 5 분 = 1 stamina
export const HUNT_COST = 1; // 사냥 1회 기본 비용

// 0 → MAX 회복 시간 = MAX * REGEN_SECONDS_PER_POINT
//   = 200 * 300 s = 60000 s ≈ 16.7 시간.

// === 상태 ===========================================================

export type StaminaState = {
  current: number; // 현재 보유량 (0 ~ MAX)
  // 마지막 회복 누적 시점 (epoch ms). 사냥/회복 계산 시 갱신.
  // 단, 정수 배수 단위만 진행 (나머지 시간은 다음 회복에 누적).
  lastUpdatedAt: number;
};

// 새 캐릭의 초기 상태. 만피로 시작.
export function initialStamina(nowMs: number): StaminaState {
  return { current: MAX_STAMINA, lastUpdatedAt: nowMs };
}

// === 회복 계산 ======================================================

// 마지막 업데이트 이후 흐른 시간만큼 회복 적용. 만피면 그냥 lastUpdatedAt 만 갱신.
// lastUpdatedAt 은 회복 1포인트 단위로만 진행 — 나머지 시간(잔여 ms)은 다음 회복에 누적되어 손실 없음.
export function applyRegen(state: StaminaState, nowMs: number): StaminaState {
  if (state.current >= MAX_STAMINA) {
    // 이미 만피라 회복 X. lastUpdatedAt 만 nowMs 로 (다음 소모 시 카운터 다시 시작).
    return { current: state.current, lastUpdatedAt: nowMs };
  }
  const elapsedMs = Math.max(0, nowMs - state.lastUpdatedAt);
  const regenMs = REGEN_SECONDS_PER_POINT * 1000;
  const regenPoints = Math.floor(elapsedMs / regenMs);
  if (regenPoints === 0) {
    // 아직 1 포인트도 못 채움. 상태 그대로.
    return state;
  }
  const newCurrent = Math.min(MAX_STAMINA, state.current + regenPoints);
  // 회복한 만큼의 시간만 진행, 잔여 ms 보존.
  const consumedMs = regenPoints * regenMs;
  return {
    current: newCurrent,
    lastUpdatedAt: state.lastUpdatedAt + consumedMs,
  };
}

// === 소모 (사냥 시도) ===============================================

// 사냥 시도 — 회복 적용 후 비용만큼 차감. 부족하면 null.
// null 반환 = 사냥 불가 (UI 에서 "스태미너 부족" 표시).
export function tryConsume(
  state: StaminaState,
  cost: number,
  nowMs: number,
): StaminaState | null {
  const regenned = applyRegen(state, nowMs);
  if (regenned.current < cost) return null;
  return {
    current: regenned.current - cost,
    lastUpdatedAt: regenned.lastUpdatedAt,
  };
}

// === 다음 회복까지 남은 시간 (UI 카운트다운) =========================

// 다음 1포인트 회복까지 남은 ms. 만피거나 lastUpdatedAt 이 미래면 0.
export function msUntilNextRegen(state: StaminaState, nowMs: number): number {
  if (state.current >= MAX_STAMINA) return 0;
  const regenMs = REGEN_SECONDS_PER_POINT * 1000;
  const elapsedMs = Math.max(0, nowMs - state.lastUpdatedAt);
  const remainder = elapsedMs % regenMs;
  return Math.max(0, regenMs - remainder);
}
