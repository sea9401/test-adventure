// 전투 준비물(숫돌·보강재·어유) — 벌목·채광 가공재와 낚시 어획물로 만드는 사냥 전용 소모품.
// 서버·클라이언트 공용 순수 모듈. 재료 카탈로그(dungeonDrops)가 이 파일을 import 하므로
// 여기서는 dungeonDrops 를 import 하지 않는다.

import {
  DANGEROUS_FISH,
  dangerousCatchMaterialId,
  type DangerousFishRarity,
} from "@/adventure/data/v2/dangerousFishing";
import { MINING_MATERIAL_ID } from "@/adventure/data/v2/miningSpots";
import { FISHING_CATCH_ITEM_LIST, type FishingCatchItemId } from "@/adventure/v2/fishingStock";
import { LIFE_MAJOR_PRODUCT_ID } from "@/adventure/v2/lifeMajorProducts";
import { LIFE_PROCESSED_MATERIAL_ID } from "@/adventure/v2/lifeWorkshopMaterials";

export type BattlePrepSlot = "weapon" | "armor" | "vigor";
export type BattlePrepTier = 1 | 2 | 3 | "master";
export type BattlePrepActivity = "mining" | "woodcutting" | "fishing";
export type BattlePrepCatchItems = Partial<Record<FishingCatchItemId, number>>;
/** 위험 해역 어획물 등급 묶음 — 어종과 상관없이 해당 등급 이상을 합쳐서 낸다. */
export type BattlePrepDangerCatchCost = { minRarity: "rare" | "epic"; amount: number };
export type BattlePrepEffect = {
  atk: number;
  magicAtk: number;
  def: number;
  magicDef: number;
  maxHp: number;
  maxMp: number;
};
export type BattlePrepItem = {
  id: string;
  name: string;
  description: string;
  /** `public/images/items/battle-prep/<id>.webp` */
  image: string;
  slot: BattlePrepSlot;
  tier: BattlePrepTier;
  activity: BattlePrepActivity;
  requiredLevel: number;
  requiresMajor: boolean;
  durationMs: number;
  effect: BattlePrepEffect;
  /** `character.v2` 재료. */
  costs: Record<string, number>;
  /** `fishing-stock.v1` 어획물 재고. */
  catchCosts?: BattlePrepCatchItems;
  dangerCatchCost?: BattlePrepDangerCatchCost;
};

export const BATTLE_PREP_SLOTS: readonly BattlePrepSlot[] = ["weapon", "armor", "vigor"];
export const BATTLE_PREP_SLOT_NAME: Record<BattlePrepSlot, string> = {
  weapon: "무기 손질",
  armor: "방어구 손질",
  vigor: "기력 보충",
};
export const BATTLE_PREP_CRAFT_MAX_QUANTITY = 20;

const HOUR_MS = 3_600_000;
const P = LIFE_PROCESSED_MATERIAL_ID;
const M = MINING_MATERIAL_ID;
const NO_EFFECT: BattlePrepEffect = { atk: 0, magicAtk: 0, def: 0, magicDef: 0, maxHp: 0, maxMp: 0 };
const TIER_LEVEL: Record<BattlePrepTier, number> = { 1: 1, 2: 20, 3: 35, master: 35 };
const TIER_SUFFIX: Record<BattlePrepTier, string> = { 1: "1", 2: "2", 3: "3", master: "master" };
const TIER_PREFIX: Record<BattlePrepTier, string> = { 1: "초급 ", 2: "중급 ", 3: "상급 ", master: "명장의 " };

function formatNumber(value: number): string {
  return value.toLocaleString("en-US");
}

/** 0이 아닌 수치만 "공격력·마법공격력 +130", "방어력·마법방어력 +65 · 최대 HP +1,000" 형식으로. */
export function battlePrepEffectText(effect: BattlePrepEffect): string {
  const parts: string[] = [];
  if (effect.atk > 0 && effect.atk === effect.magicAtk) {
    parts.push(`공격력·마법공격력 +${formatNumber(effect.atk)}`);
  } else {
    if (effect.atk > 0) parts.push(`공격력 +${formatNumber(effect.atk)}`);
    if (effect.magicAtk > 0) parts.push(`마법공격력 +${formatNumber(effect.magicAtk)}`);
  }
  if (effect.def > 0 && effect.def === effect.magicDef) {
    parts.push(`방어력·마법방어력 +${formatNumber(effect.def)}`);
  } else {
    if (effect.def > 0) parts.push(`방어력 +${formatNumber(effect.def)}`);
    if (effect.magicDef > 0) parts.push(`마법방어력 +${formatNumber(effect.magicDef)}`);
  }
  if (effect.maxHp > 0) parts.push(`최대 HP +${formatNumber(effect.maxHp)}`);
  if (effect.maxMp > 0) parts.push(`최대 MP +${formatNumber(effect.maxMp)}`);
  return parts.join(" · ");
}

const SLOT_ITEM: Record<
  BattlePrepSlot,
  { idPart: string; name: string; activity: BattlePrepActivity; levels: Record<BattlePrepTier, number> }
> = {
  weapon: { idPart: "whetstone", name: "숫돌", activity: "mining", levels: TIER_LEVEL },
  armor: { idPart: "brace", name: "보강재", activity: "woodcutting", levels: TIER_LEVEL },
  // 낚시는 수동이라 레벨이 낮다. 중급은 위험 해역 해금, 상급은 폭풍 해구 해금 레벨에 맞춘다.
  vigor: { idPart: "fishoil", name: "어유", activity: "fishing", levels: { 1: 1, 2: 15, 3: 25, master: 25 } },
};

function defineItem(args: {
  slot: BattlePrepSlot;
  tier: BattlePrepTier;
  effect: Partial<BattlePrepEffect>;
  costs: Record<string, number>;
  catchCosts?: BattlePrepCatchItems;
  dangerCatchCost?: BattlePrepDangerCatchCost;
}): BattlePrepItem {
  const kind = SLOT_ITEM[args.slot];
  const effect = { ...NO_EFFECT, ...args.effect };
  const durationMs = (args.tier === "master" ? 24 : 12) * HOUR_MS;
  const id = `v2_prep_${kind.idPart}_${TIER_SUFFIX[args.tier]}`;
  return {
    id,
    name: `${TIER_PREFIX[args.tier]}${kind.name}`,
    description: `${BATTLE_PREP_SLOT_NAME[args.slot]}에 쓴다. ${battlePrepEffectText(effect)} · ${durationMs / HOUR_MS}시간.`,
    image: `/images/items/battle-prep/${id}.webp`,
    slot: args.slot,
    tier: args.tier,
    activity: kind.activity,
    requiredLevel: kind.levels[args.tier],
    requiresMajor: args.tier === "master",
    durationMs,
    effect,
    costs: args.costs,
    ...(args.catchCosts ? { catchCosts: args.catchCosts } : {}),
    ...(args.dangerCatchCost ? { dangerCatchCost: args.dangerCatchCost } : {}),
  };
}

const WHETSTONE_TOP_COSTS = { [P.arcaneAlloy]: 20, [P.preciousIngot]: 10, [P.basicIngot]: 10, [M.roughGem]: 5 };
const BRACE_TOP_COSTS = { [P.masterwood]: 20, [P.hardwood]: 10, [P.softwood]: 10 };

export const BATTLE_PREP_ITEMS: readonly BattlePrepItem[] = [
  defineItem({ slot: "weapon", tier: 1, effect: { atk: 40, magicAtk: 40 }, costs: { [P.basicIngot]: 40, [M.stone]: 20 } }),
  defineItem({ slot: "weapon", tier: 2, effect: { atk: 80, magicAtk: 80 }, costs: { [P.preciousIngot]: 25, [P.basicIngot]: 15, [M.coal]: 10 } }),
  defineItem({ slot: "weapon", tier: 3, effect: { atk: 130, magicAtk: 130 }, costs: WHETSTONE_TOP_COSTS }),
  defineItem({ slot: "weapon", tier: "master", effect: { atk: 180, magicAtk: 180 }, costs: { ...WHETSTONE_TOP_COSTS, [LIFE_MAJOR_PRODUCT_ID.mining]: 1 } }),
  defineItem({ slot: "armor", tier: 1, effect: { def: 20, magicDef: 20, maxHp: 300 }, costs: { [P.softwood]: 40 } }),
  defineItem({ slot: "armor", tier: 2, effect: { def: 40, magicDef: 40, maxHp: 600 }, costs: { [P.hardwood]: 25, [P.softwood]: 15 } }),
  defineItem({ slot: "armor", tier: 3, effect: { def: 65, magicDef: 65, maxHp: 1_000 }, costs: BRACE_TOP_COSTS }),
  defineItem({ slot: "armor", tier: "master", effect: { def: 90, magicDef: 90, maxHp: 1_400 }, costs: { ...BRACE_TOP_COSTS, [LIFE_MAJOR_PRODUCT_ID.woodcutting]: 1 } }),
  defineItem({ slot: "vigor", tier: 1, effect: { maxMp: 250 }, costs: {}, catchCosts: { catch_common: 3, catch_fresh: 1 } }),
  defineItem({ slot: "vigor", tier: 2, effect: { maxMp: 500 }, costs: {}, catchCosts: { catch_fresh: 3, catch_quality: 3 } }),
  defineItem({ slot: "vigor", tier: 3, effect: { maxMp: 800 }, costs: {}, catchCosts: { catch_quality: 4, catch_special: 1 }, dangerCatchCost: { minRarity: "rare", amount: 2 } }),
  defineItem({ slot: "vigor", tier: "master", effect: { maxMp: 1_100 }, costs: { [LIFE_MAJOR_PRODUCT_ID.fishing]: 1 }, catchCosts: { catch_special: 2, catch_legendary: 1 }, dangerCatchCost: { minRarity: "epic", amount: 2 } }),
];

export const BATTLE_PREP_ITEM_BY_ID: ReadonlyMap<string, BattlePrepItem> = new Map(
  BATTLE_PREP_ITEMS.map((item) => [item.id, item]),
);

/** 재료 카탈로그 등록용 — 인벤토리 표시와 거래소 재료 거래가 이 등록으로 동작한다. */
export const BATTLE_PREP_MATERIALS: Record<string, { id: string; name: string; description: string }> =
  Object.fromEntries(
    BATTLE_PREP_ITEMS.map((item) => [item.id, { id: item.id, name: item.name, description: item.description }]),
  );

export type ActiveBattlePrep = { itemId: string; expiresAt: number };
export type ActiveBattlePreps = Partial<Record<BattlePrepSlot, ActiveBattlePrep>>;

function held(materials: Readonly<Record<string, number | undefined>>, id: string): number {
  return Math.max(0, Math.floor(Number(materials[id]) || 0));
}

// 위험 해역 어획물 — 등급별 재료 id를 화물 가치 낮은 순(같으면 정의 순)으로 둔다.
const DANGER_RARITY_ORDER: readonly DangerousFishRarity[] = ["rare", "epic", "legendary"];
const DANGER_CATCH_IDS_BY_RARITY = new Map(
  DANGER_RARITY_ORDER.map((rarity) => [
    rarity,
    Object.values(DANGEROUS_FISH)
      .filter((fish) => fish.rarity === rarity)
      .sort((a, b) => a.cargoValue - b.cargoValue)
      .map((fish) => dangerousCatchMaterialId(fish.id) as string),
  ]),
);

function dangerRaritiesFrom(minRarity: BattlePrepDangerCatchCost["minRarity"]): readonly DangerousFishRarity[] {
  return DANGER_RARITY_ORDER.slice(DANGER_RARITY_ORDER.indexOf(minRarity));
}

export function dangerCatchCostName(minRarity: BattlePrepDangerCatchCost["minRarity"]): string {
  return `위험 해역 ${minRarity === "rare" ? "희귀" : "영웅"} 이상 어획물`;
}

/** 등급 조건을 채우는 위험 해역 어획물의 보유 합계. */
export function dangerCatchHeld(
  materials: Readonly<Record<string, number | undefined>>,
  minRarity: BattlePrepDangerCatchCost["minRarity"],
): number {
  return dangerRaritiesFrom(minRarity)
    .flatMap((rarity) => DANGER_CATCH_IDS_BY_RARITY.get(rarity) ?? [])
    .reduce((sum, id) => sum + held(materials, id), 0);
}

/**
 * 묶음 재료로 낼 어획물을 고른다. 낮은 등급부터, 같은 등급은 보유량 많은 어종 → 화물 가치 낮은 어종 순.
 * 위험 해역 교환(`selectCatchMaterials`)과 같은 규칙이다. 합계가 모자라면 null.
 */
export function selectDangerCatchMaterials(
  materials: Readonly<Record<string, number | undefined>>,
  cost: BattlePrepDangerCatchCost,
  quantity: number,
): Record<string, number> | null {
  let remaining = cost.amount * quantity;
  const selected: Record<string, number> = {};
  for (const rarity of dangerRaritiesFrom(cost.minRarity)) {
    const candidates = (DANGER_CATCH_IDS_BY_RARITY.get(rarity) ?? [])
      .map((id, order) => ({ id, order, owned: held(materials, id) }))
      .filter((candidate) => candidate.owned > 0)
      .sort((a, b) => b.owned - a.owned || a.order - b.order);
    for (const candidate of candidates) {
      if (remaining <= 0) break;
      const take = Math.min(candidate.owned, remaining);
      selected[candidate.id] = take;
      remaining -= take;
    }
  }
  return remaining > 0 ? null : selected;
}

function itemOf(itemId: unknown): BattlePrepItem | null {
  return typeof itemId === "string" ? (BATTLE_PREP_ITEM_BY_ID.get(itemId) ?? null) : null;
}

/** 세이브의 켜 둔 준비물을 읽는다. 만료·모르는 품목·칸 불일치·잘못된 형식은 버린다. */
export function activeBattlePreps(raw: unknown, now = Date.now()): ActiveBattlePreps {
  if (!raw || typeof raw !== "object") return {};
  const source = raw as Record<string, unknown>;
  const active: ActiveBattlePreps = {};
  for (const slot of BATTLE_PREP_SLOTS) {
    const value = source[slot];
    if (!value || typeof value !== "object") continue;
    const { itemId, expiresAt } = value as { itemId?: unknown; expiresAt?: unknown };
    const item = itemOf(itemId);
    if (!item || item.slot !== slot) continue;
    if (typeof expiresAt !== "number" || !Number.isFinite(expiresAt) || expiresAt <= now) continue;
    active[slot] = { itemId: item.id, expiresAt };
  }
  return active;
}

/** 켜 둔 칸들의 고정 수치 합. `activeBattlePreps`로 걸러 낸 값을 넘긴다. */
export function battlePrepCombatFlat(active: ActiveBattlePreps): BattlePrepEffect {
  const total = { ...NO_EFFECT };
  for (const slot of BATTLE_PREP_SLOTS) {
    const item = itemOf(active[slot]?.itemId);
    if (!item) continue;
    total.atk += item.effect.atk;
    total.magicAtk += item.effect.magicAtk;
    total.def += item.effect.def;
    total.magicDef += item.effect.magicDef;
    total.maxHp += item.effect.maxHp;
    total.maxMp += item.effect.maxMp;
  }
  return total;
}

export type BattlePrepCraftContext = {
  levels: Record<BattlePrepActivity, number>;
  /** 해당 생활 주전공 명장 3단계 이상 여부(`lifeMajorCanCraft`). */
  masterCraft: Record<BattlePrepActivity, boolean>;
};
export type BattlePrepCraftError =
  | "bad_item"
  | "invalid_quantity"
  | "level_required"
  | "major_required"
  | "not_enough_materials";

// 명장 등급은 전공 조건만 본다. 주전공 명장 단계는 Lv.100 뒤에만 오르므로 레벨 조건이 이미 포함된다.
function craftBlock(item: BattlePrepItem, context: BattlePrepCraftContext): "level" | "major" | null {
  if (item.requiresMajor) return context.masterCraft[item.activity] ? null : "major";
  return context.levels[item.activity] >= item.requiredLevel ? null : "level";
}

function spend(stock: Record<string, number | undefined>, id: string, amount: number): void {
  const left = held(stock, id) - amount;
  if (left > 0) stock[id] = left;
  else delete stock[id];
}

export function craftBattlePrep(
  args: {
    materials: Record<string, number>;
    /** `fishing-stock.v1`의 `items`. 어유가 아니면 넘기지 않아도 된다. */
    catchItems?: BattlePrepCatchItems;
    itemId: unknown;
    quantity: unknown;
  } & BattlePrepCraftContext,
):
  | {
      ok: true;
      item: BattlePrepItem;
      quantity: number;
      materials: Record<string, number>;
      catchItems: BattlePrepCatchItems;
      /** 어획물 재고를 줄였는지. true일 때만 `fishing-stock.v1`을 저장한다. */
      usesCatchStock: boolean;
    }
  | { ok: false; error: BattlePrepCraftError } {
  const item = itemOf(args.itemId);
  if (!item) return { ok: false, error: "bad_item" };
  const quantity = args.quantity;
  if (
    typeof quantity !== "number" ||
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    quantity > BATTLE_PREP_CRAFT_MAX_QUANTITY
  ) {
    return { ok: false, error: "invalid_quantity" };
  }
  const block = craftBlock(item, args);
  if (block === "level") return { ok: false, error: "level_required" };
  if (block === "major") return { ok: false, error: "major_required" };
  const costs = Object.entries(item.costs);
  const catchCosts = Object.entries(item.catchCosts ?? {});
  const catchItems: BattlePrepCatchItems = { ...args.catchItems };
  if (
    costs.some(([id, need]) => held(args.materials, id) < need * quantity) ||
    catchCosts.some(([id, need]) => held(catchItems, id) < need * quantity)
  ) {
    return { ok: false, error: "not_enough_materials" };
  }
  const dangerCatch = item.dangerCatchCost
    ? selectDangerCatchMaterials(args.materials, item.dangerCatchCost, quantity)
    : {};
  if (!dangerCatch) return { ok: false, error: "not_enough_materials" };
  const materials = { ...args.materials };
  for (const [id, need] of costs) spend(materials, id, need * quantity);
  for (const [id, amount] of Object.entries(dangerCatch)) spend(materials, id, amount);
  for (const [id, need] of catchCosts) spend(catchItems, id, need * quantity);
  materials[item.id] = held(materials, item.id) + quantity;
  return { ok: true, item, quantity, materials, catchItems, usesCatchStock: catchCosts.length > 0 };
}

export type BattlePrepCraftRow = {
  id: string;
  name: string;
  image: string;
  slot: BattlePrepSlot;
  tier: BattlePrepTier;
  activity: BattlePrepActivity;
  effectText: string;
  durationHours: number;
  owned: number;
  /** `name`은 재료 카탈로그에 없는 재료(어획물 재고, 위험 해역 묶음)에만 싣는다. */
  costs: Array<{ id: string; need: number; owned: number; name?: string }>;
  blocked: "level" | "major" | null;
  requiredLevel: number;
  maxCraftable: number;
};

export function battlePrepCraftRows(
  args: { materials: Record<string, number>; catchItems?: BattlePrepCatchItems } & BattlePrepCraftContext,
): BattlePrepCraftRow[] {
  const catchItems = args.catchItems ?? {};
  return BATTLE_PREP_ITEMS.map((item) => {
    const costs: BattlePrepCraftRow["costs"] = [
      ...FISHING_CATCH_ITEM_LIST.flatMap((entry) => {
        const need = item.catchCosts?.[entry.id];
        return need ? [{ id: entry.id, name: entry.name, need, owned: held(catchItems, entry.id) }] : [];
      }),
      ...(item.dangerCatchCost
        ? [
            {
              id: `danger_catch:${item.dangerCatchCost.minRarity}`,
              name: dangerCatchCostName(item.dangerCatchCost.minRarity),
              need: item.dangerCatchCost.amount,
              owned: dangerCatchHeld(args.materials, item.dangerCatchCost.minRarity),
            },
          ]
        : []),
      ...Object.entries(item.costs).map(([id, need]) => ({ id, need, owned: held(args.materials, id) })),
    ];
    const blocked = craftBlock(item, args);
    return {
      id: item.id,
      name: item.name,
      image: item.image,
      slot: item.slot,
      tier: item.tier,
      activity: item.activity,
      effectText: battlePrepEffectText(item.effect),
      durationHours: item.durationMs / HOUR_MS,
      owned: held(args.materials, item.id),
      costs,
      blocked,
      requiredLevel: item.requiredLevel,
      maxCraftable: blocked ? 0 : Math.min(...costs.map((cost) => Math.floor(cost.owned / cost.need))),
    };
  });
}

/** 준비물 1개를 쓰고 그 품목의 칸만 교체한다. 시간은 누적하지 않는다. */
export function applyBattlePrepUse(args: {
  materials: Record<string, number>;
  activeRaw: unknown;
  itemId: unknown;
  now: number;
}):
  | { ok: true; item: BattlePrepItem; materials: Record<string, number>; active: ActiveBattlePreps }
  | { ok: false; error: "bad_item" | "not_owned" } {
  const item = itemOf(args.itemId);
  if (!item) return { ok: false, error: "bad_item" };
  const owned = held(args.materials, item.id);
  if (owned < 1) return { ok: false, error: "not_owned" };
  const materials = { ...args.materials };
  if (owned > 1) materials[item.id] = owned - 1;
  else delete materials[item.id];
  const active: ActiveBattlePreps = {
    ...activeBattlePreps(args.activeRaw, args.now),
    [item.slot]: { itemId: item.id, expiresAt: args.now + item.durationMs },
  };
  return { ok: true, item, materials, active };
}
