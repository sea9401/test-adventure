// v2 장비 강화 — 다이얼 + 순수 헬퍼. 설계: docs/v2-equipment-enhance-plan.md
//
// 장비 개체(iid)당 +0→+ENHANCE_MAX_LEVEL. 효과는 위력만 곱연산(옵션·무게 불변) —
// 굴림(옵션 편차)과 직교하는 별도 진척 축. 매 강화마다 강화석 색을 선택:
//   붉은(맹렬) = 성공 시 +3%p·성공률 −10%p / 푸른(단단) = +2%p·보정 없음.
// 같은 +10 이라도 돌 구성에 따라 +20~30% — 개체 정체성·거래 가치.
//
// 실패 = 재료만 소실(레벨 하락·파괴 없음 — 소수 모수 캐주얼 서버 정책).
// 수급 = 사냥 드랍 전용(PR-2) — 초보자도 줍고 거래소에서 환금(베테랑 수요).

// ── 다이얼 (라이브 실측 후 캘리브) ──────────────────────────────────────────
export const ENHANCE_MAX_LEVEL = 10;

export type EnhanceStoneId = "red" | "blue";
// 강화 방식 — 골드만(기본, +7까지) 또는 돌. +8부터는 돌 필수(고강 입장권 — 돌 시장가의 근거).
export type EnhanceChoice = EnhanceStoneId | "none";

export const ENHANCE_STONES: Record<EnhanceStoneId, { name: string }> = {
  red: { name: "붉은 강화석" },
  blue: { name: "푸른 강화석" },
};

// 골드만 한계 — 이 레벨 이상에서의 시도는 강화석 필수.
export const ENHANCE_STONE_REQUIRED_FROM = 7;

// 4결과 모델(2026-06-11 리밸런스, 사용자) — n→n+1 시도의 [성공, 유지, 하락, 파괴] %.
// 골드만 기준표. +5부터 성공 얇고 유지 두텁게(제자리걸음에 골드가 녹는 클래식 고강 체감),
// 파괴는 +7부터 5/10/15% — 푸른 돌이 완전 방어하므로 골드만/붉은 도박꾼만의 리스크.
export type EnhanceOutcome = "success" | "keep" | "demote" | "destroy";
export const ENHANCE_OUTCOME_TABLE: readonly (readonly [
  number, number, number, number,
])[] = [
  [90, 10, 0, 0],
  [85, 15, 0, 0],
  [80, 20, 0, 0],
  [75, 25, 0, 0],
  [70, 30, 0, 0],
  [50, 40, 10, 0],
  [40, 42, 18, 0],
  [30, 42, 23, 5],
  [22, 42, 26, 10],
  [15, 42, 28, 15],
];

// 돌 효과 — 결과표 변환.
//   🔴 붉은(맹렬): 성공 +15%p (유지에서 차감, 부족분은 하락에서. 파괴 불변 — 도박).
//   🔵 푸른(단단): 파괴 → 하락으로 완전 전환 + 하락 −10%p(유지로). 지키는 돌.
export function enhanceOutcomeRow(
  level: number,
  choice: EnhanceChoice,
): readonly [number, number, number, number] {
  const idx = Math.min(Math.max(0, level), ENHANCE_OUTCOME_TABLE.length - 1);
  let [s, k, d, x] = ENHANCE_OUTCOME_TABLE[idx];
  if (choice === "red") {
    const fromKeep = Math.min(15, k);
    const fromDemote = Math.min(15 - fromKeep, d);
    s += fromKeep + fromDemote;
    k -= fromKeep;
    d -= fromDemote;
  } else if (choice === "blue") {
    d += x;
    x = 0;
    const calmed = Math.min(10, d);
    d -= calmed;
    k += calmed;
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

// 회당 강화석 비용(개) — +0~2: 1, +3~5: 2, +6~8: 3, +9: 4.
export function enhanceStoneCost(level: number): number {
  return 1 + Math.floor(Math.max(0, level) / 3);
}

// 회당 골드 수수료 — 제곱 램프(2026-06-11 리밸런스: 옛 ×2 선형은 수입 대비 20승 분량으로
// 너무 쌌음). 위력 322 기준 +0→1 ≈ 4.8k, +9→10 ≈ 483k. +10 기대 누적 ≈ 1,400만~1,600만 G
// (깊이 48 수입 ~3,300승 분량) — 묵직한 골드 sink.
export const ENHANCE_GOLD_K = 15;
export function enhanceGoldCost(power: number, level: number): number {
  return Math.max(1, Math.floor(power * ENHANCE_GOLD_K * (level + 1) ** 2));
}

// 유니크 강화 비용 배수(강화석·골드 공통) — chase 는 드랍에서, 강화는 장기 투자.
export const ENHANCE_UNIQUE_COST_MULT = 2;

// (성공률 단일치 모델 폐기 — enhanceOutcomeRow/rollEnhanceOutcome 가 대체.)

// ── 개체 강화 상태 ──────────────────────────────────────────────────────────
// equipment.v2.owned[].enhance — 옵셔널(옛 세이브·미강화 = 부재 = 0). 표기 "+7 (16%)".
// 2026-06-11 리밸런스: 보너스 = 레벨 구간제(돌 무관) — +1~5: 2%/강, +6~7: 3%, +8~9: 4%,
// +10: 10% 점프(확실한 리턴). 누적: +5=10% +7=16% +9=24% +10=34%.
// bonusPct 필드는 세이브/페이로드 호환을 위해 유지하되 파스 시 레벨 기반으로 정규화
// (구 모델 돌별 누적치는 폐기 — 라이브 도입 수시간 내라 마이그 무해).
export type V2EnhanceState = {
  level: number;
  /** 누적 위력 보너스 %p — 레벨 구간제 표에서 파생(파스 시 정규화). */
  bonusPct: number;
};

export const ENHANCE_LEVEL_BONUS_CUM: readonly number[] = [
  0, 2, 4, 6, 8, 10, 13, 16, 20, 24, 34,
];

export function enhanceBonusPct(level: number): number {
  const idx = Math.min(
    Math.max(0, Math.floor(level)),
    ENHANCE_LEVEL_BONUS_CUM.length - 1,
  );
  return ENHANCE_LEVEL_BONUS_CUM[idx];
}

// 방어 파스 — 손상/위조 세이브에서 클램프 + 보너스 레벨 정규화.
// 무의미(level 0 이하)면 undefined(=미강화).
export function parseEnhance(raw: unknown): V2EnhanceState | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as { level?: unknown };
  const levelN = typeof r.level === "number" ? r.level : Number(r.level);
  if (!Number.isFinite(levelN) || levelN <= 0) return undefined;
  const level = Math.min(ENHANCE_MAX_LEVEL, Math.floor(levelN));
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
// 푸른 1개 ≈ 333승, 붉은 1개 ≈ 1,000승. +10 1부위 ≈ 돌 ~27개(성공률 반영 기대값).
export const ENHANCE_STONE_DROP_PCT: Record<EnhanceStoneId, number> = {
  red: 0.1,
  blue: 0.3,
};

// hunt 승리 보상 롤 — 색별 독립 굴림, 통과 시 1개. rng() ∈ [0,1).
export function rollEnhanceStoneDrops(
  rng: () => number,
  // 확률 배수 — 레어맵(사냥꾼의 지도) 등 드랍 부스트용. 기본 1 = 무변경.
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
