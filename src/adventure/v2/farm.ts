export const FARM_SAVE_KEY = "farm.v2";

export const FARM_PLOT_COUNT = 3;

export const FARM_MAX_PLOT_COUNT = 5;

export const FARM_DAILY_DELIVERY_LIMIT = 2;

export type FarmCropId = "wheat" | "herb" | "corn";

export type FarmSeedInventory = Partial<Record<FarmCropId, number>>;
export type FarmItemInventory = Partial<Record<FarmItemId, number>>;

export const FARM_DAILY_QUEST_SEED_POUCH_NAME = "낡은 씨앗 주머니";

export const FARM_DAILY_QUEST_SEED_REWARD: Record<FarmCropId, number> = {
  wheat: 4,
  herb: 2,
  corn: 1,
};

export const FARM_FISHING_SEED_POUCH_NAME = "물가 씨앗 주머니";

export const FARM_FISHING_CONTRACT_SEED_REWARD: FarmSeedInventory = {
  wheat: 2,
  herb: 1,
};

export const FARM_FISHING_SHOP_SEED_REWARD: Record<FarmCropId, number> = {
  wheat: 3,
  herb: 2,
  corn: 1,
};

export type FarmPlotUpgrade = {
  plotCount: number;
  reputationRequired: number;
  title: string;
};

export const FARM_PLOT_UPGRADES: readonly FarmPlotUpgrade[] = [
  { plotCount: 4, reputationRequired: 8, title: "두 번째 밭두렁" },
  { plotCount: 5, reputationRequired: 20, title: "작은 공동 텃밭" },
];

export type FarmItemId =
  | "wheat"
  | "golden_wheat"
  | "herb"
  | "silverleaf"
  | "corn"
  | "sweet_corn";

export type FarmCrop = {
  id: FarmCropId;
  name: string;
  seedName: string;
  itemId: FarmItemId;
  itemName: string;
  rareItemId: FarmItemId;
  rareItemName: string;
  growMs: number;
  yieldMin: number;
  yieldMax: number;
  rareChance: number;
  note: string;
};

export type FarmPlot = {
  id: string;
  cropId: FarmCropId | null;
  plantedAt: number | null;
  readyAt: number | null;
};

export type FarmState = {
  version: 1;
  plots: FarmPlot[];
  inventory: FarmItemInventory;
  seeds: FarmSeedInventory;
  deliveries: {
    dayKey: string;
    claimedIds: string[];
  };
  weekly: {
    weekKey: string;
    claimedIds: string[];
  };
  stats: {
    harvests: number;
    rareHarvests: number;
    deliveries: number;
    reputation: number;
    reputationSpent: number;
  };
};

export type FarmHarvestResult = {
  plotId: string;
  cropId: FarmCropId;
  itemId: FarmItemId;
  itemName: string;
  quantity: number;
  rareItemId: FarmItemId | null;
  rareItemName: string | null;
  rareQuantity: number;
};

export type FarmDeliveryRequest = {
  id: string;
  title: string;
  note: string;
  requiredItemId: FarmItemId;
  requiredItemName: string;
  requiredQuantity: number;
  rewardSeeds: FarmSeedInventory;
  rewardReputation: number;
};

export type FarmDeliveryResult = {
  requestId: string;
  title: string;
  rewardSeeds: FarmSeedInventory;
  rewardReputation: number;
};

export type FarmSpecialDeliveryRequest = {
  id: string;
  title: string;
  note: string;
  requiredItems: FarmItemInventory;
  rewardSeeds: FarmSeedInventory;
  rewardReputation: number;
};

export type FarmSpecialDeliveryResult = {
  requestId: string;
  title: string;
  rewardSeeds: FarmSeedInventory;
  rewardReputation: number;
};

export type FarmWeeklyDeliveryRequest = {
  id: string;
  title: string;
  note: string;
  requiredItems: FarmItemInventory;
  rewardSeeds: FarmSeedInventory;
  rewardReputation: number;
};

export type FarmWeeklyDeliveryResult = {
  requestId: string;
  title: string;
  rewardSeeds: FarmSeedInventory;
  rewardReputation: number;
};

export type FarmShopItem = {
  id: string;
  title: string;
  note: string;
  costReputation: number;
  rewardSeeds: FarmSeedInventory;
};

export type FarmShopPurchaseResult = {
  itemId: string;
  title: string;
  costReputation: number;
  rewardSeeds: FarmSeedInventory;
};

export const FARM_CROPS: Record<FarmCropId, FarmCrop> = {
  wheat: {
    id: "wheat",
    name: "밀",
    seedName: "밀 씨앗",
    itemId: "wheat",
    itemName: "밀",
    rareItemId: "golden_wheat",
    rareItemName: "황금 밀",
    growMs: 5 * 60 * 1000,
    yieldMin: 3,
    yieldMax: 5,
    rareChance: 0.05,
    note: "빠르게 자라는 기본 작물. 납품과 빵 재료로 쓰기 좋습니다.",
  },
  herb: {
    id: "herb",
    name: "허브",
    seedName: "허브 씨앗",
    itemId: "herb",
    itemName: "허브",
    rareItemId: "silverleaf",
    rareItemName: "은빛잎",
    growMs: 15 * 60 * 1000,
    yieldMin: 2,
    yieldMax: 4,
    rareChance: 0.08,
    note: "회복 음식과 포션 계열로 확장하기 좋은 약초 작물입니다.",
  },
  corn: {
    id: "corn",
    name: "옥수수",
    seedName: "옥수수 씨앗",
    itemId: "corn",
    itemName: "옥수수",
    rareItemId: "sweet_corn",
    rareItemName: "달콤 옥수수",
    growMs: 60 * 60 * 1000,
    yieldMin: 5,
    yieldMax: 8,
    rareChance: 0.1,
    note: "오래 걸리지만 수확량이 좋습니다. 미끼·간식 재료로 이어가기 쉽습니다.",
  },
};

export const FARM_CROP_LIST = Object.values(FARM_CROPS);

export const FARM_STARTER_SEEDS: Record<FarmCropId, number> = {
  wheat: 3,
  herb: 1,
  corn: 0,
};

export function emptyFarmState(now = Date.now()): FarmState {
  return {
    version: 1,
    plots: createFarmPlots(FARM_PLOT_COUNT),
    inventory: {},
    seeds: { ...FARM_STARTER_SEEDS },
    deliveries: { dayKey: farmDayKey(now), claimedIds: [] },
    weekly: { weekKey: farmWeekKey(now), claimedIds: [] },
    stats: {
      harvests: 0,
      rareHarvests: 0,
      deliveries: 0,
      reputation: 0,
      reputationSpent: 0,
    },
  };
}

export function parseFarmState(raw: unknown): FarmState {
  const fallback = emptyFarmState();
  if (!raw || typeof raw !== "object") return fallback;
  const value = raw as Partial<FarmState>;
  const stats = {
    harvests: nonNegativeInt(value.stats?.harvests),
    rareHarvests: nonNegativeInt(value.stats?.rareHarvests),
    deliveries: nonNegativeInt(value.stats?.deliveries),
    reputation: nonNegativeInt(value.stats?.reputation),
    reputationSpent: nonNegativeInt(value.stats?.reputationSpent),
  };
  const plots = createFarmPlots(farmPlotCountForReputation(stats.reputation)).map(
    (base, index) => {
      const candidate = Array.isArray(value.plots) ? value.plots[index] : null;
      if (!candidate || typeof candidate !== "object") return base;
      const p = candidate as Partial<FarmPlot>;
      const cropId = isFarmCropId(p.cropId) ? p.cropId : null;
      const plantedAt = cropId ? positiveNumberOrNull(p.plantedAt) : null;
      const readyAt = cropId ? positiveNumberOrNull(p.readyAt) : null;
      return {
        id: base.id,
        cropId,
        plantedAt,
        readyAt,
      };
    },
  );
  return {
    version: 1,
    plots,
    inventory: parseInventory(value.inventory),
    seeds:
      value.seeds === undefined
        ? { ...FARM_STARTER_SEEDS }
        : parseSeedInventory(value.seeds),
    deliveries: parseDeliveryState(value.deliveries),
    weekly: parseWeeklyState(value.weekly),
    stats,
  };
}

export function getFarmDeliveryRequests(): FarmDeliveryRequest[] {
  return [
    {
      id: "bakery-wheat",
      title: "마을 제빵소 보급",
      note: "여관과 제빵소에서 가장 자주 찾는 기본 납품입니다.",
      requiredItemId: "wheat",
      requiredItemName: "밀",
      requiredQuantity: 3,
      rewardSeeds: {},
      rewardReputation: 2,
    },
    {
      id: "clinic-herb",
      title: "치료소 약초 묶음",
      note: "모험가 치료소가 하루치 약초를 모으고 있습니다.",
      requiredItemId: "herb",
      requiredItemName: "허브",
      requiredQuantity: 2,
      rewardSeeds: {},
      rewardReputation: 3,
    },
    {
      id: "market-corn",
      title: "장터 간식 상자",
      note: "오래 자라는 작물을 요구하지만 농장 명성을 크게 올립니다.",
      requiredItemId: "corn",
      requiredItemName: "옥수수",
      requiredQuantity: 5,
      rewardSeeds: {},
      rewardReputation: 4,
    },
  ];
}

export function getFarmSpecialDeliveryRequests(): FarmSpecialDeliveryRequest[] {
  return [
    {
      id: "rare-golden-wheat",
      title: "제빵장의 황금 밀 주문",
      note: "희귀 수확으로 얻은 황금 밀을 고급 빵 재료로 넘깁니다.",
      requiredItems: { golden_wheat: 1 },
      rewardSeeds: {},
      rewardReputation: 3,
    },
    {
      id: "rare-silverleaf",
      title: "치료소 은빛잎 표본",
      note: "은빛잎은 약효가 좋아 치료소에서 별도 사례를 제공합니다.",
      requiredItems: { silverleaf: 1 },
      rewardSeeds: {},
      rewardReputation: 4,
    },
    {
      id: "rare-sweet-corn",
      title: "장터 달콤 옥수수 상자",
      note: "달콤 옥수수는 축제 간식 재료로 높은 값을 받습니다.",
      requiredItems: { sweet_corn: 1 },
      rewardSeeds: {},
      rewardReputation: 5,
    },
  ];
}

export function getFarmWeeklyDeliveryRequests(): FarmWeeklyDeliveryRequest[] {
  return [
    {
      id: "weekly-bakery-crate",
      title: "주간 제빵소 밀 상자",
      note: "이번 주 여관과 제빵소에 들어갈 밀을 한 번에 납품합니다.",
      requiredItems: { wheat: 30, golden_wheat: 1 },
      rewardSeeds: {},
      rewardReputation: 8,
    },
    {
      id: "weekly-clinic-bundle",
      title: "주간 치료소 약초 묶음",
      note: "치료소가 회복약 재료를 넉넉히 확보하려 합니다.",
      requiredItems: { herb: 16, silverleaf: 1 },
      rewardSeeds: {},
      rewardReputation: 9,
    },
    {
      id: "weekly-market-cart",
      title: "주간 장터 간식 수레",
      note: "오래 자란 옥수수와 희귀 수확을 모아 장터에 보냅니다.",
      requiredItems: { corn: 24, sweet_corn: 1 },
      rewardSeeds: {},
      rewardReputation: 10,
    },
  ];
}

export function getFarmShopItems(): FarmShopItem[] {
  return [
    {
      id: "seed-crate",
      title: "마을 씨앗 상자",
      note: "씨앗이 끊겼을 때 하루 재파종을 보조하는 소량 묶음입니다.",
      costReputation: 8,
      rewardSeeds: { wheat: 2, herb: 1 },
    },
    {
      id: "herbal-seed-box",
      title: "약초 씨앗 상자",
      note: "허브가 모자랄 때 보충하는 치료소 추천 씨앗입니다.",
      costReputation: 10,
      rewardSeeds: { herb: 2 },
    },
    {
      id: "market-seed-box",
      title: "장터 씨앗 상자",
      note: "옥수수 재배를 이어가기 위한 비싼 장터 보충품입니다.",
      costReputation: 12,
      rewardSeeds: { corn: 2 },
    },
  ];
}

export function normalizeFarmForDay(
  state: FarmState,
  now = Date.now(),
): FarmState {
  const withPlots = normalizeFarmPlotCount(state);
  const dayKey = farmDayKey(now);
  const weekKey = farmWeekKey(now);
  const withDaily =
    withPlots.deliveries.dayKey === dayKey
      ? withPlots
      : {
          ...withPlots,
          deliveries: { dayKey, claimedIds: [] },
        };
  if (withDaily.weekly.weekKey === weekKey) return withDaily;
  return {
    ...withDaily,
    weekly: { weekKey, claimedIds: [] },
  };
}

export function farmAvailableReputation(state: FarmState): number {
  return Math.max(0, state.stats.reputation - state.stats.reputationSpent);
}

export function buyFarmShopItem(
  state: FarmState,
  itemId: string,
): { state: FarmState; result: FarmShopPurchaseResult } {
  const item = getFarmShopItems().find((entry) => entry.id === itemId);
  if (!item) throw new FarmError("shop_item_not_found");
  if (farmAvailableReputation(state) < item.costReputation) {
    throw new FarmError("not_enough_reputation");
  }
  const next = grantFarmSeeds(
    {
      ...state,
      stats: {
        ...state.stats,
        reputationSpent: state.stats.reputationSpent + item.costReputation,
      },
    },
    item.rewardSeeds,
  );
  return {
    state: next,
    result: {
      itemId: item.id,
      title: item.title,
      costReputation: item.costReputation,
      rewardSeeds: item.rewardSeeds,
    },
  };
}

export function claimFarmSpecialDelivery(
  state: FarmState,
  requestId: string,
): { state: FarmState; result: FarmSpecialDeliveryResult } {
  const request = getFarmSpecialDeliveryRequests().find(
    (item) => item.id === requestId,
  );
  if (!request) throw new FarmError("special_delivery_not_found");
  if (!hasFarmItems(state.inventory, request.requiredItems)) {
    throw new FarmError("not_enough_items");
  }
  const seedState = grantFarmSeeds(state, request.rewardSeeds);
  const nextState = normalizeFarmPlotCount({
    ...seedState,
    inventory: spendFarmItems(seedState.inventory, request.requiredItems),
    stats: {
      ...seedState.stats,
      deliveries: seedState.stats.deliveries + 1,
      reputation: seedState.stats.reputation + request.rewardReputation,
    },
  });

  return {
    state: nextState,
    result: {
      requestId: request.id,
      title: request.title,
      rewardSeeds: request.rewardSeeds,
      rewardReputation: request.rewardReputation,
    },
  };
}

export function claimFarmWeeklyDelivery(
  state: FarmState,
  requestId: string,
  now = Date.now(),
): { state: FarmState; result: FarmWeeklyDeliveryResult } {
  const weeklyState = normalizeFarmForDay(state, now);
  const request = getFarmWeeklyDeliveryRequests().find(
    (item) => item.id === requestId,
  );
  if (!request) throw new FarmError("weekly_delivery_not_found");
  if (weeklyState.weekly.claimedIds.includes(request.id)) {
    throw new FarmError("weekly_delivery_already_claimed");
  }
  if (!hasFarmItems(weeklyState.inventory, request.requiredItems)) {
    throw new FarmError("not_enough_items");
  }
  const seedState = grantFarmSeeds(weeklyState, request.rewardSeeds);
  const nextState = normalizeFarmPlotCount({
    ...seedState,
    inventory: spendFarmItems(seedState.inventory, request.requiredItems),
    weekly: {
      ...seedState.weekly,
      claimedIds: [...seedState.weekly.claimedIds, request.id],
    },
    stats: {
      ...seedState.stats,
      deliveries: seedState.stats.deliveries + 1,
      reputation: seedState.stats.reputation + request.rewardReputation,
    },
  });

  return {
    state: nextState,
    result: {
      requestId: request.id,
      title: request.title,
      rewardSeeds: request.rewardSeeds,
      rewardReputation: request.rewardReputation,
    },
  };
}

export function farmPlotCountForReputation(reputation: number): number {
  const rep = nonNegativeInt(reputation);
  return FARM_PLOT_UPGRADES.reduce(
    (count, upgrade) =>
      rep >= upgrade.reputationRequired ? upgrade.plotCount : count,
    FARM_PLOT_COUNT,
  );
}

export function nextFarmPlotUpgrade(
  reputation: number,
): FarmPlotUpgrade | null {
  const count = farmPlotCountForReputation(reputation);
  return (
    FARM_PLOT_UPGRADES.find((upgrade) => upgrade.plotCount > count) ?? null
  );
}

export function plantCrop(
  state: FarmState,
  plotId: string,
  cropId: FarmCropId,
  now = Date.now(),
): FarmState {
  const crop = FARM_CROPS[cropId];
  const found = state.plots.find((p) => p.id === plotId);
  if (!found) throw new FarmError("plot_not_found");
  if (found.cropId) throw new FarmError("plot_occupied");
  if ((state.seeds[cropId] ?? 0) <= 0) throw new FarmError("no_seed");
  const seeds = { ...state.seeds };
  setPositiveCount(seeds, cropId, (seeds[cropId] ?? 0) - 1);
  return {
    ...state,
    seeds,
    plots: state.plots.map((p) =>
      p.id === plotId
        ? {
            ...p,
            cropId,
            plantedAt: now,
            readyAt: now + crop.growMs,
          }
        : p,
    ),
  };
}

export function grantFarmSeeds(
  state: FarmState,
  reward: FarmSeedInventory,
): FarmState {
  const seeds = { ...state.seeds };
  for (const [cropId, count] of Object.entries(reward)) {
    if (isFarmCropId(cropId)) {
      setPositiveCount(seeds, cropId, (seeds[cropId] ?? 0) + nonNegativeInt(count));
    }
  }
  return { ...state, seeds };
}

export function claimFarmDelivery(
  state: FarmState,
  requestId: string,
  now = Date.now(),
): { state: FarmState; result: FarmDeliveryResult } {
  const dailyState = normalizeFarmForDay(state, now);
  const request = getFarmDeliveryRequests().find((item) => item.id === requestId);
  if (!request) throw new FarmError("delivery_not_found");
  if (dailyState.deliveries.claimedIds.includes(request.id)) {
    throw new FarmError("delivery_already_claimed");
  }
  if (dailyState.deliveries.claimedIds.length >= FARM_DAILY_DELIVERY_LIMIT) {
    throw new FarmError("delivery_daily_limit");
  }
  if ((dailyState.inventory[request.requiredItemId] ?? 0) < request.requiredQuantity) {
    throw new FarmError("not_enough_items");
  }

  const inventory = { ...dailyState.inventory };
  setPositiveCount(
    inventory,
    request.requiredItemId,
    (inventory[request.requiredItemId] ?? 0) - request.requiredQuantity,
  );
  const seedState = grantFarmSeeds(dailyState, request.rewardSeeds);

  const nextState = normalizeFarmPlotCount({
    ...seedState,
    inventory,
    deliveries: {
      ...dailyState.deliveries,
      claimedIds: [...dailyState.deliveries.claimedIds, request.id],
    },
    stats: {
      ...dailyState.stats,
      deliveries: dailyState.stats.deliveries + 1,
      reputation: dailyState.stats.reputation + request.rewardReputation,
    },
  });

  return {
    state: nextState,
    result: {
      requestId: request.id,
      title: request.title,
      rewardSeeds: request.rewardSeeds,
      rewardReputation: request.rewardReputation,
    },
  };
}

function normalizeFarmPlotCount(state: FarmState): FarmState {
  const expected = farmPlotCountForReputation(state.stats.reputation);
  if (state.plots.length === expected) return state;
  const base = createFarmPlots(expected);
  return {
    ...state,
    plots: base.map((plot, index) => state.plots[index] ?? plot),
  };
}

function createFarmPlots(count: number): FarmPlot[] {
  const safeCount = Math.max(
    FARM_PLOT_COUNT,
    Math.min(FARM_MAX_PLOT_COUNT, nonNegativeInt(count)),
  );
  return Array.from({ length: safeCount }, (_, i) => ({
    id: `plot-${i + 1}`,
    cropId: null,
    plantedAt: null,
    readyAt: null,
  }));
}

export function harvestPlot(
  state: FarmState,
  plotId: string,
  now = Date.now(),
  rng = Math.random,
): { state: FarmState; result: FarmHarvestResult } {
  const plot = state.plots.find((p) => p.id === plotId);
  if (!plot) throw new FarmError("plot_not_found");
  if (!plot.cropId || !plot.readyAt) throw new FarmError("plot_empty");
  if (plot.readyAt > now) throw new FarmError("not_ready");

  const crop = FARM_CROPS[plot.cropId];
  const quantity =
    crop.yieldMin +
    Math.floor(rng() * (crop.yieldMax - crop.yieldMin + 1));
  const gotRare = rng() < crop.rareChance;
  const rareQuantity = gotRare ? 1 : 0;
  const inventory = { ...state.inventory };
  inventory[crop.itemId] = (inventory[crop.itemId] ?? 0) + quantity;
  if (gotRare) {
    inventory[crop.rareItemId] = (inventory[crop.rareItemId] ?? 0) + 1;
  }

  return {
    state: {
      ...state,
      plots: state.plots.map((p) =>
        p.id === plotId
          ? { ...p, cropId: null, plantedAt: null, readyAt: null }
          : p,
      ),
      inventory,
      stats: {
        ...state.stats,
        harvests: state.stats.harvests + 1,
        rareHarvests: state.stats.rareHarvests + rareQuantity,
      },
    },
    result: {
      plotId,
      cropId: crop.id,
      itemId: crop.itemId,
      itemName: crop.itemName,
      quantity,
      rareItemId: gotRare ? crop.rareItemId : null,
      rareItemName: gotRare ? crop.rareItemName : null,
      rareQuantity,
    },
  };
}

export class FarmError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

export function isFarmCropId(value: unknown): value is FarmCropId {
  return typeof value === "string" && value in FARM_CROPS;
}

function parseInventory(raw: unknown): FarmItemInventory {
  if (!raw || typeof raw !== "object") return {};
  const out: Partial<Record<FarmItemId, number>> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (isFarmItemId(key)) {
      const n = nonNegativeInt(value);
      if (n > 0) out[key] = n;
    }
  }
  return out;
}

function parseSeedInventory(raw: unknown): FarmSeedInventory {
  if (!raw || typeof raw !== "object") return {};
  const out: FarmSeedInventory = {};
  for (const [key, value] of Object.entries(raw)) {
    if (isFarmCropId(key)) {
      const n = nonNegativeInt(value);
      if (n > 0) out[key] = n;
    }
  }
  return out;
}

function parseDeliveryState(raw: unknown): FarmState["deliveries"] {
  if (!raw || typeof raw !== "object") {
    return { dayKey: farmDayKey(), claimedIds: [] };
  }
  const value = raw as Partial<FarmState["deliveries"]>;
  const claimedIds = Array.isArray(value.claimedIds)
    ? value.claimedIds.filter((id): id is string => typeof id === "string")
    : [];
  return {
    dayKey: typeof value.dayKey === "string" ? value.dayKey : farmDayKey(),
    claimedIds,
  };
}

function parseWeeklyState(raw: unknown): FarmState["weekly"] {
  if (!raw || typeof raw !== "object") {
    return { weekKey: farmWeekKey(), claimedIds: [] };
  }
  const value = raw as Partial<FarmState["weekly"]>;
  const claimedIds = Array.isArray(value.claimedIds)
    ? value.claimedIds.filter((id): id is string => typeof id === "string")
    : [];
  return {
    weekKey: typeof value.weekKey === "string" ? value.weekKey : farmWeekKey(),
    claimedIds,
  };
}

function hasFarmItems(
  inventory: FarmItemInventory,
  requirements: FarmItemInventory,
): boolean {
  return Object.entries(requirements).every(([itemId, count]) => {
    if (!isFarmItemId(itemId)) return true;
    return (inventory[itemId] ?? 0) >= nonNegativeInt(count);
  });
}

function spendFarmItems(
  inventory: FarmItemInventory,
  requirements: FarmItemInventory,
): FarmItemInventory {
  const next = { ...inventory };
  for (const [itemId, count] of Object.entries(requirements)) {
    if (!isFarmItemId(itemId)) continue;
    setPositiveCount(next, itemId, (next[itemId] ?? 0) - nonNegativeInt(count));
  }
  return next;
}

function isFarmItemId(value: string): value is FarmItemId {
  return FARM_CROP_LIST.some(
    (crop) => crop.itemId === value || crop.rareItemId === value,
  );
}

function positiveNumberOrNull(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

function nonNegativeInt(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function setPositiveCount<T extends string>(
  record: Partial<Record<T, number>>,
  key: T,
  value: number,
) {
  if (value > 0) {
    record[key] = Math.floor(value);
  } else {
    delete record[key];
  }
}

function farmDayKey(now = Date.now()): string {
  return new Date(now + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function farmWeekKey(now = Date.now()): string {
  const date = new Date(now + 9 * 60 * 60 * 1000);
  const day = date.getUTCDay();
  const daysSinceMonday = (day + 6) % 7;
  date.setUTCDate(date.getUTCDate() - daysSinceMonday);
  return date.toISOString().slice(0, 10);
}
