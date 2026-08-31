import { LIFE_CRAFTING_RECIPE_BY_ID, type LifeFinishedItemId } from "./lifeCrafting";
import { LIFE_PROCESSED_MATERIALS } from "./lifeWorkshopMaterials";
import { MINING_MATERIALS } from "@/adventure/data/v2/miningSpots";
import { WOODCUTTING_MATERIALS } from "@/adventure/data/v2/woodcuttingSpots";

export const LIFE_REQUESTS_SAVE_KEY = "life-requests.v1";
export const LIFE_REQUEST_DAILY_LIMIT = 3;
export const LIFE_REQUEST_WEEKLY_LIMIT = 1;
export const LIFE_REQUEST_CHAIN_UNLOCK_DELIVERIES = 10;
export const LIFE_REQUEST_TRUST_REROLL_UNLOCK = 5;
export const LIFE_REQUEST_TRUST_SPECIAL_UNLOCK = 15;
export const LIFE_REQUEST_TRUST_TITLE_UNLOCK = 35;

export type LifeRequestScope = "daily" | "weekly" | "chain";
export type LifeRequestActivity =
  | "woodcutting"
  | "mining"
  | "farming"
  | "fishing"
  | "cooking";
export type LifeRequestLane =
  | "woodcutting"
  | "mining"
  | "processing"
  | "crafting";
export type LifeRequestItemKind = "material" | "crafted";
export type LifeRequestGrade = "normal" | "skilled" | "expert";
export type LifeRequestRequesterId =
  | "carpenter"
  | "blacksmith"
  | "farm_steward"
  | "innkeeper"
  | "fishing_master";

export const LIFE_REQUEST_REQUESTERS: Record<
  LifeRequestRequesterId,
  { name: string; role: string; description: string; regularTitleId: string }
> = {
  carpenter: { name: "나무꾼 지미", role: "목공 조합", description: "원목 조달과 마을 목조 시설 보수를 맡습니다.", regularTitleId: "life_request_jimmy_regular" },
  blacksmith: { name: "대장장이 볼드", role: "대장간", description: "광석과 금속 부품이 필요한 작업을 의뢰합니다.", regularTitleId: "life_request_bold_regular" },
  farm_steward: { name: "농장 관리인 밀라", role: "농업 조합", description: "공동 밭에 필요한 생활 보조품을 관리합니다.", regularTitleId: "life_request_milla_regular" },
  innkeeper: { name: "조리장 로사", role: "선술집", description: "마을 행사와 조리 작업에 필요한 준비물을 구합니다.", regularTitleId: "life_request_rosa_regular" },
  fishing_master: { name: "낚시 조합장 테오", role: "낚시 조합", description: "출조에 필요한 미끼와 보조 장비를 의뢰합니다.", regularTitleId: "life_request_theo_regular" },
};

export const LIFE_REQUEST_TRUST_LEVELS = [
  { min: 0, label: "초면" },
  { min: 5, label: "안면" },
  { min: 15, label: "신뢰" },
  { min: 35, label: "단골" },
] as const;

export const LIFE_REQUEST_GRADE_ORDER: readonly LifeRequestGrade[] = [
  "normal",
  "skilled",
  "expert",
];

export const LIFE_REQUEST_GRADES: Record<
  LifeRequestGrade,
  {
    label: string;
    unlockDeliveries: number;
    quantityMultiplier: number;
    goldMultiplier: number;
    xpMultiplier: number;
  }
> = {
  normal: {
    label: "일반",
    unlockDeliveries: 0,
    quantityMultiplier: 1,
    goldMultiplier: 1,
    xpMultiplier: 1,
  },
  skilled: {
    label: "숙련",
    unlockDeliveries: 10,
    quantityMultiplier: 2,
    goldMultiplier: 2.35,
    xpMultiplier: 2,
  },
  expert: {
    label: "전문",
    unlockDeliveries: 50,
    quantityMultiplier: 4,
    goldMultiplier: 5,
    xpMultiplier: 4,
  },
};

export type LifeRequestDefinition = {
  id: string;
  scope: LifeRequestScope;
  grade: LifeRequestGrade;
  requesterId: LifeRequestRequesterId;
  lane: LifeRequestLane;
  activity: LifeRequestActivity;
  title: string;
  description: string;
  itemKind: LifeRequestItemKind;
  itemId: string;
  quantity: number;
  rewardGold: number;
  rewardXp: number;
  requiredRequesterTrust?: number;
  requesterSpecial?: boolean;
  chainStage?: 1 | 2 | 3;
  chainTotal?: 3;
  prerequisiteId?: string;
};

export type LifeRequestHistoryEntry = {
  requestId: string;
  scope: LifeRequestScope;
  grade: LifeRequestGrade;
  lane: LifeRequestLane;
  requesterId: LifeRequestRequesterId;
  title: string;
  itemName: string;
  quantity: number;
  rewardGold: number;
  rewardXp: number;
  completedAt: number;
};

export type LifeRequestRecords = {
  byGrade: Record<LifeRequestGrade, number>;
  byLane: Record<LifeRequestLane, number>;
  goldEarned: number;
  xpEarned: number;
};

export type LifeRequestsState = {
  version: 3;
  daily: {
    key: string;
    completedIds: string[];
    rerolledLane: LifeRequestLane | null;
    rerolledOffset: number | null;
  };
  weekly: { key: string; completedIds: string[] };
  chain: { key: string; completedIds: string[] };
  requesterTrust: Record<LifeRequestRequesterId, number>;
  records: LifeRequestRecords;
  history: LifeRequestHistoryEntry[];
  stats: {
    totalDeliveries: number;
    dailyDeliveries: number;
    weeklyDeliveries: number;
    chainDeliveries: number;
  };
};

export type LifeRequestBlockReason =
  | "already_completed"
  | "period_limit"
  | "grade_locked"
  | "requester_locked"
  | "chain_locked";

type SeedRequest = Omit<
  LifeRequestDefinition,
  "scope" | "grade" | "requesterId" | "chainStage" | "chainTotal" | "prerequisiteId"
>;

type ChainSeedRequest = SeedRequest & {
  chainStage: 1 | 2 | 3;
  prerequisiteId?: string;
};

const DAILY_POOLS: Record<LifeRequestLane, readonly SeedRequest[]> = {
  woodcutting: [
    { id: "daily_pine", lane: "woodcutting", activity: "woodcutting", title: "목수의 기초 주문", description: "수리용으로 쓸 곧은 원목을 찾고 있습니다.", itemKind: "material", itemId: "v2_timber", quantity: 18, rewardGold: 900, rewardXp: 18 },
    { id: "daily_birch", lane: "woodcutting", activity: "woodcutting", title: "밝은 결의 목재", description: "실내 장식용 자작나무 원목을 납품해 주세요.", itemKind: "material", itemId: "v2_birch_log", quantity: 14, rewardGold: 1_250, rewardXp: 22 },
    { id: "daily_willow", lane: "woodcutting", activity: "woodcutting", title: "유연한 버드나무 주문", description: "바구니와 손잡이를 만들 버드나무 원목이 필요합니다.", itemKind: "material", itemId: "v2_willow_log", quantity: 10, rewardGold: 1_600, rewardXp: 26 },
  ],
  mining: [
    { id: "daily_iron", lane: "mining", activity: "mining", title: "대장간 철광석 보급", description: "마을 대장간의 기본 철광석을 채워 주세요.", itemKind: "material", itemId: "v2_iron_ore", quantity: 18, rewardGold: 900, rewardXp: 18 },
    { id: "daily_copper", lane: "mining", activity: "mining", title: "구리 배관 수리", description: "마을 시설 수리에 쓸 구리광석이 필요합니다.", itemKind: "material", itemId: "v2_copper_ore", quantity: 14, rewardGold: 1_250, rewardXp: 22 },
    { id: "daily_silver", lane: "mining", activity: "mining", title: "세공소 은광석 주문", description: "정교한 장식품에 사용할 은광석을 납품해 주세요.", itemKind: "material", itemId: "v2_silver_ore", quantity: 10, rewardGold: 1_600, rewardXp: 26 },
  ],
  processing: [
    { id: "daily_softwood", lane: "processing", activity: "woodcutting", title: "규격 목재 묶음", description: "공방에서 바로 쓸 수 있는 다듬은 목재를 구합니다.", itemKind: "material", itemId: "v2_processed_softwood", quantity: 4, rewardGold: 2_400, rewardXp: 30 },
    { id: "daily_ingot", lane: "processing", activity: "mining", title: "규격 금속괴 주문", description: "공방에서 쓸 기초 금속괴를 납품해 주세요.", itemKind: "material", itemId: "v2_basic_ingot", quantity: 4, rewardGold: 2_400, rewardXp: 30 },
    { id: "daily_hardwood", lane: "processing", activity: "woodcutting", title: "단단한 보강재", description: "다리 보수에 사용할 강화 목재가 필요합니다.", itemKind: "material", itemId: "v2_processed_hardwood", quantity: 3, rewardGold: 3_200, rewardXp: 36 },
    { id: "daily_precious_ingot", lane: "processing", activity: "mining", title: "정밀 부품용 금속", description: "정밀 장치에 쓸 귀금속괴를 납품해 주세요.", itemKind: "material", itemId: "v2_precious_ingot", quantity: 3, rewardGold: 3_200, rewardXp: 36 },
  ],
  crafting: [
    { id: "daily_fertilizer", lane: "crafting", activity: "farming", title: "공동 텃밭 거름 지원", description: "재배 시간을 줄이는 유기질 거름을 준비합니다.", itemKind: "crafted", itemId: "organic_fertilizer", quantity: 3, rewardGold: 2_200, rewardXp: 28 },
    { id: "daily_prep_set", lane: "crafting", activity: "cooking", title: "조리대 준비 지원", description: "바쁜 조리 시간을 도울 요리 준비 세트를 구합니다.", itemKind: "crafted", itemId: "cooking_prep_set", quantity: 5, rewardGold: 2_800, rewardXp: 30 },
    { id: "daily_bait_box", lane: "crafting", activity: "fishing", title: "낚시꾼의 미끼 상자", description: "희귀 어종을 노리는 낚시꾼에게 정갈한 미끼 상자를 지원합니다.", itemKind: "crafted", itemId: "tidy_bait_box", quantity: 1, rewardGold: 3_800, rewardXp: 36 },
    { id: "daily_logging_wedge", lane: "crafting", activity: "woodcutting", title: "벌목대 쐐기 보급", description: "초보 벌목꾼에게 지급할 초급 벌목 쐐기가 필요합니다.", itemKind: "crafted", itemId: "logging_wedge_basic", quantity: 1, rewardGold: 4_200, rewardXp: 40 },
    { id: "daily_mining_probe", lane: "crafting", activity: "mining", title: "광산 탐침 보급", description: "초보 광부에게 지급할 초급 광맥 탐침이 필요합니다.", itemKind: "crafted", itemId: "mining_probe_basic", quantity: 1, rewardGold: 4_200, rewardXp: 40 },
  ],
};

const WEEKLY_POOL: readonly SeedRequest[] = [
  { id: "weekly_softwood", lane: "processing", activity: "woodcutting", title: "마을 보수용 목재", description: "일주일 동안 사용할 다듬은 목재를 한꺼번에 조달합니다.", itemKind: "material", itemId: "v2_processed_softwood", quantity: 15, rewardGold: 12_000, rewardXp: 140 },
  { id: "weekly_ingot", lane: "processing", activity: "mining", title: "공공 시설 금속 보급", description: "마을 시설 보수에 필요한 기초 금속괴를 대량 납품합니다.", itemKind: "material", itemId: "v2_basic_ingot", quantity: 15, rewardGold: 12_000, rewardXp: 140 },
  { id: "weekly_fertilizer", lane: "crafting", activity: "farming", title: "공동 텃밭 거름 지원", description: "공동 텃밭에 나눠 줄 유기질 거름을 준비합니다.", itemKind: "crafted", itemId: "organic_fertilizer", quantity: 8, rewardGold: 14_000, rewardXp: 150 },
  { id: "weekly_bait_boxes", lane: "crafting", activity: "fishing", title: "낚시 조합 장비 지원", description: "이번 주 출조에 사용할 정갈한 미끼 상자를 지원합니다.", itemKind: "crafted", itemId: "tidy_bait_box", quantity: 3, rewardGold: 15_000, rewardXp: 160 },
  { id: "weekly_prep_sets", lane: "crafting", activity: "cooking", title: "마을 행사 조리 지원", description: "행사 조리대에 배치할 요리 준비 세트를 대량으로 납품합니다.", itemKind: "crafted", itemId: "cooking_prep_set", quantity: 20, rewardGold: 15_000, rewardXp: 160 },
];

const CHAIN_POOLS: readonly (readonly ChainSeedRequest[])[] = [
  [
    { id: "chain_wood_raw", chainStage: 1, lane: "woodcutting", activity: "woodcutting", title: "교량 보수 1단계 · 원목 확보", description: "교량 골조에 사용할 소나무 원목을 먼저 확보합니다.", itemKind: "material", itemId: "v2_timber", quantity: 30, rewardGold: 1_200, rewardXp: 20 },
    { id: "chain_wood_process", chainStage: 2, prerequisiteId: "chain_wood_raw", lane: "processing", activity: "woodcutting", title: "교량 보수 2단계 · 목재 가공", description: "확보한 원목을 규격에 맞춘 다듬은 목재로 보강합니다.", itemKind: "material", itemId: "v2_processed_softwood", quantity: 6, rewardGold: 3_000, rewardXp: 35 },
    { id: "chain_wood_finish", chainStage: 3, prerequisiteId: "chain_wood_process", lane: "crafting", activity: "woodcutting", title: "교량 보수 3단계 · 작업 도구", description: "마지막 보수 작업에 사용할 초급 벌목 쐐기를 지원합니다.", itemKind: "crafted", itemId: "logging_wedge_basic", quantity: 1, rewardGold: 4_800, rewardXp: 45 },
  ],
  [
    { id: "chain_mine_raw", chainStage: 1, lane: "mining", activity: "mining", title: "수로 정비 1단계 · 광석 확보", description: "수로 장치를 수리할 철광석을 먼저 확보합니다.", itemKind: "material", itemId: "v2_iron_ore", quantity: 30, rewardGold: 1_200, rewardXp: 20 },
    { id: "chain_mine_process", chainStage: 2, prerequisiteId: "chain_mine_raw", lane: "processing", activity: "mining", title: "수로 정비 2단계 · 금속 가공", description: "확보한 광석을 규격에 맞춘 기초 금속괴로 제련합니다.", itemKind: "material", itemId: "v2_basic_ingot", quantity: 6, rewardGold: 3_000, rewardXp: 35 },
    { id: "chain_mine_finish", chainStage: 3, prerequisiteId: "chain_mine_process", lane: "crafting", activity: "mining", title: "수로 정비 3단계 · 점검 도구", description: "마지막 점검에 사용할 초급 광맥 탐침을 지원합니다.", itemKind: "crafted", itemId: "mining_probe_basic", quantity: 1, rewardGold: 4_800, rewardXp: 45 },
  ],
];

const REQUESTER_SPECIAL_REQUESTS: readonly LifeRequestDefinition[] = [
  { id: "special_jimmy_reinforcement", scope: "weekly", grade: "skilled", requesterId: "carpenter", requesterSpecial: true, requiredRequesterTrust: LIFE_REQUEST_TRUST_SPECIAL_UNLOCK, lane: "processing", activity: "woodcutting", title: "지미의 특별 주문 · 오래가는 보강재", description: "오래 버틸 목조 시설에 쓸 강화 목재를 지미에게 지원합니다.", itemKind: "material", itemId: "v2_processed_hardwood", quantity: 8, rewardGold: 18_000, rewardXp: 110 },
  { id: "special_bold_precision", scope: "weekly", grade: "skilled", requesterId: "blacksmith", requesterSpecial: true, requiredRequesterTrust: LIFE_REQUEST_TRUST_SPECIAL_UNLOCK, lane: "processing", activity: "mining", title: "볼드의 특별 주문 · 정밀 금속 부품", description: "볼드가 정밀한 장치에 사용할 귀금속괴를 선별해 납품합니다.", itemKind: "material", itemId: "v2_precious_ingot", quantity: 8, rewardGold: 18_000, rewardXp: 110 },
  { id: "special_milla_fertilizer", scope: "weekly", grade: "skilled", requesterId: "farm_steward", requesterSpecial: true, requiredRequesterTrust: LIFE_REQUEST_TRUST_SPECIAL_UNLOCK, lane: "crafting", activity: "farming", title: "밀라의 특별 주문 · 공동 밭 살리기", description: "지친 공동 밭에 나눠 줄 유기질 거름을 대량으로 준비합니다.", itemKind: "crafted", itemId: "organic_fertilizer", quantity: 9, rewardGold: 18_000, rewardXp: 110 },
  { id: "special_rosa_prep", scope: "weekly", grade: "skilled", requesterId: "innkeeper", requesterSpecial: true, requiredRequesterTrust: LIFE_REQUEST_TRUST_SPECIAL_UNLOCK, lane: "crafting", activity: "cooking", title: "로사의 특별 주문 · 잔칫날 준비", description: "마을 잔칫날 조리대에 배치할 준비 세트를 넉넉히 지원합니다.", itemKind: "crafted", itemId: "cooking_prep_set", quantity: 24, rewardGold: 18_000, rewardXp: 110 },
  { id: "special_theo_bait", scope: "weekly", grade: "skilled", requesterId: "fishing_master", requesterSpecial: true, requiredRequesterTrust: LIFE_REQUEST_TRUST_SPECIAL_UNLOCK, lane: "crafting", activity: "fishing", title: "테오의 특별 주문 · 먼바다 출조", description: "먼바다 출조대가 사용할 정갈한 미끼 상자를 지원합니다.", itemKind: "crafted", itemId: "tidy_bait_box", quantity: 4, rewardGold: 18_000, rewardXp: 110 },
];

function safeInt(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : 0;
}

function completedIds(value: unknown): string[] {
  return Array.isArray(value)
    ? [...new Set(value.filter((id): id is string => typeof id === "string" && id.length <= 100))]
    : [];
}

function isLifeRequestLane(value: unknown): value is LifeRequestLane {
  return value === "woodcutting" || value === "mining" || value === "processing" || value === "crafting";
}

function isLifeRequestGrade(value: unknown): value is LifeRequestGrade {
  return value === "normal" || value === "skilled" || value === "expert";
}

function isLifeRequestScope(value: unknown): value is LifeRequestScope {
  return value === "daily" || value === "weekly" || value === "chain";
}

function isLifeRequestRequesterId(value: unknown): value is LifeRequestRequesterId {
  return typeof value === "string" && value in LIFE_REQUEST_REQUESTERS;
}

function emptyRequesterTrust(): Record<LifeRequestRequesterId, number> {
  return {
    carpenter: 0,
    blacksmith: 0,
    farm_steward: 0,
    innkeeper: 0,
    fishing_master: 0,
  };
}

function parseRequesterTrust(value: unknown): Record<LifeRequestRequesterId, number> {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const trust = emptyRequesterTrust();
  for (const requesterId of Object.keys(trust) as LifeRequestRequesterId[]) {
    trust[requesterId] = safeInt(source[requesterId]);
  }
  return trust;
}

function emptyRecords(): LifeRequestRecords {
  return {
    byGrade: { normal: 0, skilled: 0, expert: 0 },
    byLane: { woodcutting: 0, mining: 0, processing: 0, crafting: 0 },
    goldEarned: 0,
    xpEarned: 0,
  };
}

function parseRecords(value: unknown): LifeRequestRecords {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const grades = source.byGrade && typeof source.byGrade === "object" ? source.byGrade as Record<string, unknown> : {};
  const lanes = source.byLane && typeof source.byLane === "object" ? source.byLane as Record<string, unknown> : {};
  return {
    byGrade: {
      normal: safeInt(grades.normal),
      skilled: safeInt(grades.skilled),
      expert: safeInt(grades.expert),
    },
    byLane: {
      woodcutting: safeInt(lanes.woodcutting),
      mining: safeInt(lanes.mining),
      processing: safeInt(lanes.processing),
      crafting: safeInt(lanes.crafting),
    },
    goldEarned: safeInt(source.goldEarned),
    xpEarned: safeInt(source.xpEarned),
  };
}

function parseHistory(value: unknown): LifeRequestHistoryEntry[] {
  if (!Array.isArray(value)) return [];
  const entries: LifeRequestHistoryEntry[] = [];
  for (const raw of value.slice(-20)) {
    if (!raw || typeof raw !== "object") continue;
    const entry = raw as Record<string, unknown>;
    if (
      typeof entry.requestId !== "string" ||
      typeof entry.title !== "string" ||
      typeof entry.itemName !== "string" ||
      !isLifeRequestScope(entry.scope) ||
      !isLifeRequestGrade(entry.grade) ||
      !isLifeRequestLane(entry.lane) ||
      !isLifeRequestRequesterId(entry.requesterId)
    ) continue;
    entries.push({
      requestId: entry.requestId.slice(0, 100),
      scope: entry.scope,
      grade: entry.grade,
      lane: entry.lane,
      requesterId: entry.requesterId,
      title: entry.title.slice(0, 100),
      itemName: entry.itemName.slice(0, 100),
      quantity: safeInt(entry.quantity),
      rewardGold: safeInt(entry.rewardGold),
      rewardXp: safeInt(entry.rewardXp),
      completedAt: safeInt(entry.completedAt),
    });
  }
  return entries;
}

export function emptyLifeRequestsState(
  dailyKey: string,
  weeklyKey: string,
): LifeRequestsState {
  return {
    version: 3,
    daily: { key: dailyKey, completedIds: [], rerolledLane: null, rerolledOffset: null },
    weekly: { key: weeklyKey, completedIds: [] },
    chain: { key: weeklyKey, completedIds: [] },
    requesterTrust: emptyRequesterTrust(),
    records: emptyRecords(),
    history: [],
    stats: {
      totalDeliveries: 0,
      dailyDeliveries: 0,
      weeklyDeliveries: 0,
      chainDeliveries: 0,
    },
  };
}

export function parseLifeRequestsState(
  raw: unknown,
  dailyKey: string,
  weeklyKey: string,
): LifeRequestsState {
  const source = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const daily = source.daily && typeof source.daily === "object" ? source.daily as Record<string, unknown> : {};
  const weekly = source.weekly && typeof source.weekly === "object" ? source.weekly as Record<string, unknown> : {};
  const chain = source.chain && typeof source.chain === "object" ? source.chain as Record<string, unknown> : {};
  const stats = source.stats && typeof source.stats === "object" ? source.stats as Record<string, unknown> : {};
  return {
    version: 3,
    daily: daily.key === dailyKey
      ? {
          key: dailyKey,
          completedIds: completedIds(daily.completedIds),
          rerolledLane: isLifeRequestLane(daily.rerolledLane) ? daily.rerolledLane : null,
          rerolledOffset: isLifeRequestLane(daily.rerolledLane)
            ? Math.min(2, Math.max(1, safeInt(daily.rerolledOffset) || 1))
            : null,
        }
      : { key: dailyKey, completedIds: [], rerolledLane: null, rerolledOffset: null },
    weekly: weekly.key === weeklyKey ? { key: weeklyKey, completedIds: completedIds(weekly.completedIds) } : { key: weeklyKey, completedIds: [] },
    chain: chain.key === weeklyKey ? { key: weeklyKey, completedIds: completedIds(chain.completedIds) } : { key: weeklyKey, completedIds: [] },
    requesterTrust: parseRequesterTrust(source.requesterTrust),
    records: parseRecords(source.records),
    history: parseHistory(source.history),
    stats: {
      totalDeliveries: safeInt(stats.totalDeliveries),
      dailyDeliveries: safeInt(stats.dailyDeliveries),
      weeklyDeliveries: safeInt(stats.weeklyDeliveries),
      chainDeliveries: safeInt(stats.chainDeliveries),
    },
  };
}

function hash(text: string): number {
  let value = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    value = Math.imul(value ^ text.charCodeAt(index), 16777619);
  }
  return value >>> 0;
}

function roundReward(value: number): number {
  return Math.max(50, Math.round(value / 50) * 50);
}

function requesterForRequest(
  request: Pick<SeedRequest, "lane" | "activity">,
): LifeRequestRequesterId {
  if (request.lane === "woodcutting") return "carpenter";
  if (request.lane === "mining") return "blacksmith";
  if (request.lane === "processing") {
    return request.activity === "woodcutting" ? "carpenter" : "blacksmith";
  }
  if (request.activity === "farming") return "farm_steward";
  if (request.activity === "cooking") return "innkeeper";
  if (request.activity === "fishing") return "fishing_master";
  return request.activity === "woodcutting" ? "carpenter" : "blacksmith";
}

function gradedDailyRequest(
  seed: SeedRequest,
  grade: LifeRequestGrade,
): LifeRequestDefinition {
  const rule = LIFE_REQUEST_GRADES[grade];
  return {
    ...seed,
    id: `${seed.id}:${grade}`,
    scope: "daily",
    grade,
    requesterId: requesterForRequest(seed),
    quantity: Math.max(1, Math.ceil(seed.quantity * rule.quantityMultiplier)),
    rewardGold: roundReward(seed.rewardGold * rule.goldMultiplier),
    rewardXp: Math.max(1, Math.floor(seed.rewardXp * rule.xpMultiplier)),
  };
}

export function lifeRequestsForPeriod(
  dailyKey: string,
  weeklyKey: string,
  rerolledLane: LifeRequestLane | null = null,
  rerolledOffset = 1,
): {
  daily: LifeRequestDefinition[];
  weekly: LifeRequestDefinition[];
  chain: LifeRequestDefinition[];
  special: LifeRequestDefinition[];
} {
  const daily = (Object.keys(DAILY_POOLS) as LifeRequestLane[]).flatMap((lane) => {
    const pool = DAILY_POOLS[lane];
    const baseIndex = hash(`${dailyKey}:${lane}`) % pool.length;
    const offset = rerolledLane === lane ? Math.min(2, Math.max(1, safeInt(rerolledOffset))) : 0;
    const seed = pool[(baseIndex + offset) % pool.length];
    return LIFE_REQUEST_GRADE_ORDER.map((grade) => gradedDailyRequest(seed, grade));
  });
  const weeklyStart = hash(weeklyKey) % WEEKLY_POOL.length;
  const weekly = [0, 1].map((offset) => ({
    ...WEEKLY_POOL[(weeklyStart + offset) % WEEKLY_POOL.length],
    scope: "weekly" as const,
    grade: "normal" as const,
    requesterId: requesterForRequest(WEEKLY_POOL[(weeklyStart + offset) % WEEKLY_POOL.length]),
  }));
  const chainPool = CHAIN_POOLS[hash(`${weeklyKey}:chain`) % CHAIN_POOLS.length];
  const chain = chainPool.map((seed) => ({
    ...seed,
    scope: "chain" as const,
    grade: "skilled" as const,
    requesterId: requesterForRequest(seed),
    chainTotal: 3 as const,
  }));
  return { daily, weekly, chain, special: [...REQUESTER_SPECIAL_REQUESTS] };
}

export function lifeRequestGradeForDeliveries(
  totalDeliveries: number,
): LifeRequestGrade {
  const total = safeInt(totalDeliveries);
  if (total >= LIFE_REQUEST_GRADES.expert.unlockDeliveries) return "expert";
  if (total >= LIFE_REQUEST_GRADES.skilled.unlockDeliveries) return "skilled";
  return "normal";
}

export function lifeRequestGradeUnlocked(
  grade: LifeRequestGrade,
  totalDeliveries: number,
): boolean {
  return safeInt(totalDeliveries) >= LIFE_REQUEST_GRADES[grade].unlockDeliveries;
}

export function lifeRequestTrustGain(request: LifeRequestDefinition): number {
  if (request.scope === "weekly") return 3;
  if (request.scope === "chain") return 2;
  if (request.grade === "expert") return 4;
  if (request.grade === "skilled") return 2;
  return 1;
}

export function lifeRequestTrustLevel(trust: number): {
  label: string;
  min: number;
  next: { label: string; min: number; remaining: number } | null;
} {
  const amount = safeInt(trust);
  const current = [...LIFE_REQUEST_TRUST_LEVELS]
    .reverse()
    .find((level) => amount >= level.min) ?? LIFE_REQUEST_TRUST_LEVELS[0];
  const next = LIFE_REQUEST_TRUST_LEVELS.find((level) => level.min > amount);
  return {
    label: current.label,
    min: current.min,
    next: next ? { label: next.label, min: next.min, remaining: next.min - amount } : null,
  };
}

export type LifeRequestRerollBlockReason = "reroll_used" | "reroll_completed";

export function lifeRequestRerollBlockReason(
  state: LifeRequestsState,
  lane: LifeRequestLane,
  currentDaily: readonly LifeRequestDefinition[],
): LifeRequestRerollBlockReason | null {
  if (state.daily.rerolledLane) return "reroll_used";
  const completedInLane = currentDaily.some(
    (request) => request.lane === lane && state.daily.completedIds.includes(request.id),
  );
  return completedInLane ? "reroll_completed" : null;
}

export function rerollLifeRequestLane(
  state: LifeRequestsState,
  lane: LifeRequestLane,
  currentDaily: readonly LifeRequestDefinition[],
  offset = 1,
): LifeRequestsState | null {
  if (lifeRequestRerollBlockReason(state, lane, currentDaily)) return null;
  return {
    ...state,
    daily: {
      ...state.daily,
      rerolledLane: lane,
      rerolledOffset: Math.min(2, Math.max(1, safeInt(offset))),
    },
  };
}

export function lifeRequestBlockReason(
  state: LifeRequestsState,
  request: LifeRequestDefinition,
): LifeRequestBlockReason | null {
  const bucket = state[request.scope];
  if (bucket.completedIds.includes(request.id)) return "already_completed";
  if (!lifeRequestGradeUnlocked(request.grade, state.stats.totalDeliveries)) {
    return "grade_locked";
  }
  if (
    request.requiredRequesterTrust &&
    state.requesterTrust[request.requesterId] < request.requiredRequesterTrust
  ) {
    return "requester_locked";
  }
  if (
    request.scope === "chain" &&
    request.prerequisiteId &&
    !state.chain.completedIds.includes(request.prerequisiteId)
  ) {
    return "chain_locked";
  }
  if (request.scope === "chain") return null;
  const limit = request.scope === "daily"
    ? LIFE_REQUEST_DAILY_LIMIT
    : LIFE_REQUEST_WEEKLY_LIMIT;
  return bucket.completedIds.length >= limit ? "period_limit" : null;
}

export function lifeRequestItemName(
  request: Pick<LifeRequestDefinition, "itemKind" | "itemId">,
): string {
  if (request.itemKind === "crafted") {
    return LIFE_CRAFTING_RECIPE_BY_ID.get(request.itemId)?.name ?? request.itemId;
  }
  return WOODCUTTING_MATERIALS[request.itemId as keyof typeof WOODCUTTING_MATERIALS]?.name
    ?? MINING_MATERIALS[request.itemId as keyof typeof MINING_MATERIALS]?.name
    ?? LIFE_PROCESSED_MATERIALS[request.itemId as keyof typeof LIFE_PROCESSED_MATERIALS]?.name
    ?? request.itemId;
}

export function completeLifeRequest(
  state: LifeRequestsState,
  request: LifeRequestDefinition,
  completedAt = Date.now(),
): LifeRequestsState | null {
  if (lifeRequestBlockReason(state, request)) return null;
  const trustGain = lifeRequestTrustGain(request);
  const historyEntry: LifeRequestHistoryEntry = {
    requestId: request.id,
    scope: request.scope,
    grade: request.grade,
    lane: request.lane,
    requesterId: request.requesterId,
    title: request.title,
    itemName: lifeRequestItemName(request),
    quantity: request.quantity,
    rewardGold: request.rewardGold,
    rewardXp: request.rewardXp,
    completedAt: safeInt(completedAt),
  };
  return {
    ...state,
    [request.scope]: {
      ...state[request.scope],
      completedIds: [...state[request.scope].completedIds, request.id],
    },
    requesterTrust: {
      ...state.requesterTrust,
      [request.requesterId]: state.requesterTrust[request.requesterId] + trustGain,
    },
    records: {
      byGrade: {
        ...state.records.byGrade,
        [request.grade]: state.records.byGrade[request.grade] + 1,
      },
      byLane: {
        ...state.records.byLane,
        [request.lane]: state.records.byLane[request.lane] + 1,
      },
      goldEarned: state.records.goldEarned + request.rewardGold,
      xpEarned: state.records.xpEarned + request.rewardXp,
    },
    history: [...state.history, historyEntry].slice(-20),
    stats: {
      totalDeliveries: state.stats.totalDeliveries + 1,
      dailyDeliveries: state.stats.dailyDeliveries + (request.scope === "daily" ? 1 : 0),
      weeklyDeliveries: state.stats.weeklyDeliveries + (request.scope === "weekly" ? 1 : 0),
      chainDeliveries: state.stats.chainDeliveries + (request.scope === "chain" ? 1 : 0),
    },
  };
}

export function isLifeFinishedRequestItem(id: string): id is LifeFinishedItemId {
  return LIFE_CRAFTING_RECIPE_BY_ID.has(id);
}
