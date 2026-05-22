import "server-only";

import { isStanceId } from "@/adventure/character/stance";

// /api/save PATCH 들어오는 페이로드의 1차 위생 검사.
//
// 진짜 anti-cheat 는 아니다 — 클라가 권위인 흐름(NPC 보상, 퀘스트 보상, 단발 전투
// 드롭 등)이 다수 존재해서 "정상 범위 안에서 거짓말" 은 막을 수 없다. 이 모듈은
// 두 가지 명백한 케이스만 잡는다:
//
// 1) **명백한 위조** — Infinity / NaN / 음수 골드 / 비현실 절대값 (level 999, gold 1e15 등).
//    실수든 의도든 게임 경제를 즉시 망가뜨리는 페이로드.
// 2) **버그/손상 페이로드** — NaN 이 섞인 캐릭터 상태, 거대 문자열, 등.
//
// "정상 범위 안의 거짓말"(NPC 한테 안 받았는데 100 골드 더해서 PATCH) 은 못 막는다.
// 그건 Theme D (서버 mutator API) 영역.

import type { SyncedKey } from "@/lib/storage/synced-keys";

// 게임 디자인상 절대 넘을 수 없는 상한. 너무 빡빡하면 정상 플레이를 깨고, 너무 느슨하면
// 의미가 없음 — "현실에서 도달 불가" 수준으로 설정.
const CHARACTER_BOUNDS = {
  // 만렙 100 (memory: level-cap-100-expansion). 약간의 여유로 110 까지 허용.
  levelMax: 110,
  // 1e9 (10억 골드) — 1년 풀타임 플레이로도 도달 어려운 수준.
  goldMax: 1_000_000_000,
  // 1e10 — exp 누적은 만렙 도달 후에도 쌓일 수 있어 조금 더 여유.
  expMax: 10_000_000_000,
  // 명성 (fame). 길드 활동 누적이라 1e7 정도면 충분.
  fameMax: 10_000_000,
  // hp/mp — 캐릭터 maxHp 가 레벨/스탯 조합으로 결정되지만 안전 상한.
  hpMax: 1_000_000,
  mpMax: 1_000_000,
};

export type SanitizeResult =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * value 트리를 재귀로 돌면서 NaN/Infinity 가 섞여 있으면 위조/손상으로 간주.
 * 정상 클라이언트는 절대 이런 값을 보내지 않는다.
 */
function hasInvalidNumber(value: unknown, depth = 0): boolean {
  if (depth > 32) return true; // 깊이 폭주도 위조 신호.
  if (typeof value === "number") {
    return !Number.isFinite(value);
  }
  if (Array.isArray(value)) {
    for (const v of value) {
      if (hasInvalidNumber(v, depth + 1)) return true;
    }
    return false;
  }
  if (value && typeof value === "object") {
    for (const v of Object.values(value)) {
      if (hasInvalidNumber(v, depth + 1)) return true;
    }
    return false;
  }
  return false;
}

function checkNumericField(
  value: unknown,
  field: string,
  max: number,
  allowZero = true,
): string | null {
  if (value === undefined) return null; // optional 필드
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return `${field} must be integer`;
  }
  if (value < (allowZero ? 0 : 1)) {
    return `${field} out of range (min ${allowZero ? 0 : 1})`;
  }
  if (value > max) {
    return `${field} out of range (max ${max})`;
  }
  return null;
}

function sanitizeCharacter(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "character must be object";
  }
  const c = value as Record<string, unknown>;
  const checks: Array<[string, unknown, number, boolean]> = [
    ["level", c.level, CHARACTER_BOUNDS.levelMax, false], // level 은 1부터
    ["gold", c.gold, CHARACTER_BOUNDS.goldMax, true],
    ["exp", c.exp, CHARACTER_BOUNDS.expMax, true],
    ["fame", c.fame, CHARACTER_BOUNDS.fameMax, true],
    ["hp", c.hp, CHARACTER_BOUNDS.hpMax, true],
    ["mp", c.mp, CHARACTER_BOUNDS.mpMax, true],
  ];
  for (const [field, val, max, allowZero] of checks) {
    const err = checkNumericField(val, field, max, allowZero);
    if (err) return err;
  }
  // 전술(스탠스) — 미지정/null 이거나 유효한 StanceId 여야 함.
  const stance = c.selectedStance;
  if (stance !== undefined && stance !== null && !isStanceId(stance)) {
    return "invalid selectedStance";
  }
  return null;
}

/**
 * key 별 위생 검사. ok=true 면 통과, ok=false 면 422 응답 + reason.
 */
export function sanitizeSavePayload(
  key: SyncedKey,
  value: unknown,
): SanitizeResult {
  // 모든 키 공통: NaN/Infinity 차단.
  if (hasInvalidNumber(value)) {
    return { ok: false, reason: "invalid number in payload" };
  }

  // character.v2 는 권위 키라 추가 검사.
  if (key === "character.v2") {
    const err = sanitizeCharacter(value);
    if (err) return { ok: false, reason: err };
  }

  return { ok: true };
}
