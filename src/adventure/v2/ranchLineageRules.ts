// 목장 혈통 규칙 상수 — ranch.ts 의 수거 판정과 ranchLineage.ts 의 교배 로직이 함께 읽는다.
//   ranchLineage.ts 가 farm.ts·ranch.ts 를 읽으므로, 그쪽이 필요한 값은 의존성 없는 이 파일에 둔다.

export type RanchLineageAnimalId = "chicken" | "cow" | "pig";
export type RanchRareItemId = "golden_egg" | "rich_milk" | "black_pork";

/** 0 보통 · 1 우량 · 2 특급 · 3 명품 · 4 명장 혈통. */
export const RANCH_LINEAGE_GRADE_NAMES = ["보통", "우량", "특급", "명품", "명장 혈통"] as const;
/** 누구나 올릴 수 있는 마지막 등급(명품). */
export const RANCH_LINEAGE_BASE_MAX_GRADE = 3;
/** 명장 혈통 — 농사 주전공 명장 3단계 이상만 교배할 수 있다. */
export const RANCH_LINEAGE_MASTER_GRADE = 4;

/** 인덱스 = 혈통 등급. 수거할 때 한 주기마다 희귀 산물이 나올 확률(%). */
export const RANCH_LINEAGE_RARE_CHANCE_PCT = [0, 10, 20, 35, 50] as const;
/** 인덱스 = 혈통 등급. 수거할 때 그 칸의 산물을 더 받는 비율(%). */
export const RANCH_LINEAGE_YIELD_BONUS_PCT = [0, 25, 50, 75, 100] as const;

/** 인덱스 = 지금 등급. 다음 등급으로 가는 교배의 기본 성공률(%)과 실패할 때마다 오르는 양(%p). */
export const RANCH_LINEAGE_BREED_CHANCES: readonly { basePct: number; perFailPct: number }[] = [
  { basePct: 50, perFailPct: 10 },
  { basePct: 20, perFailPct: 3 },
  { basePct: 6, perFailPct: 1 },
  { basePct: 3, perFailPct: 0.5 },
];

/** 교배 한 번에 드는 산물(그 칸이 약 2.5일 동안 내는 양)과 배합 사료. */
export const RANCH_LINEAGE_BREED_PRODUCT_COST: Record<RanchLineageAnimalId, number> = {
  chicken: 60,
  cow: 30,
  pig: 20,
};
export const RANCH_LINEAGE_BREED_FEED_COST = 20;
/** 명장 혈통 교배에 더 드는 명장 작물. */
export const RANCH_LINEAGE_MASTER_CROP_COST = 2;

export const RANCH_RARE_ITEM_ID: Record<RanchLineageAnimalId, RanchRareItemId> = {
  chicken: "golden_egg",
  cow: "rich_milk",
  pig: "black_pork",
};

/** 희귀 산물 1개를 납품할 때 받는 농장 증표. */
export const RANCH_RARE_ITEM_REPUTATION: Record<RanchRareItemId, number> = {
  golden_egg: 3,
  rich_milk: 6,
  black_pork: 10,
};

export type RanchLineage = {
  /** 혈통 등급 0~4. */
  grade: number;
  /** 지금 등급에서 연속으로 실패한 교배 횟수. 성공하면 0으로 돌아간다. */
  fails: number;
  /** 산물 수량 증가에서 1개가 안 돼 남겨 둔 몫(1~99, 100이 1개). 없으면 싣지 않는다. */
  yieldCarryPct?: number;
};

export function normalizeRanchLineage(raw: unknown): RanchLineage {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const int = (value: unknown, max: number) =>
    typeof value === "number" && Number.isFinite(value)
      ? Math.max(0, Math.min(max, Math.floor(value)))
      : 0;
  const carry = source.yieldCarryPct;
  return {
    grade: int(source.grade, RANCH_LINEAGE_MASTER_GRADE),
    fails: int(source.fails, 1_000),
    ...(typeof carry === "number" && Number.isInteger(carry) && carry >= 1 && carry <= 99
      ? { yieldCarryPct: carry }
      : {}),
  };
}

export function ranchLineageRareChancePct(grade: number): number {
  return RANCH_LINEAGE_RARE_CHANCE_PCT[normalizeRanchLineage({ grade }).grade];
}

export function ranchLineageYieldBonusPct(grade: number): number {
  return RANCH_LINEAGE_YIELD_BONUS_PCT[normalizeRanchLineage({ grade }).grade];
}

/**
 * 산물 baseItems개를 수거할 때 혈통이 더 주는 개수와 다음으로 넘길 몫.
 * 1개가 안 되는 몫은 버리지 않고 그 칸에 남긴다.
 */
export function ranchLineageYieldBonus(
  lineage: RanchLineage,
  baseItems: number,
): { bonusItems: number; yieldCarryPct: number } {
  const progress =
    (lineage.yieldCarryPct ?? 0) + Math.max(0, Math.floor(baseItems)) * ranchLineageYieldBonusPct(lineage.grade);
  return { bonusItems: Math.floor(progress / 100), yieldCarryPct: progress % 100 };
}

/** 지금 등급과 연속 실패 횟수에서의 교배 성공률(%). 최고 등급이면 0. */
export function ranchLineageBreedChancePct(lineage: RanchLineage): number {
  const step = RANCH_LINEAGE_BREED_CHANCES[lineage.grade];
  if (!step) return 0;
  return Math.min(100, step.basePct + step.perFailPct * lineage.fails);
}
