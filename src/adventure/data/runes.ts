// 룬 시스템 PR-A — 가산형 7종 × 5등급. 슬롯 3개 (CharacterDynamicState.equippedRunes).
//
// 효과는 derivePlayerCombat (ATK/DEF/HP/CRIT) / onBattleEnd (EXP/드롭) /
// battle engine (포션) 에서 등급 magnitude 를 합산해 적용.
//
// proc/trigger 류 (반격·흡혈·재생) 는 전투 엔진 hook 필요 → PR-B 에서 추가.
//
// 5막 PR-D1 — 1~5 등급 magnitude 너프 + 6등급 신설. 6등급은 토큰 상점에서 안 팔리고
// 5등급 ×1 + 별빛 조각 ×20 흡수 강화로만 얻는다(runeFusion.ts). RUNE_TOKEN_PRICES[6]=0
// 은 sentinel — UI/서버가 price===0 가드로 상점 노출/거래 차단.

export type RuneGrade = 1 | 2 | 3 | 4 | 5 | 6;
export const RUNE_GRADES: readonly RuneGrade[] = [1, 2, 3, 4, 5, 6] as const;

// 효과 종류 — 가산 7개 + proc/trigger 3개. 모두 % 단위로 보너스 합산 후 적용.
// rune.effect 는 ID 가 아닌 효과 카테고리 — 같은 카테고리 룬을 여러 슬롯에 끼면 합산된다.
export type RuneEffectKind =
  | "atk_pct" // ATK 가산 %
  | "def_pct" // DEF 가산 %
  | "hp_pct" // 최대 HP 가산 %
  | "crit_pct" // 치명타 확률 가산 %
  | "exp_pct" // 획득 EXP 가산 %
  | "drop_pct" // 드롭률 가산 %
  | "potion_pct" // 포션 회복량 가산 %
  | "counter_pct" // 피격 시 ATK 반격 발동 확률 %
  | "lifesteal_pct" // 명중 시 가한 피해의 % 만큼 HP 회복
  | "regen_pct"; // 전투 승리 시 최대 HP 의 % 만큼 회복

export type RuneFamily = "combat" | "resource";

export type RuneId =
  | "rune_attack"
  | "rune_guard"
  | "rune_life"
  | "rune_crit"
  | "rune_training"
  | "rune_fortune"
  | "rune_alchemy"
  | "rune_counter"
  | "rune_lifesteal"
  | "rune_regen";

export type RuneDef = {
  id: RuneId;
  name: string;
  family: RuneFamily;
  effect: RuneEffectKind;
  description: string;
  /** 등급별 magnitude (% 가산값). RUNE_GRADES 순서. */
  magnitudeByGrade: Record<RuneGrade, number>;
};

// 5막 PR-D1 리밸런스 — 1~5 등급 너프 + 6 신설. 의도된 곡선:
//  - 5등급 = 구 5등급의 약 60~70% (강한 너프)
//  - 6등급 = 구 4~5등급 사이 (5막 별빛 조각 흡수 강화로만 얻음)
//
// 가산형 평탄 — ATK/DEF/HP%, CRIT%. 구: {2,4,6,8,10} → 새: {1,2,3,5,7,9}.
const FLAT_PCT: Record<RuneGrade, number> = {
  1: 1,
  2: 2,
  3: 3,
  4: 5,
  5: 7,
  6: 9,
};
// 자원형 — EXP/드롭/포션%. 구: {5,10,15,20,30} → 새: {3,6,10,15,20,25}.
const RESOURCE_PCT: Record<RuneGrade, number> = {
  1: 3,
  2: 6,
  3: 10,
  4: 15,
  5: 20,
  6: 25,
};
// proc — 반격/흡혈 발동 빈도. 구: {3,6,9,12,15} → 새: {1,2,4,6,8,12}.
const PROC_PCT: Record<RuneGrade, number> = {
  1: 1,
  2: 2,
  3: 4,
  4: 6,
  5: 8,
  6: 12,
};
// 재생 — 전투 후 HP 회복 %. 자동 사냥 휴식 무력화 방지 위해 가장 작은 수치 유지.
// 구: {1,2,3,4,5} → 새: {1,1,2,2,3,4}.
const REGEN_PCT: Record<RuneGrade, number> = {
  1: 1,
  2: 1,
  3: 2,
  4: 2,
  5: 3,
  6: 4,
};

export const RUNES: Record<RuneId, RuneDef> = {
  rune_attack: {
    id: "rune_attack",
    name: "공격의 룬",
    family: "combat",
    effect: "atk_pct",
    description: "장착 시 공격력이 일정 %만큼 증가한다.",
    magnitudeByGrade: FLAT_PCT,
  },
  rune_guard: {
    id: "rune_guard",
    name: "수호의 룬",
    family: "combat",
    effect: "def_pct",
    description: "장착 시 방어력이 일정 %만큼 증가한다.",
    magnitudeByGrade: FLAT_PCT,
  },
  rune_life: {
    id: "rune_life",
    name: "생명의 룬",
    family: "combat",
    effect: "hp_pct",
    description: "장착 시 최대 HP가 일정 %만큼 증가한다.",
    magnitudeByGrade: FLAT_PCT,
  },
  rune_crit: {
    id: "rune_crit",
    name: "치명타의 룬",
    family: "combat",
    effect: "crit_pct",
    description: "장착 시 치명타 확률이 일정 %만큼 증가한다.",
    magnitudeByGrade: FLAT_PCT,
  },
  rune_training: {
    id: "rune_training",
    name: "수련의 룬",
    family: "resource",
    effect: "exp_pct",
    description: "전투에서 얻는 경험치가 일정 %만큼 증가한다.",
    magnitudeByGrade: RESOURCE_PCT,
  },
  rune_fortune: {
    id: "rune_fortune",
    name: "행운의 룬",
    family: "resource",
    effect: "drop_pct",
    description: "전투 후 아이템 드롭률이 일정 %만큼 증가한다.",
    magnitudeByGrade: RESOURCE_PCT,
  },
  rune_alchemy: {
    id: "rune_alchemy",
    name: "연단의 룬",
    family: "resource",
    effect: "potion_pct",
    description: "포션의 회복량이 일정 %만큼 증가한다.",
    magnitudeByGrade: RESOURCE_PCT,
  },
  rune_counter: {
    id: "rune_counter",
    name: "반격의 룬",
    family: "combat",
    effect: "counter_pct",
    description: "피격 시 일정 확률로 적에게 ATK 만큼 반격한다.",
    magnitudeByGrade: PROC_PCT,
  },
  rune_lifesteal: {
    id: "rune_lifesteal",
    name: "흡혈의 룬",
    family: "combat",
    effect: "lifesteal_pct",
    description: "명중한 공격이 가한 피해의 일정 % 만큼 HP를 회복한다.",
    magnitudeByGrade: PROC_PCT,
  },
  rune_regen: {
    id: "rune_regen",
    name: "재생의 룬",
    family: "combat",
    effect: "regen_pct",
    description: "전투 승리 직후 최대 HP의 일정 %만큼 회복한다.",
    magnitudeByGrade: REGEN_PCT,
  },
};

export const RUNE_IDS: readonly RuneId[] = Object.keys(RUNES) as RuneId[];

export const RUNE_SLOT_COUNT = 3;

export type EquippedRune = {
  id: RuneId;
  grade: RuneGrade;
};

// 저장된 룬 슬롯/항목이 "보존할 만한 모양"인지만 검사 — 의미(현재 정의된 id·grade) 인식과
// 분리한다. 모양만 멀쩡하면 미인식 id/grade 도 통과시켜, 코드보다 새로운 세이브를 로드한
// 구버전 클라이언트가 못 알아보는 룬을 조용히 파괴하지 않도록 한다(carry-through).
// 진짜 손상(객체 아님 / 빈 id / 음수·비정수 grade)은 여전히 걸러진다.
export function isWellFormedRuneSlot(v: unknown): v is EquippedRune {
  if (!v || typeof v !== "object") return false;
  const { id, grade } = v as { id?: unknown; grade?: unknown };
  return (
    typeof id === "string" &&
    id.length > 0 &&
    typeof grade === "number" &&
    Number.isInteger(grade) &&
    grade > 0
  );
}

// 미인식 id/grade(carry-through 로 살아남은 룬)에 대해서는 0 을 돌려 전투 합산이 NaN 으로
// 오염되지 않게 한다. 정의된 id+grade 면 magnitude 그대로.
export function getRuneMagnitude(id: RuneId, grade: RuneGrade): number {
  const mag = RUNES[id]?.magnitudeByGrade[grade];
  return typeof mag === "number" && Number.isFinite(mag) ? mag : 0;
}

// 룬 상점 (PR-C2) — 등급별 고탑 토큰 가격. 합성이 등급별 차등(3/4/5/6, runeFusion.ts)으로
// 가팔라진 뒤 재조정. 1T 환산 합성 비용(1T=5토큰 기준)은 g2=15·g3=60·g4=300·g5=1800.
// 옛 ×3 시절 가격(50/150/500)은 합성이 가팔라진 지금 고등급일수록 사는 게 압도적으로 싸져
// 합성할 이유를 없앴다. 판매가를 패리티보다 약간 낮게(완만한 보정) 둬서 사는 건 여전히 살짝
// 싸되 과도한 괴리는 줄인다 — g3=55, g4=220, g5=900. 같은 등급의 룬 종류 7가지
// 모두 동일 가격 — 유저가 빌드에 맞춰 자유롭게 선택하게 한다.
// 5막 PR-D1 — 6등급은 토큰 상점에서 안 팔린다. 가격 0 = sentinel (UI/서버 가드).
export const RUNE_TOKEN_PRICES: Record<RuneGrade, number> = {
  1: 5,
  2: 15,
  3: 55,
  4: 220,
  5: 900,
  6: 0,
};

export function getRuneTokenPrice(grade: RuneGrade): number {
  return RUNE_TOKEN_PRICES[grade];
}

export function isRuneId(v: string): v is RuneId {
  return v in RUNES;
}

export function isRuneGrade(n: number): n is RuneGrade {
  return n === 1 || n === 2 || n === 3 || n === 4 || n === 5 || n === 6;
}
