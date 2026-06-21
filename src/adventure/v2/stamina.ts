// 스태미너(행동력) 도메인 로직.
//
// 라이브의 1시간 자동 사냥 흐름을 폐기하고 v2 는 스태미너 기반 사냥.
// 사냥 1회마다 스태미너 N 소모, 시간으로 자동 회복.
//
// 이 파일은 순수 함수만 — DB/API/UI 분리. 저장 형태 (saves_kv 의 JSON 필드)
// 는 다음 PR 에서 통합. 사냥 로직 통합도 후속.

// === 튜닝 다이얼 ====================================================
// 사용자 결정 (2026-05-28) — 옛 200/5분 다이얼은 회복:소비 5:1 로 사냥 빈도 게이트가
// 너무 빡빡 (만피 200 = STR Lv75 기준 3.3h 사냥, 회복 0→만피 16.7h). 일 1회 접속
// 유저가 cap 손실 줄어들도록 총량 ×5, 회복 ×10 으로 확장.

// 2026-06-03 cap 1000→5000→과다→1500. 2026-06-06 사용자 결정 — 다시 5000 으로 상향(밴킹 cap 확대).
export const MAX_STAMINA = 5000;
export const REGEN_SECONDS_PER_POINT = 30; // 1 분 = 2 stamina
export const HUNT_COST = 1; // 사냥 1회 기본 비용
export const OUTPOST_MOVE_COST = 1; // 거점 이동 1회 비용 (자유이동·재진입은 무료)

// 0 → MAX 회복 시간 = MAX * REGEN_SECONDS_PER_POINT
//   = 5000 * 30 s = 150000 s = ~41.7 시간 (밴킹 cap — 평소엔 거의 안 비움).
// 시간당 회복 = 120, 일 이론 회복 = 2880 (cap 5000 이라 ~41.7h 후 정체). 회복률 불변 — cap 만 확대.

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
// maxStamina — per-user 최대치(기본 MAX_STAMINA). 비밀 상점 "한계의 비약"
// (character.v2.staminaCapBonus) 이 올린다. max 를 안 넘긴 경로는 기본 캡 위로
// 회복만 안 될 뿐 보유분을 깎지 않는다(current > max 여도 그대로 반환).
export function applyRegen(
  state: StaminaState,
  nowMs: number,
  maxStamina: number = MAX_STAMINA,
): StaminaState {
  if (state.current >= maxStamina) {
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
  const newCurrent = Math.min(maxStamina, state.current + regenPoints);
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
  maxStamina: number = MAX_STAMINA,
): StaminaState | null {
  const regenned = applyRegen(state, nowMs, maxStamina);
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

// === saves 파싱 ====================================================

// saves_kv 의 JSON 에서 stamina 필드를 추출. 옛 데이터엔 없음 → 만피로 시드.
// 손상된 모양도 만피로 대체 (회복 시계 리셋). nowMs 기본값은 Date.now().
export function parseStaminaFromSave(
  raw: unknown,
  nowMs: number = Date.now(),
): StaminaState {
  if (raw && typeof raw === "object") {
    const s = raw as Partial<StaminaState>;
    if (
      typeof s.current === "number" &&
      typeof s.lastUpdatedAt === "number" &&
      Number.isFinite(s.current) &&
      Number.isFinite(s.lastUpdatedAt)
    ) {
      return {
        current: Math.max(0, Math.min(MAX_STAMINA, s.current)),
        lastUpdatedAt: s.lastUpdatedAt,
      };
    }
  }
  return initialStamina(nowMs);
}

// character.v2.staminaCapBonus — 비밀 상점 "한계의 비약"으로 영구 누적되는 최대치 보너스.
export function staminaCapBonusOf(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v)
    ? Math.max(0, Math.floor(v))
    : 0;
}
