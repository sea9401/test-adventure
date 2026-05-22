// 전투 전 「전술(스탠스)」 — game-fun-audit 1순위(전투 주도성) 대응.
// docs/battle-tactic-stance-plan.md 참조.
//
// 자동 전투 전제는 유지(수동 발동 부활 아님). 플레이어는 전투 전에 전술을 골라
// 자동 해결의 수치를 편향시킨다. 매크로 위험 0, 즉시해결과 충돌 0.
//
// 효과는 전부 PlayerCombat 필드 보정으로만 표현 → engine.ts 무수정.
// **적용 범위 = 보스/특수 전투에만** (지역 보스 isBoss / 협동 / 고탑 / PvP).
// 일반 사냥·오프라인 오토헌트(offlineSim)는 미적용 — applyStance 를 derive 에
// 보편 주입하지 않고, 특수 전투 진입 지점에서만 게이팅 호출한다.
//
// 수치는 전부 초안 — 실측 후 튜닝(다른 밸런스 다이얼과 동일).

import type { PlayerCombat } from "@/adventure/battle/engine";

export const STANCE_IDS = ["onslaught", "bulwark", "execution"] as const;
export type StanceId = (typeof STANCE_IDS)[number];

export function isStanceId(v: unknown): v is StanceId {
  return (
    typeof v === "string" && (STANCE_IDS as readonly string[]).includes(v)
  );
}

/** 저장값 정규화 — 유효한 StanceId 가 아니면 null(전술 없음). */
export function normalizeStance(v: unknown): StanceId | null {
  return isStanceId(v) ? v : null;
}

// 전투 시작 로그에 박는 한 줄 안내 — 전술이 켜졌음을 플레이어가 알도록(가시성).
// 자연스러운 한국어 문장, 하이픈/마크다운 없이.
const STANCE_BATTLE_LOG: Record<StanceId, string> = {
  onslaught: "공세 전술을 취한다. 공격이 거세지지만 방어와 회피가 무뎌진다.",
  bulwark: "수성 전술을 취한다. 단단히 버티는 대신 공격이 약해진다.",
  execution: "처형 전술을 취한다. 체력이 깎인 적의 남은 숨통을 빠르게 끊는다.",
};

/** 전투 시작 로그용 전술 안내 문구. 전술 없음(null)이면 null. */
export function stanceBattleLogText(
  stance: StanceId | null | undefined,
): string | null {
  return stance ? STANCE_BATTLE_LOG[stance] : null;
}

export type StanceMeta = {
  name: string;
  /** 한 줄 설명 + 어떤 상황에 좋은지. UI 노출. */
  blurb: string;
};

export const STANCE_META: Record<StanceId, StanceMeta> = {
  onslaught: {
    name: "공세",
    blurb:
      "공격을 끌어올리는 대신 방어와 회피가 무뎌진다. 약한 적을 빠르게 정리할 때.",
  },
  bulwark: {
    name: "수성",
    blurb: "버티는 데 특화. 강한 보스나 한기 지역에서 오래 살아남는다.",
  },
  execution: {
    name: "처형",
    blurb: "체력이 깎인 적에게 강하다. 체력 높은 단일 보스의 긴 꼬리를 녹인다.",
  },
};

// 스탠스별 보정값 — 한 곳에서 관리(단일 진실원). 실측 후 튜닝 포인트.
const STANCE_MOD: Record<
  StanceId,
  {
    atkMult: number;
    defMult: number;
    evasionDelta: number;
    executionDamageMultFloor?: number;
    executionHpFractionFloor?: number;
  }
> = {
  onslaught: { atkMult: 1.18, defMult: 0.9, evasionDelta: -5 },
  bulwark: { atkMult: 0.9, defMult: 1.25, evasionDelta: 0 },
  // 2026-05-22 시뮬 튜닝: 초안(0.95/1.3/0.33)은 atk 페널티를 처형 보너스가 못 메워
  // 모든 보스에서 무전술보다 나빴다(시뮬 보통 -5%·탱키 -12%). atk 페널티 제거 +
  // 배수 1.3→1.6 + 발동 구간 33%→45% 로 "고HP 탱키 보스 녹이기" niche 확립
  // (시뮬: 보통 +16%·탱키 +21%, 수성/공세를 압도하진 않음).
  execution: {
    atkMult: 1,
    defMult: 1,
    evasionDelta: 0,
    executionDamageMultFloor: 1.6,
    executionHpFractionFloor: 0.45,
  },
};

/**
 * 전술 보정을 PlayerCombat 에 적용한 새 객체 반환. 순수 함수.
 * stance 가 null/undefined 면 항등(원본 그대로) — 기존 동작 무변화.
 * 보스/특수 전투 진입 지점에서만 호출할 것(일반 사냥/offlineSim 미적용).
 */
export function applyStance(
  player: PlayerCombat,
  stance: StanceId | null | undefined,
): PlayerCombat {
  if (!stance) return player;
  const m = STANCE_MOD[stance];
  const next: PlayerCombat = {
    ...player,
    atk: Math.round(player.atk * m.atkMult),
    def: Math.round(player.def * m.defMult),
    // 회피 하한 클램프 — 음수 방지.
    evasionPct: Math.max(0, player.evasionPct + m.evasionDelta),
  };
  // 처형 스탠스: 스킬 미보유자에게도 기본 처형을 부여(max 합성). 보유자는 더 높은 쪽 유지.
  if (m.executionDamageMultFloor !== undefined) {
    next.executionDamageMult = Math.max(
      player.executionDamageMult ?? 1,
      m.executionDamageMultFloor,
    );
  }
  if (m.executionHpFractionFloor !== undefined) {
    next.executionHpFraction = Math.max(
      player.executionHpFraction ?? 0,
      m.executionHpFractionFloor,
    );
  }
  return next;
}
