// 보석 세공 — 채광 부산물인 원석 보석을 깎아 세공 보석을 만든다. 등급은 무작위다.
// 세공 보석은 마법부여를 다시 할 때 남길 줄을 고정하는 데 쓴다(줄 하나에 1개).
// 화면도 읽는 순수 모듈. 세이브 읽기·쓰기는 라우트가 한다.

import { MINING_MATERIAL_ID } from "@/adventure/data/v2/miningSpots";
import { LIFE_MAJOR_PRODUCT_ID } from "./lifeMajorProducts";

export type CutGemGrade = "polished" | "refined" | "flawless";
/** 낮은 등급부터. */
export const CUT_GEM_GRADES: readonly CutGemGrade[] = ["polished", "refined", "flawless"];

export type CutGem = {
  id: string;
  grade: CutGemGrade;
  name: string;
  description: string;
  /**
   * 이 보석으로 줄을 고정할 수 있는 가장 높은 마법부여 등급(세이브의 rank, 숫자가 작을수록 높다).
   * 화면의 단계는 반대로 센다: rank 3 = 1단계, rank 2 = 2단계, rank 1 = 3단계.
   */
  bestRank: 1 | 2 | 3;
};

export const CUT_GEMS: Record<CutGemGrade, CutGem> = {
  polished: {
    id: "v2_cut_gem_polished",
    grade: "polished",
    name: "다듬은 보석",
    description:
      "원석 보석을 깎아 만든 세공 보석. 마법부여 1단계 장비를 다시 마법부여할 때 남길 줄 하나를 고정한다.",
    bestRank: 3,
  },
  refined: {
    id: "v2_cut_gem_refined",
    grade: "refined",
    name: "정교한 보석",
    description:
      "면을 고르게 낸 세공 보석. 마법부여 1·2단계 장비를 다시 마법부여할 때 남길 줄 하나를 고정한다.",
    bestRank: 2,
  },
  flawless: {
    id: "v2_cut_gem_flawless",
    grade: "flawless",
    name: "완벽한 보석",
    description:
      "흠 없이 깎아 낸 세공 보석. 어느 단계의 장비든 다시 마법부여할 때 남길 줄 하나를 고정한다.",
    bestRank: 1,
  },
};

/** 재료 카탈로그 등록용. */
export const CUT_GEM_MATERIALS: Record<string, { id: string; name: string; description: string }> =
  Object.fromEntries(
    CUT_GEM_GRADES.map((grade) => {
      const gem = CUT_GEMS[grade];
      return [gem.id, { id: gem.id, name: gem.name, description: gem.description }];
    }),
  );

export const GEM_CUT_ROUGH_COST = 60;
export const GEM_CUT_MASTER_ALLOY_COST = 3;
export const GEM_CUT_REQUIRED_MINING_LEVEL = 30;
export const GEM_CUT_BATCH_LIMIT = 100;
/** 마법부여에서 줄 하나를 고정할 때 더 드는 골드. */
export const LIBERATION_LOCK_GOLD_PER_LINE = 5_000_000;

export type GemCutMode = "normal" | "master";

/** 등급별 확률(%). 합은 100. */
export const GEM_CUT_CHANCES: Record<GemCutMode, Record<CutGemGrade, number>> = {
  normal: { polished: 70, refined: 25, flawless: 5 },
  master: { polished: 50, refined: 38, flawless: 12 },
};

export function isGemCutMode(value: unknown): value is GemCutMode {
  return value === "normal" || value === "master";
}

export function rollCutGemGrade(mode: GemCutMode, rng: () => number): CutGemGrade {
  const raw = Number(rng());
  const roll = (Number.isFinite(raw) ? Math.min(Math.max(raw, 0), 1 - Number.EPSILON) : 0) * 100;
  let cumulative = 0;
  for (const grade of CUT_GEM_GRADES) {
    cumulative += GEM_CUT_CHANCES[mode][grade];
    if (roll < cumulative) return grade;
  }
  return "flawless";
}

export type GemCuttingErrorCode =
  | "bad_count"
  | "mining_level_required"
  | "master_locked"
  | "not_enough_rough_gems"
  | "not_enough_master_alloy";

export class GemCuttingError extends Error {
  constructor(readonly code: GemCuttingErrorCode) {
    super(code);
    this.name = "GemCuttingError";
  }
}

export type GemCuttingContext = {
  miningLevel: number;
  /** 채광 주전공 명장 3단계 이상인지. */
  masterUnlocked: boolean;
};

function held(materials: Record<string, number>, id: string): number {
  const amount = materials[id];
  return typeof amount === "number" && Number.isFinite(amount) ? Math.max(0, Math.floor(amount)) : 0;
}

function spend(materials: Record<string, number>, id: string, amount: number): void {
  const left = held(materials, id) - amount;
  if (left > 0) materials[id] = left;
  else delete materials[id];
}

/** count 개를 세공한다. 바뀐 재료와 등급별 결과를 새 객체로 돌려주고, 못 하면 사유를 던진다. */
export function cutGems(args: {
  materials: Record<string, number>;
  mode: GemCutMode;
  count: number;
  context: GemCuttingContext;
  rng: () => number;
}): { materials: Record<string, number>; results: Record<CutGemGrade, number> } {
  const { mode, count, context } = args;
  if (!Number.isInteger(count) || count < 1 || count > GEM_CUT_BATCH_LIMIT) {
    throw new GemCuttingError("bad_count");
  }
  if (context.miningLevel < GEM_CUT_REQUIRED_MINING_LEVEL) {
    throw new GemCuttingError("mining_level_required");
  }
  if (mode === "master" && !context.masterUnlocked) throw new GemCuttingError("master_locked");
  const roughId = MINING_MATERIAL_ID.roughGem;
  const alloyId = LIFE_MAJOR_PRODUCT_ID.mining;
  if (held(args.materials, roughId) < GEM_CUT_ROUGH_COST * count) {
    throw new GemCuttingError("not_enough_rough_gems");
  }
  if (mode === "master" && held(args.materials, alloyId) < GEM_CUT_MASTER_ALLOY_COST * count) {
    throw new GemCuttingError("not_enough_master_alloy");
  }

  const materials = { ...args.materials };
  spend(materials, roughId, GEM_CUT_ROUGH_COST * count);
  if (mode === "master") spend(materials, alloyId, GEM_CUT_MASTER_ALLOY_COST * count);
  const results: Record<CutGemGrade, number> = { polished: 0, refined: 0, flawless: 0 };
  for (let index = 0; index < count; index += 1) {
    results[rollCutGemGrade(mode, args.rng)] += 1;
  }
  for (const grade of CUT_GEM_GRADES) {
    if (results[grade] > 0) {
      materials[CUT_GEMS[grade].id] = held(materials, CUT_GEMS[grade].id) + results[grade];
    }
  }
  return { materials, results };
}

/** 이 등급의 보석으로 그 rank 의 장비 줄을 고정할 수 있는지. rank 는 3이 가장 낮고 1이 가장 높다(화면 표기 1·2·3단계의 반대). */
export function cutGemUsableForRank(grade: CutGemGrade, rank: 1 | 2 | 3): boolean {
  return CUT_GEMS[grade].bestRank <= rank;
}

/**
 * 줄 count 개를 고정하는 데 쓸 보석을 고른다. 쓸 수 있는 것 중 낮은 등급부터 쓴다.
 * 모자라면 null.
 */
export function pickLiberationLockGems(
  materials: Record<string, number>,
  rank: 1 | 2 | 3,
  count: number,
): Record<string, number> | null {
  const picked: Record<string, number> = {};
  let remaining = Math.max(0, Math.floor(count));
  for (const grade of CUT_GEM_GRADES) {
    if (remaining === 0) break;
    if (!cutGemUsableForRank(grade, rank)) continue;
    const use = Math.min(remaining, held(materials, CUT_GEMS[grade].id));
    if (use > 0) {
      picked[CUT_GEMS[grade].id] = use;
      remaining -= use;
    }
  }
  return remaining === 0 ? picked : null;
}
