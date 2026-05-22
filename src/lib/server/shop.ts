// 상점 서버 lib — buy / sell 트랜잭션의 핵심 로직.
//
// 이전엔 page.tsx 의 handlePurchase*/handleSell* 가 클라에서 골드 차감 + 인벤토리
// 갱신을 직접 했다 — devtools 로 골드/아이템 위조 가능 (audit-findings #1). 서버 권위로
// 전환: 클라는 의도(action)만 보내고, 서버가 character.v2 + inventory.v2 를 잠그고 검증한
// 뒤 한 트랜잭션 안에서 적용. shop.unlocks.v1 (재료 해금 진행 마커) 은 read-only 로 검증만.
//
// 순수 계산(computeShopOutcome)과 DB I/O(applyShopAction)를 분리 — 전자는 단위 테스트 대상.

import { and, eq } from "drizzle-orm";
import { savesKv } from "@/db/schema";
import { upsertSave, type DbExecutor } from "@/lib/server/savesKv";
import { POTIONS, potionMax, type PotionId } from "@/adventure/data/potions";
import { MATERIALS, type MaterialId } from "@/adventure/data/materials";
import { CONSUMABLES, type ConsumableId } from "@/adventure/data/consumables";
import { ITEMS, type ItemId } from "@/adventure/data/items";
import {
  getRuneTokenPrice,
  isRuneGrade,
  isRuneId,
  type RuneGrade,
  type RuneId,
} from "@/adventure/data/runes";
import {
  getItemSellPrice,
  getMaterialSellPrice,
  getPotionSellPrice,
} from "@/adventure/data/sellPrices";
import {
  SHOP_PURCHASE_QTY_MAX,
  SHOP_UNLOCK_STORAGE_KEY,
  SHOP_UNLOCK_THRESHOLD,
} from "@/adventure/shop/constants";
import type {
  ShopAction,
  ShopActionKind,
  ShopApplied,
  ShopOutcome,
} from "@/adventure/shop/types";

export type { ShopAction, ShopActionKind, ShopApplied, ShopOutcome };

const ACTION_KINDS: readonly ShopActionKind[] = [
  "buy_potion",
  "buy_material",
  "buy_consumable",
  "buy_equipment",
  "buy_rune",
  "sell_potion",
  "sell_material",
  "sell_equipment",
];

export function isShopActionKind(v: unknown): v is ShopActionKind {
  return typeof v === "string" && (ACTION_KINDS as readonly string[]).includes(v);
}

// 호출부(route)가 HTTP 400 으로 매핑 — 모두 "요청이 게임 규칙 위반" 케이스.
export class ShopError extends Error {
  constructor(public code: string) {
    super(code);
    this.name = "ShopError";
  }
}

type CountMap = Record<string, number>;
// 제작산 등급 인스턴스 — itemId → (등급 문자열 "-2"|"-1"|"1"|"2" → 개수). 등급 0 은 equipment[] 에 합산.
// 드랍산 등급 인스턴스도 같은 모양 — 키는 "1"|"2"(정교한/빼어난).
type GradedMap = Record<string, Record<string, number>>;
// 룬 — runeId → (등급 "1"~"5" → 개수). cloneGraded 와 동일 모양.
type RuneMap = Partial<Record<RuneId, Partial<Record<RuneGrade, number>>>>;
const NON_ZERO_TIERS = new Set(["-2", "-1", "1", "2"]);
const NON_ZERO_DROP_QUALITIES = new Set(["1", "2"]);

function cloneGraded(src: GradedMap | undefined): GradedMap {
  const out: GradedMap = {};
  for (const [k, v] of Object.entries(src ?? {})) out[k] = { ...v };
  return out;
}

function cloneRunes(src: RuneMap | undefined): RuneMap {
  const out: RuneMap = {};
  for (const [k, v] of Object.entries(src ?? {})) {
    out[k as RuneId] = { ...(v ?? {}) };
  }
  return out;
}

export type ShopComputeInput = {
  gold: number;
  potions: CountMap;
  materials: CountMap;
  equipment: CountMap;
  // 제작산 등급 인스턴스 (sell_equipment 에서 craftTier 지정 시 차감). 미동봉이면 빈 맵.
  craftedEquipment?: GradedMap;
  // 드랍산 등급 인스턴스 (sell_equipment 에서 dropQuality 지정 시 차감). 미동봉이면 빈 맵.
  droppedEquipment?: GradedMap;
  consumables: CountMap;
  potionCapacityBonus: number;
  // material-buy 잠금 검증용 (inShop=false 인 재료). 미동봉이면 빈 맵 취급.
  soldCounts?: CountMap;
  // 룬 가방 (buy_rune 결과 가산). 미동봉이면 빈 맵.
  runes?: RuneMap;
  // 장비 구매 게이트 — EquipItem.shopGate 가 가리키는 crafting flag. 미동봉이면 모두 false 취급
  // → shopGate 가 설정된 장비는 구매 불가(locked).
  craftingGates?: { boldQuestComplete?: boolean };
};

export type ShopComputeResult = {
  newGold: number;
  potions: CountMap;
  materials: CountMap;
  equipment: CountMap;
  craftedEquipment: GradedMap;
  droppedEquipment: GradedMap;
  consumables: CountMap;
  runes: RuneMap;
  applied: ShopApplied;
};

// 순수 함수 — savesKv 읽은 값으로 새 상태 + applied 를 계산. 위반 시 ShopError.
export function computeShopOutcome(
  input: ShopComputeInput,
  action: ShopAction,
): ShopComputeResult {
  const qty = action.quantity;
  if (!Number.isInteger(qty) || qty < 1) throw new ShopError("invalid_quantity");
  // 구매는 한 번에 최대 SHOP_PURCHASE_QTY_MAX 개. 판매는 인벤 보유 한도가 곧 상한이라 별도 제한 없음.
  if (action.kind.startsWith("buy_") && qty > SHOP_PURCHASE_QTY_MAX) {
    throw new ShopError("invalid_quantity");
  }
  if (!Number.isFinite(input.gold)) throw new ShopError("corrupt_gold");

  const potions = { ...input.potions };
  const materials = { ...input.materials };
  const equipment = { ...input.equipment };
  const craftedEquipment = cloneGraded(input.craftedEquipment);
  const droppedEquipment = cloneGraded(input.droppedEquipment);
  const consumables = { ...input.consumables };
  const runes = cloneRunes(input.runes);
  const gold = input.gold;

  let appliedQty = qty;
  let goldDelta = 0;
  // sell_equipment 가 제작/드랍 등급 인스턴스를 팔았을 때만 채워짐 (둘 다 차면 안 됨 — 상호 배타).
  let appliedCraftTier: number | undefined;
  let appliedDropQuality: number | undefined;
  // buy_rune 한정 — 구매한 룬 등급 + tower_token 변화량.
  let appliedRuneGrade: number | undefined;
  let tokenDelta: number | undefined;

  switch (action.kind) {
    case "buy_potion": {
      const p = POTIONS[action.id as PotionId];
      if (!p) throw new ShopError("unknown_item");
      if (!Number.isFinite(p.price) || p.price < 0) throw new ShopError("not_for_sale");
      const have = potions[action.id] ?? 0;
      const room = Math.max(0, potionMax(input.potionCapacityBonus) - have);
      appliedQty = Math.min(qty, room);
      if (appliedQty <= 0) throw new ShopError("full");
      // 상점 구매가 = shopPrice 우선(없으면 price). 판매(sell_potion)는 별도 판매가 맵.
      const unit = p.shopPrice ?? p.price;
      if (!Number.isFinite(unit) || unit < 0) throw new ShopError("not_for_sale");
      const cost = unit * appliedQty;
      if (gold < cost) throw new ShopError("insufficient_gold");
      potions[action.id] = have + appliedQty;
      goldDelta = -cost;
      break;
    }
    case "buy_material": {
      const m = MATERIALS[action.id as MaterialId];
      if (!m) throw new ShopError("unknown_item");
      if (!Number.isFinite(m.price) || m.price <= 0) throw new ShopError("not_for_sale");
      // 구매 가능 = 항상 취급(inShop) 또는 누적 판매 임계치 도달 — 클라 ShopView 와 동일.
      if (!m.inShop) {
        const sold = input.soldCounts?.[action.id] ?? 0;
        if (sold < SHOP_UNLOCK_THRESHOLD) throw new ShopError("locked");
      }
      const cost = m.price * qty;
      if (gold < cost) throw new ShopError("insufficient_gold");
      materials[action.id] = (materials[action.id] ?? 0) + qty;
      goldDelta = -cost;
      break;
    }
    case "buy_consumable": {
      const c = CONSUMABLES[action.id as ConsumableId];
      if (!c) throw new ShopError("unknown_item");
      if (!Number.isFinite(c.price) || c.price < 0) throw new ShopError("not_for_sale");
      const cost = c.price * qty;
      if (gold < cost) throw new ShopError("insufficient_gold");
      consumables[action.id] = (consumables[action.id] ?? 0) + qty;
      goldDelta = -cost;
      break;
    }
    case "buy_equipment": {
      const e = ITEMS[action.id as ItemId];
      if (!e) throw new ShopError("unknown_item");
      const price = (e as { shopPrice?: number }).shopPrice;
      if (typeof price !== "number" || !Number.isFinite(price) || price < 0) {
        throw new ShopError("not_for_sale");
      }
      // shopGate 가 설정된 장비는 해당 crafting flag 가 true 일 때만 구매 허용 — 클라 BuyTab 와 동일.
      const gate = (e as { shopGate?: "boldQuestComplete" }).shopGate;
      if (gate && !input.craftingGates?.[gate]) {
        throw new ShopError("locked");
      }
      const cost = price * qty;
      if (gold < cost) throw new ShopError("insufficient_gold");
      // 무등급(기본) 인스턴스로 들어간다 — equipment[] 맵.
      equipment[action.id] = (equipment[action.id] ?? 0) + qty;
      goldDelta = -cost;
      break;
    }
    case "buy_rune": {
      // 가격은 tower_token (재료) 으로 지불 — 골드 불변. 룬 종류 무관 등급 가격 동일.
      if (!isRuneId(action.id)) throw new ShopError("unknown_item");
      const rawGrade = action.grade;
      if (rawGrade == null || !isRuneGrade(Number(rawGrade))) {
        throw new ShopError("invalid_grade");
      }
      const grade = Number(rawGrade) as RuneGrade;
      const price = getRuneTokenPrice(grade);
      // 5막 PR-D1 — 6등급은 토큰 상점에서 안 팔린다 (price 0 sentinel).
      // 별빛 조각 흡수 강화로만 얻음 (CharacterScreen handleFuseRune).
      if (price <= 0) throw new ShopError("invalid_grade");
      const cost = price * qty;
      const haveTokens = materials["tower_token"] ?? 0;
      if (haveTokens < cost) throw new ShopError("insufficient_tokens");
      materials["tower_token"] = haveTokens - cost;
      const idMap = { ...(runes[action.id] ?? {}) };
      idMap[grade] = (idMap[grade] ?? 0) + qty;
      runes[action.id] = idMap;
      appliedRuneGrade = grade;
      tokenDelta = -cost;
      break;
    }
    case "sell_potion": {
      if (!POTIONS[action.id as PotionId]) throw new ShopError("unknown_item");
      const have = potions[action.id] ?? 0;
      if (have < qty) throw new ShopError("insufficient_items");
      potions[action.id] = have - qty;
      goldDelta = getPotionSellPrice(action.id as PotionId) * qty;
      break;
    }
    case "sell_material": {
      if (!MATERIALS[action.id as MaterialId]) throw new ShopError("unknown_item");
      const have = materials[action.id] ?? 0;
      if (have < qty) throw new ShopError("insufficient_items");
      materials[action.id] = have - qty;
      goldDelta = getMaterialSellPrice(action.id as MaterialId) * qty;
      break;
    }
    case "sell_equipment": {
      if (!ITEMS[action.id as ItemId]) throw new ShopError("unknown_item");
      const tierKey =
        action.craftTier != null && NON_ZERO_TIERS.has(String(action.craftTier))
          ? String(action.craftTier)
          : null;
      // craftTier 와 dropQuality 는 상호 배타 — craftTier 가 유효하면 그쪽 우선.
      const qualKey =
        !tierKey &&
        action.dropQuality != null &&
        NON_ZERO_DROP_QUALITIES.has(String(action.dropQuality))
          ? String(action.dropQuality)
          : null;
      if (tierKey) {
        const tierMap = craftedEquipment[action.id] ?? {};
        const have = tierMap[tierKey] ?? 0;
        if (have < qty) throw new ShopError("insufficient_items");
        const left = have - qty;
        if (left > 0) tierMap[tierKey] = left;
        else delete tierMap[tierKey];
        if (Object.keys(tierMap).length) craftedEquipment[action.id] = tierMap;
        else delete craftedEquipment[action.id];
        appliedCraftTier = action.craftTier;
      } else if (qualKey) {
        const qualMap = droppedEquipment[action.id] ?? {};
        const have = qualMap[qualKey] ?? 0;
        if (have < qty) throw new ShopError("insufficient_items");
        const left = have - qty;
        if (left > 0) qualMap[qualKey] = left;
        else delete qualMap[qualKey];
        if (Object.keys(qualMap).length) droppedEquipment[action.id] = qualMap;
        else delete droppedEquipment[action.id];
        appliedDropQuality = action.dropQuality;
      } else {
        const have = equipment[action.id] ?? 0;
        if (have < qty) throw new ShopError("insufficient_items");
        equipment[action.id] = have - qty;
      }
      goldDelta = getItemSellPrice(action.id as ItemId) * qty;
      break;
    }
  }

  return {
    newGold: Math.max(0, gold + goldDelta),
    potions,
    materials,
    equipment,
    craftedEquipment,
    droppedEquipment,
    consumables,
    runes,
    applied: {
      kind: action.kind,
      id: action.id,
      quantity: appliedQty,
      goldDelta,
      ...(appliedCraftTier != null ? { craftTier: appliedCraftTier } : {}),
      ...(appliedDropQuality != null ? { dropQuality: appliedDropQuality } : {}),
      ...(appliedRuneGrade != null ? { grade: appliedRuneGrade } : {}),
      ...(tokenDelta != null ? { tokenDelta } : {}),
    },
  };
}

// ─────────────────────────────────────────────────────────────────────

type SavedCharacter = { gold?: number; [k: string]: unknown };
type SavedInventory = {
  potions?: CountMap;
  materials?: CountMap;
  equipment?: CountMap;
  craftedEquipment?: GradedMap;
  droppedEquipment?: GradedMap;
  consumables?: CountMap;
  potionCapacityBonus?: number;
  runes?: RuneMap;
  [k: string]: unknown;
};
type SavedShopUnlocks = { sold?: CountMap };
type SavedCrafting = { boldQuestComplete?: boolean };

async function readKv<T>(
  tx: DbExecutor,
  userId: string,
  key: string,
  lock: boolean,
): Promise<T | null> {
  const q = tx
    .select()
    .from(savesKv)
    .where(and(eq(savesKv.userId, userId), eq(savesKv.key, key)));
  const rows = lock ? await q.for("update") : await q.limit(1);
  return (rows[0]?.value as T | undefined) ?? null;
}

// 트랜잭션 안에서 호출. character.v2 / inventory.v2 를 for-update 로 잠그고 갱신.
export async function applyShopAction(
  tx: DbExecutor,
  userId: string,
  action: ShopAction,
): Promise<ShopOutcome> {
  const character =
    (await readKv<SavedCharacter>(tx, userId, "character.v2", true)) ?? {};
  const inv = (await readKv<SavedInventory>(tx, userId, "inventory.v2", true)) ?? {};

  // material buy 의 잠금 검증에만 shop.unlocks.v1 필요.
  let soldCounts: CountMap | undefined;
  if (action.kind === "buy_material") {
    const m = MATERIALS[action.id as MaterialId];
    if (m && !m.inShop) {
      const u =
        (await readKv<SavedShopUnlocks>(tx, userId, SHOP_UNLOCK_STORAGE_KEY, false)) ??
        {};
      soldCounts = u.sold ?? {};
    }
  }

  // shopGate 가 걸린 장비를 살 때만 crafting.v2 를 읽는다 — 나머지 케이스는 I/O 한 번 절약.
  let craftingGates: { boldQuestComplete?: boolean } | undefined;
  if (action.kind === "buy_equipment") {
    const e = ITEMS[action.id as ItemId];
    if (e && (e as { shopGate?: string }).shopGate) {
      const c = (await readKv<SavedCrafting>(tx, userId, "crafting.v2", false)) ?? {};
      craftingGates = { boldQuestComplete: !!c.boldQuestComplete };
    }
  }

  const out = computeShopOutcome(
    {
      gold: character.gold ?? 0,
      potions: { ...(inv.potions ?? {}) },
      materials: { ...(inv.materials ?? {}) },
      equipment: { ...(inv.equipment ?? {}) },
      craftedEquipment: inv.craftedEquipment ?? {},
      droppedEquipment: inv.droppedEquipment ?? {},
      consumables: { ...(inv.consumables ?? {}) },
      potionCapacityBonus: inv.potionCapacityBonus ?? 0,
      soldCounts,
      runes: inv.runes ?? {},
      craftingGates,
    },
    action,
  );

  const newCharacter: SavedCharacter = { ...character, gold: out.newGold };
  const newInventory: SavedInventory = {
    ...inv,
    potions: out.potions,
    materials: out.materials,
    equipment: out.equipment,
    craftedEquipment: out.craftedEquipment,
    droppedEquipment: out.droppedEquipment,
    consumables: out.consumables,
    runes: out.runes,
  };

  await upsertSave(tx, userId, "character.v2", newCharacter);
  await upsertSave(tx, userId, "inventory.v2", newInventory);

  return { character: newCharacter, inventory: newInventory, applied: out.applied };
}
