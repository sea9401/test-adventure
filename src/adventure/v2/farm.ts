export const FARM_SAVE_KEY = "farm.v2";

export const FARM_PLOT_COUNT = 3;

export const FARM_DAILY_DELIVERY_LIMIT = 2;

export type FarmCropId = "wheat" | "herb" | "corn";

export type FarmSeedInventory = Partial<Record<FarmCropId, number>>;

export const FARM_DAILY_QUEST_SEED_POUCH_NAME = "낡은 씨앗 주머니";

export const FARM_DAILY_QUEST_SEED_REWARD: Record<FarmCropId, number> = {
  wheat: 4,
  herb: 2,
  corn: 1,
};

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
  inventory: Partial<Record<FarmItemId, number>>;
  seeds: FarmSeedInventory;
  deliveries: {
    dayKey: string;
    claimedIds: string[];
  };
  stats: {
    harvests: number;
    rareHarvests: number;
    deliveries: number;
    reputation: number;
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
    plots: Array.from({ length: FARM_PLOT_COUNT }, (_, i) => ({
      id: `plot-${i + 1}`,
      cropId: null,
      plantedAt: null,
      readyAt: null,
    })),
    inventory: {},
    seeds: { ...FARM_STARTER_SEEDS },
    deliveries: { dayKey: farmDayKey(now), claimedIds: [] },
    stats: { harvests: 0, rareHarvests: 0, deliveries: 0, reputation: 0 },
  };
}

export function parseFarmState(raw: unknown): FarmState {
  const fallback = emptyFarmState();
  if (!raw || typeof raw !== "object") return fallback;
  const value = raw as Partial<FarmState>;
  const plots = fallback.plots.map((base, index) => {
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
  });
  return {
    version: 1,
    plots,
    inventory: parseInventory(value.inventory),
    seeds:
      value.seeds === undefined
        ? { ...FARM_STARTER_SEEDS }
        : parseSeedInventory(value.seeds),
    deliveries: parseDeliveryState(value.deliveries),
    stats: {
      harvests: nonNegativeInt(value.stats?.harvests),
      rareHarvests: nonNegativeInt(value.stats?.rareHarvests),
      deliveries: nonNegativeInt(value.stats?.deliveries),
      reputation: nonNegativeInt(value.stats?.reputation),
    },
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
      rewardSeeds: { wheat: 3, herb: 1 },
      rewardReputation: 2,
    },
    {
      id: "clinic-herb",
      title: "치료소 약초 묶음",
      note: "모험가 치료소가 하루치 약초를 모으고 있습니다.",
      requiredItemId: "herb",
      requiredItemName: "허브",
      requiredQuantity: 2,
      rewardSeeds: { herb: 2, corn: 1 },
      rewardReputation: 3,
    },
    {
      id: "market-corn",
      title: "장터 간식 상자",
      note: "오래 자라는 작물을 요구하지만 씨앗 보상이 넉넉합니다.",
      requiredItemId: "corn",
      requiredItemName: "옥수수",
      requiredQuantity: 5,
      rewardSeeds: { wheat: 2, corn: 2 },
      rewardReputation: 4,
    },
  ];
}

export function normalizeFarmForDay(
  state: FarmState,
  now = Date.now(),
): FarmState {
  const dayKey = farmDayKey(now);
  if (state.deliveries.dayKey === dayKey) return state;
  return {
    ...state,
    deliveries: { dayKey, claimedIds: [] },
  };
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

  return {
    state: {
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
    },
    result: {
      requestId: request.id,
      title: request.title,
      rewardSeeds: request.rewardSeeds,
      rewardReputation: request.rewardReputation,
    },
  };
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

function parseInventory(raw: unknown): Partial<Record<FarmItemId, number>> {
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
