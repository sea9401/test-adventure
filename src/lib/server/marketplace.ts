import { ITEMS, type ItemId, type EquipItem } from "@/adventure/data/items";
import { MATERIALS, type MaterialId } from "@/adventure/data/materials";
import { getRecipeById, type Recipe } from "@/adventure/data/recipes";
import {
  SKILL_BOOKS,
  type SkillBook,
  type SkillBookId,
} from "@/adventure/data/skillBooks";
import type { EquipmentInstance } from "@/adventure/inventory/equipmentInstances";
import type { EquipVariantKey } from "@/adventure/inventory/vaultOps";

// 거래 성사 수수료. 0 이면 수수료 없음 (UI 에서도 자동 숨김).
export const MARKETPLACE_FEE_RATE = 0;
export const MARKETPLACE_SLOT_LIMIT = 10;
export const MARKETPLACE_PRICE_MIN = 1;
export const MARKETPLACE_PRICE_MAX = 999_999_999;
// 매물 자동 유찰 시간 — 등록 후 이 시간이 지나면 expired 처리 + 판매자에게 환불 우편.
export const MARKETPLACE_LISTING_TTL_MS = 24 * 60 * 60 * 1000;

export type ItemKind = "equip" | "material" | "recipe" | "skill_book";

export function isItemKind(s: string): s is ItemKind {
  return (
    s === "equip" || s === "material" || s === "recipe" || s === "skill_book"
  );
}

export function getSkillBookDef(id: string): SkillBook | null {
  if (Object.prototype.hasOwnProperty.call(SKILL_BOOKS, id)) {
    return SKILL_BOOKS[id as SkillBookId];
  }
  return null;
}

export function getEquipDef(id: string): EquipItem | null {
  if (Object.prototype.hasOwnProperty.call(ITEMS, id)) {
    return ITEMS[id as ItemId];
  }
  return null;
}

export function getMaterialDef(id: string) {
  if (Object.prototype.hasOwnProperty.call(MATERIALS, id)) {
    return MATERIALS[id as MaterialId];
  }
  return null;
}

export function getRecipeDef(id: string): Recipe | undefined {
  return getRecipeById(id);
}

// 거래 가능 여부. 정의에 tradable === false 면 차단. 미지정 / true → 가능.
export function isTradable(kind: ItemKind, id: string): boolean {
  if (kind === "equip") {
    const def = getEquipDef(id);
    return def !== null && def.tradable !== false;
  }
  if (kind === "material") {
    const mat = getMaterialDef(id);
    if (!mat) return false;
    // Material 정의에 tradable 추가 시 동일 패턴.
    return !("tradable" in mat) || mat.tradable !== false;
  }
  if (kind === "skill_book") {
    const book = getSkillBookDef(id);
    return book !== null && book.tradable === true;
  }
  // recipe
  const recipe = getRecipeDef(id);
  return recipe !== undefined && recipe.tradable !== false;
}

// 등록 시점 표시용 이름 스냅샷.
export function getItemName(kind: ItemKind, id: string): string | null {
  if (kind === "equip") return getEquipDef(id)?.name ?? null;
  if (kind === "material") return getMaterialDef(id)?.name ?? null;
  if (kind === "skill_book") return getSkillBookDef(id)?.name ?? null;
  return getRecipeDef(id)?.name ?? null;
}

// 인벤토리 JSON 의 한 카테고리에서 item_id × quantity 만큼 차감 시도.
// 성공 시 새 카테고리 객체 반환, 실패 시 null.
export function deductFromCategory(
  category: Record<string, number> | undefined,
  itemId: string,
  quantity: number,
): Record<string, number> | null {
  const have = category?.[itemId] ?? 0;
  if (have < quantity) return null;
  const next = { ...(category ?? {}) };
  if (have - quantity <= 0) delete next[itemId];
  else next[itemId] = have - quantity;
  return next;
}

// 인벤토리 JSON 의 한 카테고리에 item_id × quantity 만큼 추가.
export function addToCategory(
  category: Record<string, number> | undefined,
  itemId: string,
  quantity: number,
): Record<string, number> {
  const next = { ...(category ?? {}) };
  next[itemId] = (next[itemId] ?? 0) + quantity;
  return next;
}

// inventory.v2 jsonb 의 안전한 모양. 호출 측에서 cast 후 사용.
// craftedEquipment / droppedEquipment 는 itemId → 등급키 → 개수 (vault variant 와 동일 규약).
export type InventoryShape = {
  potions?: Record<string, number>;
  equipment?: Record<string, number>;
  craftedEquipment?: Record<string, Record<string, number>>;
  droppedEquipment?: Record<string, Record<string, number>>;
  materials?: Record<string, number>;
  skillBooks?: Record<string, number>;
  /** 강화·부여된 별빛 무구/고리 — 인스턴스 매물 거래용. */
  equipmentInstances?: EquipmentInstance[];
};

// ── 인스턴스(강화/부여 별빛 무구·고리) 매물 헬퍼 ──────────────────────────────
// 인스턴스는 스택형 grade 카테고리가 아니라 equipmentInstances 배열에 instanceId 로 고유 저장된다.
// 거래소는 등록 시 셀러 풀에서 빼고(에스크로) 배송 시 바이어 풀에 넣는다 — 데이터(강화 history·
// 부여 슬롯·롤)는 verbatim 보존, 검증/정규화는 호출 측이 normalizeInstance 로.

// instanceId 로 인스턴스 1개 빼냄. 성공 시 빼낸 인스턴스 + 새 inv, 없으면 null.
export function deductInstanceById(
  inv: InventoryShape,
  instanceId: string,
): { inv: InventoryShape; instance: EquipmentInstance } | null {
  const list = inv.equipmentInstances ?? [];
  const found = list.find((i) => i.instanceId === instanceId);
  if (!found) return null;
  return {
    inv: { ...inv, equipmentInstances: list.filter((i) => i.instanceId !== instanceId) },
    instance: found,
  };
}

// 인스턴스 1개 추가(instanceId 중복이면 무시 — 재지급/재시도 멱등). 배송/환불에서 사용.
export function addInstance(
  inv: InventoryShape,
  instance: EquipmentInstance,
): InventoryShape {
  const list = inv.equipmentInstances ?? [];
  if (list.some((i) => i.instanceId === instance.instanceId)) return inv;
  return { ...inv, equipmentInstances: [...list, instance] };
}

// 인스턴스 매물의 grade(변형 키) — CHECK 제약을 만족시키려 craftTier 에서 파생.
// craftTier ∈ {-2,-1,1,2} → c{tier}, 그 외(0/미지정, 예: 별빛 고리) → base.
export function instanceListingGrade(craftTier: number | undefined): EquipVariantKey {
  if (craftTier === -2 || craftTier === -1 || craftTier === 1 || craftTier === 2) {
    return `c${craftTier}`;
  }
  return "base";
}

// 장비 등급 variant 키 — vault 변형 키와 동일 규약(useInventory.ts VAULT_VARIANT_KEYS).
//  base: equipment[]                          (일반)
//  c-2/c-1/c1/c2: craftedEquipment[id][tier]  (불량/하급/고급/걸작)
//  d1/d2:        droppedEquipment[id][quality] (정교한/빼어난)
const VALID_GRADES = new Set([
  "base",
  "c-2",
  "c-1",
  "c1",
  "c2",
  "d1",
  "d2",
]);

export function isValidGrade(g: string): boolean {
  return VALID_GRADES.has(g);
}

export type GradeCategory =
  | "equipment"
  | "craftedEquipment"
  | "droppedEquipment";

// grade → 인벤 카테고리. base = equipment, c±N = craftedEquipment, dN = droppedEquipment.
// 비정상 grade 는 equipment 로 보수적 fallback (호출 측에서 isValidGrade 로 미리 검증할 것).
export function inventoryCategoryForGrade(grade: string): GradeCategory {
  if (grade[0] === "c") return "craftedEquipment";
  if (grade[0] === "d") return "droppedEquipment";
  return "equipment";
}

// grade 키 → 중첩 맵에서 쓰는 sub-key ("c1" → "1", "d2" → "2"). base 는 sub-key 없음.
function gradeSubKey(grade: string): string {
  return grade.slice(1);
}

// 등급 사본이 들어가는 중첩 카테고리(craftedEquipment / droppedEquipment) 의 한 슬롯에서
// 차감. 부족하면 null. (base 는 호출 측에서 deductFromCategory 로 평면 처리.)
function deductNestedSlot(
  nested: Record<string, Record<string, number>> | undefined,
  itemId: string,
  subKey: string,
  quantity: number,
): Record<string, Record<string, number>> | null {
  const have = nested?.[itemId]?.[subKey] ?? 0;
  if (have < quantity) return null;
  const innerNext = { ...(nested?.[itemId] ?? {}) };
  const left = have - quantity;
  if (left > 0) innerNext[subKey] = left;
  else delete innerNext[subKey];
  const outerNext = { ...(nested ?? {}) };
  if (Object.keys(innerNext).length) outerNext[itemId] = innerNext;
  else delete outerNext[itemId];
  return outerNext;
}

function addNestedSlot(
  nested: Record<string, Record<string, number>> | undefined,
  itemId: string,
  subKey: string,
  quantity: number,
): Record<string, Record<string, number>> {
  const innerNext = { ...(nested?.[itemId] ?? {}) };
  innerNext[subKey] = (innerNext[subKey] ?? 0) + quantity;
  const outerNext = { ...(nested ?? {}) };
  outerNext[itemId] = innerNext;
  return outerNext;
}

// 장비 등급 사본 차감 — base/c±N/dN 분기해서 올바른 카테고리에서 deduct.
// 성공 시 새 InventoryShape, 부족하면 null.
export function deductGradedEquip(
  inv: InventoryShape,
  itemId: string,
  grade: string,
  quantity: number,
): InventoryShape | null {
  if (grade === "base") {
    const nextCat = deductFromCategory(inv.equipment, itemId, quantity);
    if (nextCat === null) return null;
    return { ...inv, equipment: nextCat };
  }
  const sub = gradeSubKey(grade);
  if (grade[0] === "c") {
    const next = deductNestedSlot(inv.craftedEquipment, itemId, sub, quantity);
    if (next === null) return null;
    return { ...inv, craftedEquipment: next };
  }
  if (grade[0] === "d") {
    const next = deductNestedSlot(inv.droppedEquipment, itemId, sub, quantity);
    if (next === null) return null;
    return { ...inv, droppedEquipment: next };
  }
  return null;
}

// 장비 등급 사본 가산 — 취소/유찰 환불 + 인박스 수령에서 사용.
// grade 가 유효하지 않으면 equipment[] (base) 로 fallback (구 데이터 호환).
export function addGradedEquip(
  inv: InventoryShape,
  itemId: string,
  grade: string,
  quantity: number,
): InventoryShape {
  if (grade === "base" || !isValidGrade(grade)) {
    return { ...inv, equipment: addToCategory(inv.equipment, itemId, quantity) };
  }
  const sub = gradeSubKey(grade);
  if (grade[0] === "c") {
    return {
      ...inv,
      craftedEquipment: addNestedSlot(inv.craftedEquipment, itemId, sub, quantity),
    };
  }
  // grade[0] === "d"
  return {
    ...inv,
    droppedEquipment: addNestedSlot(inv.droppedEquipment, itemId, sub, quantity),
  };
}

// crafting.v2 jsonb 의 share-token 보조 헬퍼.
// shareable 누락된 레거시 데이터는 known 의 사본으로 fallback.
export type CraftingShape = {
  known?: unknown;
  shareable?: unknown;
  [key: string]: unknown;
};

export function getKnownArr(craft: CraftingShape | null | undefined): string[] {
  const k = craft?.known;
  return Array.isArray(k) ? (k as unknown[]).filter((v): v is string => typeof v === "string") : [];
}

// shareable 이 없으면 known 그대로 반환 (= 모두 풀 토큰).
export function getShareableArr(craft: CraftingShape | null | undefined): string[] {
  const s = craft?.shareable;
  if (Array.isArray(s)) {
    return (s as unknown[]).filter((v): v is string => typeof v === "string");
  }
  return getKnownArr(craft);
}

