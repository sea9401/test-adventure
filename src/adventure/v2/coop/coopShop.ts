import { TITLES, type TitleId } from "@/adventure/data/titles";
import {
  SUMMON_SCROLL_MATERIAL_ID,
  type CoopBossKindId,
} from "@/adventure/data/v2/coopBosses";
import {
  COOP_BOSS_MATERIAL,
  COOP_COIN_MATERIAL_ID,
  COOP_EQUIPMENT_BOX,
  COOP_MASTERY_TOME_GAIN,
  COOP_MASTERY_TOME_MATERIAL_ID,
} from "@/adventure/data/v2/coopRewards";
import { V2_MATERIALS } from "@/adventure/data/v2/dungeonDrops";
import { REFORGE_STONE_MATERIAL_ID } from "@/adventure/data/v2/v2EquipVariance";
import { STAMINA_POTION_RESTORE } from "@/adventure/v2/staminaPotions";

export const COOP_SHOP_STATE_KEY = "coop-shop.v1";

export type CoopShopLimitScope = "daily" | "weekly";

export type CoopShopCost = {
  materials: Record<string, number>;
};

export type CoopShopEntry = {
  itemId: string;
  category: "equipment_box" | "consumable" | "title";
  name: string;
  description: string;
  cost: CoopShopCost;
  output:
    | { kind: "material"; materialId: string; count: number }
    | { kind: "stamina_potion"; count: number }
    | { kind: "title"; titleId: TitleId };
  limit?: { scope: CoopShopLimitScope; count: number };
};

export const COOP_SHOP_TITLE_IDS = {
  helpingHand: "coop_helping_hand",
  raider: "coop_raider",
} as const;

const coinCost = (coins: number, materials: Record<string, number> = {}) => ({
  materials: { [COOP_COIN_MATERIAL_ID]: coins, ...materials },
});

const EQUIPMENT_BOX_SHOP_COST_BY_TIER: Record<
  1 | 2 | 3 | 4 | 5,
  { coins: number; bossMaterial: number }
> = {
  1: { coins: 80, bossMaterial: 10 },
  2: { coins: 160, bossMaterial: 12 },
  3: { coins: 280, bossMaterial: 15 },
  4: { coins: 480, bossMaterial: 20 },
  5: { coins: 720, bossMaterial: 30 },
};

function equipmentBoxShopEntries(): CoopShopEntry[] {
  return (Object.keys(COOP_EQUIPMENT_BOX) as CoopBossKindId[]).map((boss) => {
    const box = COOP_EQUIPMENT_BOX[boss];
    const material = COOP_BOSS_MATERIAL[boss];
    const cost = EQUIPMENT_BOX_SHOP_COST_BY_TIER[box.displayTier];
    return {
      itemId: `${boss}_equipment_box`,
      category: "equipment_box",
      name: box.name,
      description: box.description,
      cost: coinCost(cost.coins, { [material.id]: cost.bossMaterial }),
      output: {
        kind: "material",
        materialId: box.id,
        count: 1,
      },
    };
  });
}

function allBossMaterialCost(count: number): Record<string, number> {
  return Object.fromEntries(
    Object.values(COOP_BOSS_MATERIAL).map((material) => [material.id, count]),
  );
}

export const COOP_SHOP_ENTRIES: readonly CoopShopEntry[] = [
  ...equipmentBoxShopEntries(),
  {
    itemId: "stamina_potion",
    category: "consumable",
    name: "스태미나 회복약",
    description: `사용 시 스태미나 ${STAMINA_POTION_RESTORE} 회복. 하루 3개까지 교환한다.`,
    cost: coinCost(25),
    output: { kind: "stamina_potion", count: 1 },
    limit: { scope: "daily", count: 3 },
  },
  {
    itemId: "summon_scroll",
    category: "consumable",
    name: V2_MATERIALS[SUMMON_SCROLL_MATERIAL_ID]?.name ?? "보스 소환서",
    description: "협동 보스를 소환하는 재료. 하루 2장까지 교환한다.",
    cost: coinCost(60),
    output: { kind: "material", materialId: SUMMON_SCROLL_MATERIAL_ID, count: 1 },
    limit: { scope: "daily", count: 2 },
  },
  {
    itemId: "reforge_stone",
    category: "consumable",
    name: V2_MATERIALS[REFORGE_STONE_MATERIAL_ID.basic]?.name ?? "재련석",
    description: "장비 옵션 재굴림에 쓰는 재료. 주 10개까지 교환한다.",
    cost: coinCost(45),
    output: {
      kind: "material",
      materialId: REFORGE_STONE_MATERIAL_ID.basic,
      count: 1,
    },
    limit: { scope: "weekly", count: 10 },
  },
  {
    itemId: "reforge_stone_high",
    category: "consumable",
    name: V2_MATERIALS[REFORGE_STONE_MATERIAL_ID.high]?.name ?? "상급 재련석",
    description: "고품질 옵션 재굴림 확률을 높이는 재료. 주 3개까지 교환한다.",
    cost: coinCost(120),
    output: {
      kind: "material",
      materialId: REFORGE_STONE_MATERIAL_ID.high,
      count: 1,
    },
    limit: { scope: "weekly", count: 3 },
  },
  {
    itemId: "mastery_tome",
    category: "consumable",
    name:
      V2_MATERIALS[COOP_MASTERY_TOME_MATERIAL_ID]?.name ?? "상급 숙련 교본",
    description: `사용 시 현재 직업 숙련도 +${COOP_MASTERY_TOME_GAIN}. 거래 가능. 주 5개까지 교환한다.`,
    cost: coinCost(120),
    output: {
      kind: "material",
      materialId: COOP_MASTERY_TOME_MATERIAL_ID,
      count: 1,
    },
    limit: { scope: "weekly", count: 5 },
  },
  {
    itemId: "title_helping_hand",
    category: "title",
    name: TITLES[COOP_SHOP_TITLE_IDS.helpingHand]?.name ?? "협동의 손",
    description:
      TITLES[COOP_SHOP_TITLE_IDS.helpingHand]?.description ??
      "협동 토벌에 손을 보탠 자.",
    cost: coinCost(300),
    output: { kind: "title", titleId: COOP_SHOP_TITLE_IDS.helpingHand },
  },
  {
    itemId: "title_raider",
    category: "title",
    name: TITLES[COOP_SHOP_TITLE_IDS.raider]?.name ?? "토벌대원",
    description:
      TITLES[COOP_SHOP_TITLE_IDS.raider]?.description ??
      "꾸준히 협동 전선에 선 자.",
    cost: coinCost(800, allBossMaterialCost(10)),
    output: { kind: "title", titleId: COOP_SHOP_TITLE_IDS.raider },
  },
];

export const COOP_SHOP_ENTRY_BY_ID = new Map(
  COOP_SHOP_ENTRIES.map((entry) => [entry.itemId, entry]),
);

export type CoopShopState = {
  daily: { key: string; purchases: Record<string, number> };
  weekly: { key: string; purchases: Record<string, number> };
};

function countsOf(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (raw && typeof raw === "object") {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      const n = Math.floor(Number(v));
      if (Number.isFinite(n) && n > 0) out[k] = n;
    }
  }
  return out;
}

export function parseCoopShopState(
  raw: unknown,
  dailyKey: string,
  weeklyKey: string,
): CoopShopState {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const dailyRaw =
    obj.daily && typeof obj.daily === "object"
      ? (obj.daily as Record<string, unknown>)
      : {};
  const weeklyRaw =
    obj.weekly && typeof obj.weekly === "object"
      ? (obj.weekly as Record<string, unknown>)
      : {};
  const daily = {
    key: dailyKey,
    purchases: dailyRaw.key === dailyKey ? countsOf(dailyRaw.purchases) : {},
  };
  const weekly = {
    key: weeklyKey,
    purchases:
      weeklyRaw.key === weeklyKey ? countsOf(weeklyRaw.purchases) : {},
  };
  return { daily, weekly };
}

export function coopShopPurchaseCount(
  state: CoopShopState,
  entry: CoopShopEntry,
): number {
  if (!entry.limit) return 0;
  const bucket = entry.limit.scope === "daily" ? state.daily : state.weekly;
  return bucket.purchases[entry.itemId] ?? 0;
}

export function isCoopShopLimitReached(
  state: CoopShopState,
  entry: CoopShopEntry,
): boolean {
  return Boolean(
    entry.limit && coopShopPurchaseCount(state, entry) >= entry.limit.count,
  );
}

export function recordCoopShopPurchase(
  state: CoopShopState,
  entry: CoopShopEntry,
): CoopShopState {
  if (!entry.limit) return state;
  if (entry.limit.scope === "daily") {
    return {
      ...state,
      daily: {
        ...state.daily,
        purchases: {
          ...state.daily.purchases,
          [entry.itemId]: (state.daily.purchases[entry.itemId] ?? 0) + 1,
        },
      },
    };
  }
  return {
    ...state,
    weekly: {
      ...state.weekly,
      purchases: {
        ...state.weekly.purchases,
        [entry.itemId]: (state.weekly.purchases[entry.itemId] ?? 0) + 1,
      },
    },
  };
}

export function coopShopRelevantMaterialIds(): string[] {
  const ids = new Set<string>();
  for (const entry of COOP_SHOP_ENTRIES) {
    for (const id of Object.keys(entry.cost.materials)) ids.add(id);
    if (entry.output.kind === "material") ids.add(entry.output.materialId);
  }
  return [...ids];
}
