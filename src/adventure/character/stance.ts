// 전투 전 「전술(스탠스)」 — game-fun-audit 1순위(전투 주도성) 대응.
// docs/battle-tactic-stance-plan.md 참조.
//
// 자동 전투 전제는 유지(수동 발동 부활 아님). 플레이어는 전투 전에 전술을 골라
// 자동 해결의 수치를 편향시킨다. 매크로 위험 0, 즉시해결과 충돌 0.
//
// 전투 보정(공세/수성/처형)은 전부 PlayerCombat 필드 보정으로만 표현 → engine.ts 무수정.
// **전투 보정 적용 범위 = 보스/특수 전투에만** (지역 보스 isBoss / 협동 / 고탑 / PvP).
// 일반 사냥·오프라인 오토헌트(offlineSim)는 미적용 — applyStance 를 derive 에
// 보편 주입하지 않고, 특수 전투 진입 지점에서만 게이팅 호출한다.
//
// 「전술 없음」(null) 은 죽은 선택지가 아니라 「노획」 전술 — 전투 보정 0 인 대신 보스 전투의
// 전리품·경험치를 끌어올린다(stanceRewardMult). 보상 보너스는 지역 보스(battleClaim)에만
// 적용 — 고탑/협동/PvP 는 보상 모델이 달라 미적용(stanceRewardMult 주석 참조).
//
// 수치는 전부 초안 — 실측 후 튜닝(다른 밸런스 다이얼과 동일).

import type { PlayerCombat } from "@/adventure/v2/combat/engine";

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
};

export const STANCE_META: Record<StanceId, StanceMeta> = {
  onslaught: { name: "공세" },
  bulwark: { name: "수성" },
  execution: { name: "처형" },
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
  // 2026-05-22 폭 축소(scripts/sim-stance.ts 측정): 1차 값(공세 1.18/0.9, 수성 0.9/1.25,
  // 처형 1.6)은 "유리한 스탠스 골라잡기"로 보스를 과하게 쉽게 만들었다 — 수성이 생존바운드
  // 보스 승률을 +15~+55%p(순례자 27→82) 끌어올렸다. 보스 수치는 안 건드리고 스탠스 폭만
  // 줄여 최대 완화폭을 ~+10%p / 월드보스 공세 +27%→+13% 로 낮춤. 주도성은 유지(트레이드오프
  // 유의미: 공세=빠르나 위험, 수성=생존, 처형=완만 마무리), 난이도 지우개 효과만 제거.
  // 2026-05-23 처형 atk 페널티 복원(1.0→0.96): 페널티 0 이라 「없음」 대비 전 축(WR·턴·HP)
  // 우위인 무대가 지배 스탠스였다. sim 으로 0.88~0.96 sweep — 0.94 이하는 마무리 처치턴 이점까지
  // 사라져 죽은 스탠스, 0.96 이 마무리 정체성 유지 + 협동/장기전 가한뎀 -5~10% 비용을 만드는
  // 지점. 선행 공격 -4% 는 stanceEffectChips 로 UI 에도 자동 노출.
  onslaught: { atkMult: 1.12, defMult: 0.92, evasionDelta: -4 },
  bulwark: { atkMult: 0.92, defMult: 1.14, evasionDelta: 0 },
  // 처형: 기본 공격은 낮추고, HP<45% 적에게 ×1.4 마무리 보정 부여. 미보유자에게도 floor 합성.
  execution: {
    atkMult: 0.96,
    defMult: 1,
    evasionDelta: 0,
    executionDamageMultFloor: 1.4,
    executionHpFractionFloor: 0.45,
  },
};

// 「노획」 전술 — stance 없음(null). 전투 보정은 0(applyStance 항등)인 대신, 보스 전투의
// 전리품·경험치 획득을 끌어올린다. 다른 3개 전투 스탠스의 기회비용(전투 우위)을 포기하는
// 대가로 보상을 챙기는 트레이드오프. **드랍률·경험치는 PlayerCombat 필드가 아니라 보상
// 계산 단계 값**이라 applyStance 로는 못 싣고, battleClaim 보스 경로에서 stanceRewardMult 로
// 곱한다. 적용 범위 = 지역 보스(battleClaim)만 — 고탑(마일스톤 고정)·협동(기여도 모델)·PvP
// (보상 없음)는 보상 모델이 달라 미적용. 수치는 초안, 실측 후 튜닝.
export type StanceRewardMult = { dropRateMult: number; expMult: number };

const NO_STANCE_REWARD: StanceRewardMult = { dropRateMult: 1, expMult: 1 };
const GREED_REWARD: StanceRewardMult = { dropRateMult: 1.25, expMult: 1.15 };

/**
 * 전술별 보상 배율 — 보스 전투 보상 경로(battleClaim)에서만 곱할 것.
 * 노획(null) 만 보너스, 전투 스탠스 3종은 항등(1×). 호출부가 isBoss 게이팅 책임.
 */
export function stanceRewardMult(
  stance: StanceId | null | undefined,
): StanceRewardMult {
  return stance ? NO_STANCE_REWARD : GREED_REWARD;
}

/**
 * 전술 보정을 PlayerCombat 에 적용한 새 객체 반환. 순수 함수.
 * stance 가 null/undefined(노획) 면 항등(원본 그대로) — 전투 보정 없음.
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
    // 회피 대결형(Slice 1) — evaRating 도 같은 델타로 동기(스탠스는 현재 PvP 전용이나 PvE 적용 대비 방어).
    evaRating: Math.max(0, (player.evaRating ?? player.evasionPct) + m.evasionDelta),
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

// 전술 효과를 UI 칩으로 — STANCE_MOD 단일 진실원에서 도출하므로 수치 튜닝 시 자동 동기.
// buff(이득)/penalty(손해)/neutral 로 색을 구분해 "뭐가 좋아지는지" 한눈에.
export type StanceEffectChip = {
  label: string;
  kind: "buff" | "penalty" | "neutral";
};

/**
 * 전술별 보정 수치 칩. stance 없음(null) = 노획 — 전투 칩 대신 보상 칩(드랍/경험치).
 * 모든 수치는 단일 진실원(STANCE_MOD / GREED_REWARD)에서 도출 → 튜닝 시 UI 자동 동기.
 */
export function stanceEffectChips(
  stance: StanceId | null | undefined,
): StanceEffectChip[] {
  // 곱연산 보정 → ± 퍼센트. 1.12 → +12%, 0.92 → -8%.
  const signed = (n: number) => `${n > 0 ? "+" : ""}${n}`;
  if (!stance) {
    // 노획: 보스 한정 드랍률·경험치 보너스. 전투 보정은 없음(기회비용으로 표현).
    const r = stanceRewardMult(null);
    const dropPct = Math.round((r.dropRateMult - 1) * 100);
    const expPct = Math.round((r.expMult - 1) * 100);
    return [
      { label: `보스 드랍률 ${signed(dropPct)}%`, kind: "buff" },
      { label: `보스 경험치 ${signed(expPct)}%`, kind: "buff" },
    ];
  }
  const m = STANCE_MOD[stance];
  const chips: StanceEffectChip[] = [];
  const atkPct = Math.round((m.atkMult - 1) * 100);
  if (atkPct !== 0) {
    chips.push({
      label: `공격 ${signed(atkPct)}%`,
      kind: atkPct > 0 ? "buff" : "penalty",
    });
  }
  const defPct = Math.round((m.defMult - 1) * 100);
  if (defPct !== 0) {
    chips.push({
      label: `방어 ${signed(defPct)}%`,
      kind: defPct > 0 ? "buff" : "penalty",
    });
  }
  if (m.evasionDelta !== 0) {
    chips.push({
      label: `회피 ${signed(m.evasionDelta)}%p`,
      kind: m.evasionDelta > 0 ? "buff" : "penalty",
    });
  }
  if (
    m.executionDamageMultFloor !== undefined &&
    m.executionHpFractionFloor !== undefined
  ) {
    const dmgPct = Math.round((m.executionDamageMultFloor - 1) * 100);
    const hpPct = Math.round(m.executionHpFractionFloor * 100);
    chips.push({ label: `HP ${hpPct}%↓ 적 +${dmgPct}% 피해`, kind: "buff" });
  }
  return chips;
}
