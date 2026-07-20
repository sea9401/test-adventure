// v2 장비 강화 — 다이얼 + 순수 헬퍼. 설계: docs/v2-equipment-enhance-plan.md
//
// 장비 개체(iid)당 제한 없이 강화. 효과는 위력만 곱연산(옵션·무게 불변) —
// 굴림(옵션 편차)과 직교하는 별도 진척 축. 매 강화마다 강화석 색을 선택:
//   붉은(맹렬) = 성공률을 끌어올리는 도박 / 푸른(단단) = 파괴 위험 완화.
//
// 결과 = 성공 / 유지 / 하락 / 파괴. +10은 하락 방지 체크포인트이며, +13 도전부터
// 다시 비용·리스크가 확실히 커진다.
// 수급 = 사냥 드랍 전용(PR-2) — 초보자도 줍고 거래소에서 환금(베테랑 수요).

// ── 다이얼 (라이브 실측 후 캘리브) ──────────────────────────────────────────
export type EnhanceStoneId = "red" | "blue";
// 강화 방식 — 골드만(기본, +7까지) 또는 돌. +8부터는 돌 필수(고강 입장권 — 돌 시장가의 근거).
export type EnhanceChoice = EnhanceStoneId | "none";

export const ENHANCE_STONES: Record<EnhanceStoneId, { name: string }> = {
  red: { name: "붉은 강화석" },
  blue: { name: "푸른 강화석" },
};

// 골드만 한계 — 이 레벨 이상에서의 시도는 강화석 필수.
export const ENHANCE_STONE_REQUIRED_FROM = 7;

// 4결과 모델 — n→n+1 시도의 [성공, 유지, 하락, 파괴] %.
// 골드만 기준표. +5부터 성공 얇고 유지 두텁게(제자리걸음에 골드가 녹는 클래식 고강 체감),
// +10 이후는 성공률을 더 낮추고 하락·파괴를 올려 장기 엔드 sink 로 둔다.
export type EnhanceOutcome = "success" | "keep" | "demote" | "destroy";
export const ENHANCE_OUTCOME_TABLE: readonly (readonly [
  number, number, number, number,
])[] = [
  [92, 8, 0, 0],
  [88, 12, 0, 0],
  [84, 16, 0, 0],
  [78, 22, 0, 0],
  [72, 28, 0, 0],
  [50, 40, 10, 0],
  [40, 42, 18, 0],
  [30, 42, 23, 5],
  [22, 42, 27, 9],
  [18, 42, 27, 13],
  [14, 36, 32, 18],
  [12, 34, 34, 20],
  [10, 32, 36, 22],
  [9, 30, 38, 23],
  [8, 28, 40, 24],
  [7, 26, 42, 25],
  [6, 24, 44, 26],
  [5, 22, 46, 27],
  [4, 21, 48, 27],
  [3, 20, 50, 27],
  [3, 19, 50, 28],
];

function baseEnhanceOutcomeRow(level: number): [number, number, number, number] {
  const safeLevel = Math.max(0, Math.floor(level));
  const fixed = ENHANCE_OUTCOME_TABLE[safeLevel];
  if (fixed) return [...fixed] as [number, number, number, number];

  const over = safeLevel - 19;
  const success = Math.max(1, 3 - Math.floor(over / 5));
  const destroy = Math.min(35, 27 + Math.floor((over + 1) / 2));
  const demote = Math.min(55, 50 + Math.floor(over / 3));
  const keep = Math.max(0, 100 - success - demote - destroy);
  return [success, keep, demote, destroy];
}

// 돌 효과 — 결과표 변환.
//   +9까지:
//     🔴 붉은: 성공 +15%p (유지에서 차감, 부족분은 하락에서. 파괴 불변)
//     🔵 푸른: 파괴 → 하락으로 완전 전환 + 하락 −10%p(유지로)
//   +10부터:
//     🔴 붉은: 성공 +10%p, 파괴 +5%p (유지에서 차감, 부족분은 하락에서)
//     🔵 푸른: +12 도전까지 파괴 완전 방어. +13 도전부터 파괴 −10%p,
//       하락 +5%p, 유지 +5%p로 완화.
//   +10 체크포인트: +10→+11 시도의 하락은 유지로 바뀌어 +9로 내려가지 않는다.
export function enhanceOutcomeRow(
  level: number,
  choice: EnhanceChoice,
): readonly [number, number, number, number] {
  const safeLevel = Math.max(0, Math.floor(level));
  let [s, k, d, x] = baseEnhanceOutcomeRow(safeLevel);
  const takeRiskPool = (amount: number): number => {
    const fromKeep = Math.min(amount, k);
    k -= fromKeep;
    const fromDemote = Math.min(amount - fromKeep, d);
    d -= fromDemote;
    return fromKeep + fromDemote;
  };
  if (choice === "red") {
    s += takeRiskPool(safeLevel >= 10 ? 10 : 15);
    if (safeLevel >= 10) x += takeRiskPool(5);
  } else if (choice === "blue") {
    if (safeLevel <= 9) {
      d += x;
      x = 0;
      const calmed = Math.min(10, d);
      d -= calmed;
      k += calmed;
    } else if (safeLevel <= 11) {
      // +10→+11, +11→+12는 푸른 돌의 안전 성장 구간: 파괴를 전부
      // 유지/하락으로 옮긴다. +10 체크포인트는 아래에서 하락도 유지로 바꾼다.
      const guarded = x;
      x = 0;
      k += Math.floor(guarded / 2);
      d += guarded - Math.floor(guarded / 2);
    } else {
      const guarded = Math.min(10, x);
      x -= guarded;
      k += Math.floor(guarded / 2);
      d += guarded - Math.floor(guarded / 2);
    }
  }
  if (safeLevel === 10) {
    // +10 안전 체크포인트: 이 단계에서 나온 하락은 실제 단계 손실 없는 유지다.
    k += d;
    d = 0;
  }
  return [s, k, d, x];
}

// 시도 결과 롤 — rng() ∈ [0,1). 서버 권위.
export function rollEnhanceOutcome(
  level: number,
  choice: EnhanceChoice,
  rng: () => number,
): EnhanceOutcome {
  const [s, k, d] = enhanceOutcomeRow(level, choice);
  const r = rng() * 100;
  if (r < s) return "success";
  if (r < s + k) return "keep";
  if (r < s + k + d) return "demote";
  return "destroy";
}

// 회당 강화석 비용(개) — +12까지는 현실적인 장기 목표가 되도록 완화하고,
// +13 도전(level 12)부터 다시 고비용 엔드게임 구간으로 진입한다.
const ENHANCE_STONE_COST_HIGH: readonly number[] = [
  2, 3, 7, 8, 10, 12, 14, 16, 18, 20, 23,
];
export function enhanceStoneCost(level: number): number {
  const safeLevel = Math.max(0, Math.floor(level));
  // +7 전에는 돌이 선택 사항이므로 기존 비용을 보존한다. 필수 구간(+7 시도)부터
  // 별도 완화 곡선을 적용한다.
  if (safeLevel < 7) return 1 + Math.floor(safeLevel / 3);
  if (safeLevel <= 8) return 1;
  if (safeLevel === 9) return 2;
  const high = ENHANCE_STONE_COST_HIGH[safeLevel - 10];
  if (high != null) return high;
  return 23 + (safeLevel - 20) * 3;
}

// 회당 골드 수수료 — +9까지 제곱 램프, +10 이후 1.45 지수 배율.
// 위력 322 기준 +9→10 ≈ 483k, +10→11 ≈ 847k, +19→20 ≈ 79.4M.
export const ENHANCE_GOLD_K = 15;
export function enhanceGoldCost(power: number, level: number): number {
  const safePower = Math.max(1, Math.floor(power));
  const safeLevel = Math.max(0, Math.floor(level));
  const highMult = safeLevel >= 10 ? 1.45 ** (safeLevel - 9) : 1;
  const raw = safePower * ENHANCE_GOLD_K * (safeLevel + 1) ** 2 * highMult;
  if (!Number.isFinite(raw)) return Number.MAX_SAFE_INTEGER;
  return Math.max(1, Math.min(Number.MAX_SAFE_INTEGER, Math.floor(raw)));
}

// 유니크 강화 비용 배수(강화석·골드 공통) — chase 는 드랍에서, 강화는 장기 투자.
export const ENHANCE_UNIQUE_COST_MULT = 2;

// (성공률 단일치 모델 폐기 — enhanceOutcomeRow/rollEnhanceOutcome 가 대체.)

// ── 개체 강화 상태 ──────────────────────────────────────────────────────────
// equipment.v2.owned[].enhance — 옵셔널(옛 세이브·미강화 = 부재 = 0). 표기 "+7 (16%)".
// 2026-07-09 리밸런스: +10 이전 보너스를 낮추고, +10 이후 고비용 고리스크 구간에서
// 확실한 체감 폭을 준다. 누적: +10=24%, +12=34%(옛 +10), +20=69%.
// bonusPct 필드는 세이브/페이로드 호환을 위해 유지하되 파스 시 레벨 기반으로 정규화
// (구 모델 돌별 누적치는 폐기 — 라이브 도입 수시간 내라 마이그 무해).
export type V2EnhanceState = {
  level: number;
  /** 누적 위력 보너스 %p — 레벨 구간제 표에서 파생(파스 시 정규화). */
  bonusPct: number;
};

export const ENHANCE_LEVEL_BONUS_CUM: readonly number[] = [
  0, 1, 2, 4, 6, 8, 10, 12, 15, 18, 24, 29, 34, 39, 44, 49, 53, 57, 61, 65, 69,
];

export function enhanceBonusPct(level: number): number {
  const safeLevel = Math.max(0, Math.floor(level));
  const fixed = ENHANCE_LEVEL_BONUS_CUM[safeLevel];
  if (fixed != null) return fixed;
  if (safeLevel <= 30) return 69 + (safeLevel - 20) * 2;
  return 89 + (safeLevel - 30);
}

// 방어 파스 — 손상/위조 세이브에서 정수화 + 보너스 레벨 정규화.
// 무의미(level 0 이하)면 undefined(=미강화).
export function parseEnhance(raw: unknown): V2EnhanceState | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as { level?: unknown };
  const levelN = typeof r.level === "number" ? r.level : Number(r.level);
  if (!Number.isFinite(levelN) || levelN <= 0) return undefined;
  const level = Math.floor(levelN);
  return { level, bonusPct: enhanceBonusPct(level) };
}

// ── 강화석 재료·드랍 (PR-2) ─────────────────────────────────────────────────
// 강화석은 V2_MATERIALS 카탈로그(dungeonDrops)에 등재된 재료 — 인벤 재료 탭·거래소
// 재료 거래·NPC 판매가 그대로 동작한다. 드랍은 V2_MATERIALS_ENABLED(제작 보류 플래그)와
// 무관한 hunt 라우트의 독립 롤 — 전 깊이 공통(초보자도 줍고 거래소에서 환금).
export const ENHANCE_STONE_MATERIAL_ID: Record<EnhanceStoneId, string> = {
  red: "v2_red_enhance_stone",
  blue: "v2_blue_enhance_stone",
};

// 승리당 드랍 확률(%) — 의도적으로 매우 희소(사용자 결정: "훨씬 귀하게").
// NPC 판매 없음 — 환금/수급은 거래소 유저 거래 전용(시세는 수요가 결정).
// 푸른 1개 ≈ 333승, 붉은 1개 ≈ 1,000승.
export const ENHANCE_STONE_DROP_PCT: Record<EnhanceStoneId, number> = {
  red: 0.1,
  blue: 0.3,
};

// hunt 승리 보상 롤 — 색별 독립 굴림, 통과 시 1개. rng() ∈ [0,1).
export function rollEnhanceStoneDrops(
  rng: () => number,
  // 확률 배수 — 희귀 탐사(사냥꾼의 탐사로) 등 드랍 부스트용. 기본 1 = 무변경.
  chanceMult: number = 1,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const stone of ["red", "blue"] as const) {
    if (rng() * 100 < ENHANCE_STONE_DROP_PCT[stone] * chanceMult) {
      out[ENHANCE_STONE_MATERIAL_ID[stone]] = 1;
    }
  }
  return out;
}

// 고강 피드 임계 — 이 레벨 이상 도달 성공/파괴 시 전체 소식/전광판에 자랑.
// 2026-06-29 사용자: +9부터(시도 빈도 낮고 사건성 큰 구간).
export const ENHANCE_FEED_MIN_LEVEL = 9;

// 하락 — 레벨 −1(보너스는 구간표 재파생). level 1→0 은 미강화(undefined).
export function demoteEnhance(
  e: V2EnhanceState,
): V2EnhanceState | undefined {
  const level = e.level - 1;
  if (level <= 0) return undefined;
  return { level, bonusPct: enhanceBonusPct(level) };
}

// 강화 반영 위력 — 서버 derive 와 클라 카드(인벤토리/거래소/강화 UI)의 단일 출처.
export function enhancedPower(
  basePower: number,
  enhance: V2EnhanceState | undefined,
): number {
  if (!enhance || enhance.bonusPct <= 0) return basePower;
  return Math.floor(basePower * (1 + enhance.bonusPct / 100));
}
