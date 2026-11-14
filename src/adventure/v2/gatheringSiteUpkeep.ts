// 채집지 정비 — 광맥·숲마다 그곳의 원자재와 채광 부산물을 써서 정비 단계를 올리고,
// 단계만큼 그 채집지의 느긋한 자동 채집 시간이 길어진다. 시간당 생산량은 바뀌지 않는다.
// 화면도 읽는 순수 모듈. 재료 저장과 칭호 지급은 라우트가 한다.

import {
  GATHERING_PIONEER_TITLE_ID,
  GATHERING_SITE_MASTER_TITLE_ID,
} from "@/adventure/data/titles";
import {
  MINING_MATERIALS,
  MINING_MATERIAL_ID,
  MINING_NODES,
  type MiningNodeId,
} from "@/adventure/data/v2/miningSpots";
import {
  WOODCUTTING_MATERIALS,
  WOODCUTTING_SPOTS,
  WOODCUTTING_SPOT_IDS,
  WOODCUTTING_TREES,
  type WoodcuttingTreeId,
} from "@/adventure/data/v2/woodcuttingSpots";
import { LIFE_MAJOR_PRODUCT_ID } from "./lifeMajorProducts";

export type GatheringSiteActivity = "mining" | "woodcutting";
export type GatheringSiteId = MiningNodeId | WoodcuttingTreeId;
type GatheringSiteGrade = 1 | 2 | 3 | 4 | 5 | 6;

export type GatheringSite = {
  /** 광맥 id 또는 나무 id. 자동 채집 세션의 sourceId 와 같다. */
  id: GatheringSiteId;
  activity: GatheringSiteActivity;
  name: string;
  grade: GatheringSiteGrade;
  materialId: string;
  materialName: string;
};

/** 누구나 올릴 수 있는 마지막 단계. */
export const GATHERING_SITE_BASE_MAX_STAGE = 5;
/** 명장 정비 — 그 생활의 주전공 명장 3단계 이상만 올릴 수 있다. */
export const GATHERING_SITE_MASTER_STAGE = 6;
export const GATHERING_SITE_MASTER_PRODUCT_COUNT = 20;
/** 칭호 ‘개척자’를 받는 정비 단계 합계. */
export const GATHERING_SITE_TITLE_TOTAL_STAGE = 24;

/**
 * 등급별 "느긋한 작업 1회분" — Lv.100·도구 3단계·채집 전문 랭크 3 기준
 * 2시간 느긋한 작업의 기대 수확량을 10 단위로 맞춘 고정값.
 */
const SESSION_YIELD_BY_GRADE: Record<GatheringSiteGrade, number> = {
  1: 640,
  2: 550,
  3: 430,
  4: 350,
  5: 270,
  6: 220,
};

type StageCost = {
  /** 원자재 비용. 채집지의 1회분을 곱해 개수로 바꾼다. */
  sessions: number;
  byproductId: string;
  byproducts: number;
  masterProducts: number;
};

/** 인덱스 = 목표 단계 − 1. */
const STAGE_COSTS: readonly StageCost[] = [
  { sessions: 3, byproductId: MINING_MATERIAL_ID.stone, byproducts: 200, masterProducts: 0 },
  { sessions: 8, byproductId: MINING_MATERIAL_ID.stone, byproducts: 400, masterProducts: 0 },
  { sessions: 15, byproductId: MINING_MATERIAL_ID.coal, byproducts: 250, masterProducts: 0 },
  { sessions: 25, byproductId: MINING_MATERIAL_ID.coal, byproducts: 500, masterProducts: 0 },
  { sessions: 40, byproductId: MINING_MATERIAL_ID.roughGem, byproducts: 400, masterProducts: 0 },
  {
    sessions: 60,
    byproductId: MINING_MATERIAL_ID.roughGem,
    byproducts: 600,
    masterProducts: GATHERING_SITE_MASTER_PRODUCT_COUNT,
  },
];

/** 인덱스 = 정비 단계. 그 채집지의 느긋한 작업 시간(분). */
const EXTENDED_MINUTES_BY_STAGE = [120, 132, 144, 156, 168, 180, 210] as const;

function byGrade(left: { grade: number }, right: { grade: number }): number {
  return left.grade - right.grade;
}

const MINING_SITES: GatheringSite[] = Object.values(MINING_NODES)
  .map((node) => ({
    id: node.id,
    activity: "mining" as const,
    name: node.name,
    grade: node.grade,
    materialId: node.materialId,
    materialName: MINING_MATERIALS[node.materialId].name,
  }))
  .sort(byGrade);

const WOODCUTTING_SITES: GatheringSite[] = WOODCUTTING_SPOT_IDS.map((spotId) => {
  const spot = WOODCUTTING_SPOTS[spotId];
  const tree = WOODCUTTING_TREES[spot.treeId];
  return {
    id: tree.id,
    activity: "woodcutting" as const,
    name: spot.shortName,
    grade: tree.grade as GatheringSiteGrade,
    materialId: tree.materialId,
    materialName: WOODCUTTING_MATERIALS[tree.materialId].name,
  };
}).sort(byGrade);

/** 광맥 6곳(등급순) 뒤에 숲 6곳(등급순). */
export const GATHERING_SITES: readonly GatheringSite[] = [...MINING_SITES, ...WOODCUTTING_SITES];

export const GATHERING_SITE_BY_ID: ReadonlyMap<GatheringSiteId, GatheringSite> = new Map(
  GATHERING_SITES.map((site) => [site.id, site]),
);

export type GatheringSiteUpkeepState = Partial<Record<GatheringSiteId, number>>;

export function isGatheringSiteId(value: unknown): value is GatheringSiteId {
  return typeof value === "string" && GATHERING_SITE_BY_ID.has(value as GatheringSiteId);
}

function normalizeStage(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return 0;
  return Math.max(0, Math.min(GATHERING_SITE_MASTER_STAGE, Math.floor(raw)));
}

/** 모르는 id 와 0단계는 버린다. */
export function parseGatheringSiteUpkeep(raw: unknown): GatheringSiteUpkeepState {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const state: GatheringSiteUpkeepState = {};
  for (const site of GATHERING_SITES) {
    const stage = normalizeStage((raw as Record<string, unknown>)[site.id]);
    if (stage > 0) state[site.id] = stage;
  }
  return state;
}

export function gatheringSiteStage(
  state: GatheringSiteUpkeepState,
  id: GatheringSiteId,
): number {
  return normalizeStage(state[id] ?? 0);
}

/** 정비 단계에 따른 그 채집지의 느긋한 작업 시간. */
export function gatheringSiteExtendedDurationMs(stage: number): number {
  return EXTENDED_MINUTES_BY_STAGE[normalizeStage(stage)] * 60_000;
}

export type GatheringSiteCost = {
  materialId: string;
  materials: number;
  byproductId: string;
  byproducts: number;
  masterProductId: string;
  masterProducts: number;
};

/** 목표 단계로 올리는 비용. 1~6 밖이면 null. */
export function gatheringSiteCost(
  id: GatheringSiteId,
  targetStage: number,
): GatheringSiteCost | null {
  const stageCost = Number.isInteger(targetStage) ? STAGE_COSTS[targetStage - 1] : undefined;
  const site = GATHERING_SITE_BY_ID.get(id);
  if (!stageCost || !site) return null;
  return {
    materialId: site.materialId,
    materials: stageCost.sessions * SESSION_YIELD_BY_GRADE[site.grade],
    byproductId: stageCost.byproductId,
    byproducts: stageCost.byproducts,
    masterProductId: LIFE_MAJOR_PRODUCT_ID[site.activity],
    masterProducts: stageCost.masterProducts,
  };
}

export type GatheringSiteUpkeepContext = {
  /** 보유 재료(character.v2 의 materials). */
  materials: Record<string, number>;
  /** 생활별로 주전공 명장 3단계 이상인지. */
  masterUnlocked: Record<GatheringSiteActivity, boolean>;
};

export type GatheringSiteBlockReason =
  | "upkeep_max"
  | "upkeep_master_locked"
  | "not_enough_materials"
  | "not_enough_byproducts"
  | "not_enough_master_product";

export class GatheringSiteUpkeepError extends Error {
  constructor(readonly code: GatheringSiteBlockReason) {
    super(code);
    this.name = "GatheringSiteUpkeepError";
  }
}

function held(materials: Record<string, number>, id: string): number {
  const amount = materials[id];
  return typeof amount === "number" && Number.isFinite(amount) ? Math.max(0, Math.floor(amount)) : 0;
}

export function gatheringSiteBlockReason(
  state: GatheringSiteUpkeepState,
  id: GatheringSiteId,
  context: GatheringSiteUpkeepContext,
): GatheringSiteBlockReason | null {
  const stage = gatheringSiteStage(state, id);
  const cost = gatheringSiteCost(id, stage + 1);
  const site = GATHERING_SITE_BY_ID.get(id);
  if (!cost || !site) return "upkeep_max";
  if (stage >= GATHERING_SITE_BASE_MAX_STAGE && !context.masterUnlocked[site.activity]) {
    return "upkeep_master_locked";
  }
  if (held(context.materials, cost.materialId) < cost.materials) return "not_enough_materials";
  if (held(context.materials, cost.byproductId) < cost.byproducts) return "not_enough_byproducts";
  if (held(context.materials, cost.masterProductId) < cost.masterProducts) {
    return "not_enough_master_product";
  }
  return null;
}

export type GatheringSiteUpkeepResult = {
  siteId: GatheringSiteId;
  siteName: string;
  stage: number;
  extendedDurationMs: number;
  cost: GatheringSiteCost;
};

/** 한 단계 정비한다. 바뀐 단계와 재료를 새 객체로 돌려주고, 못 하면 사유를 던진다. */
export function upkeepGatheringSite(
  state: GatheringSiteUpkeepState,
  id: GatheringSiteId,
  context: GatheringSiteUpkeepContext,
): {
  state: GatheringSiteUpkeepState;
  materials: Record<string, number>;
  result: GatheringSiteUpkeepResult;
} {
  const blocked = gatheringSiteBlockReason(state, id, context);
  if (blocked) throw new GatheringSiteUpkeepError(blocked);
  const stage = gatheringSiteStage(state, id) + 1;
  const cost = gatheringSiteCost(id, stage)!;
  const materials = { ...context.materials };
  for (const [materialId, amount] of [
    [cost.materialId, cost.materials],
    [cost.byproductId, cost.byproducts],
    [cost.masterProductId, cost.masterProducts],
  ] as const) {
    if (amount <= 0) continue;
    const left = held(materials, materialId) - amount;
    if (left > 0) materials[materialId] = left;
    else delete materials[materialId];
  }
  return {
    state: { ...state, [id]: stage },
    materials,
    result: {
      siteId: id,
      siteName: GATHERING_SITE_BY_ID.get(id)!.name,
      stage,
      extendedDurationMs: gatheringSiteExtendedDurationMs(stage),
      cost,
    },
  };
}

export function gatheringSiteTotalStage(state: GatheringSiteUpkeepState): number {
  return GATHERING_SITES.reduce((total, site) => total + gatheringSiteStage(state, site.id), 0);
}

/** 지금 정비 단계로 조건을 채운 칭호. 지급 여부는 라우트가 보유 칭호와 견줘 정한다. */
export function gatheringSiteEarnedTitleIds(state: GatheringSiteUpkeepState): string[] {
  const titleIds: string[] = [];
  if (gatheringSiteTotalStage(state) >= GATHERING_SITE_TITLE_TOTAL_STAGE) {
    titleIds.push(GATHERING_PIONEER_TITLE_ID);
  }
  if (
    GATHERING_SITES.every(
      (site) => gatheringSiteStage(state, site.id) >= GATHERING_SITE_BASE_MAX_STAGE,
    )
  ) {
    titleIds.push(GATHERING_SITE_MASTER_TITLE_ID);
  }
  return titleIds;
}
