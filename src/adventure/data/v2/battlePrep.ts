// 전투 준비물(숫돌·보강재) — 벌목·채광 가공재로 만드는 사냥 전용 소모품.
// 서버·클라이언트 공용 순수 모듈. 재료 카탈로그(dungeonDrops)가 이 파일을 import 하므로
// 여기서는 dungeonDrops 를 import 하지 않는다.

import { MINING_MATERIAL_ID } from "@/adventure/data/v2/miningSpots";
import { LIFE_MAJOR_PRODUCT_ID } from "@/adventure/v2/lifeMajorProducts";
import { LIFE_PROCESSED_MATERIAL_ID } from "@/adventure/v2/lifeWorkshopMaterials";

export type BattlePrepSlot = "weapon" | "armor";
export type BattlePrepTier = 1 | 2 | 3 | "master";
export type BattlePrepActivity = "mining" | "woodcutting";
export type BattlePrepEffect = {
  atk: number;
  magicAtk: number;
  def: number;
  magicDef: number;
  maxHp: number;
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
  costs: Record<string, number>;
};

export const BATTLE_PREP_SLOTS: readonly BattlePrepSlot[] = ["weapon", "armor"];
export const BATTLE_PREP_SLOT_NAME: Record<BattlePrepSlot, string> = {
  weapon: "무기 손질",
  armor: "방어구 손질",
};
export const BATTLE_PREP_CRAFT_MAX_QUANTITY = 20;

const HOUR_MS = 3_600_000;
const P = LIFE_PROCESSED_MATERIAL_ID;
const M = MINING_MATERIAL_ID;
const NO_EFFECT: BattlePrepEffect = { atk: 0, magicAtk: 0, def: 0, magicDef: 0, maxHp: 0 };
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
  return parts.join(" · ");
}

function defineItem(args: {
  slot: BattlePrepSlot;
  tier: BattlePrepTier;
  effect: Partial<BattlePrepEffect>;
  costs: Record<string, number>;
}): BattlePrepItem {
  const weapon = args.slot === "weapon";
  const effect = { ...NO_EFFECT, ...args.effect };
  const durationMs = (args.tier === "master" ? 24 : 12) * HOUR_MS;
  const id = `v2_prep_${weapon ? "whetstone" : "brace"}_${TIER_SUFFIX[args.tier]}`;
  return {
    id,
    name: `${TIER_PREFIX[args.tier]}${weapon ? "숫돌" : "보강재"}`,
    description: `${BATTLE_PREP_SLOT_NAME[args.slot]}에 쓴다. ${battlePrepEffectText(effect)} · ${durationMs / HOUR_MS}시간.`,
    image: `/images/items/battle-prep/${id}.webp`,
    slot: args.slot,
    tier: args.tier,
    activity: weapon ? "mining" : "woodcutting",
    requiredLevel: TIER_LEVEL[args.tier],
    requiresMajor: args.tier === "master",
    durationMs,
    effect,
    costs: args.costs,
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

function held(materials: Record<string, number>, id: string): number {
  return Math.max(0, Math.floor(Number(materials[id]) || 0));
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

export function craftBattlePrep(
  args: { materials: Record<string, number>; itemId: unknown; quantity: unknown } & BattlePrepCraftContext,
):
  | { ok: true; item: BattlePrepItem; quantity: number; materials: Record<string, number> }
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
  if (costs.some(([id, need]) => held(args.materials, id) < need * quantity)) {
    return { ok: false, error: "not_enough_materials" };
  }
  const materials = { ...args.materials };
  for (const [id, need] of costs) {
    const left = held(materials, id) - need * quantity;
    if (left > 0) materials[id] = left;
    else delete materials[id];
  }
  materials[item.id] = held(materials, item.id) + quantity;
  return { ok: true, item, quantity, materials };
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
  costs: Array<{ id: string; need: number; owned: number }>;
  blocked: "level" | "major" | null;
  requiredLevel: number;
  maxCraftable: number;
};

export function battlePrepCraftRows(
  args: { materials: Record<string, number> } & BattlePrepCraftContext,
): BattlePrepCraftRow[] {
  return BATTLE_PREP_ITEMS.map((item) => {
    const costs = Object.entries(item.costs).map(([id, need]) => ({ id, need, owned: held(args.materials, id) }));
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
