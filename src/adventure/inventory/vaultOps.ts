// 도감 보관함 ↔ 인벤토리 이동의 순수 함수. useInventory 의 depositToVault / withdrawFromVault 가
// 이 함수들을 감싸 setState 한다. 분리한 이유는 (1) 테스트 가능, (2) 한 번의 setState 로 atomic 갱신.

import type { ItemId } from "../data/items";
import type { CraftTier } from "../data/craftQuality";
import type { DropQuality } from "../data/dropQuality";
import type { InventoryState } from "./useInventory";

// 장비 변형 직렬화 키 — 인벤·도감·보관함·거래소 공통 규약.
//   "base"       : 기본(craftTier 0, dropQuality 0). 일반 equipment[] 슬롯.
//   "c-2".."c2"  : 제작 등급 ±N (0 제외). craftedEquipment 슬롯.
//   "d1"|"d2"    : 드랍 품질 1·2. droppedEquipment 슬롯.
//
// CraftTier (-2..2) / DropQuality (0..2) / RuneGrade (1..6) 와 별개 — 이 셋은 각기
// 다른 축이고, EquipVariantKey 는 그 둘(CraftTier·DropQuality)을 단일 문자열로 직렬화한
// "표시·저장 키". 거래소 API 와이어 포맷에선 historically `grade` 필드명으로 직렬화됨
// (서버 호환 위해 유지) — 클라 내부 타입은 모두 `variantKey` 로 통일(LOW #23).
export type EquipVariantKey = "base" | `c${-2 | -1 | 1 | 2}` | `d${1 | 2}`;

// (tier, quality) → 변형 키. discoveredEquipment.variantKey 와 동일 규약.
export function vaultVariantKey(
  tier?: CraftTier | null,
  quality?: DropQuality | null,
): EquipVariantKey {
  if (tier != null && tier !== 0) return `c${tier}`;
  if (quality != null && quality !== 0) return `d${quality}`;
  return "base";
}

// 인벤토리에서 특정 변형의 보유 수. base = equipment[], c±N = craftedEquipment, dN = droppedEquipment.
export function inventoryCountFor(
  inv: InventoryState,
  id: ItemId,
  variantKey: string,
): number {
  if (variantKey === "base") return inv.equipment[id] ?? 0;
  if (variantKey[0] === "c") {
    const tier = variantKey.slice(1);
    return inv.craftedEquipment[id]?.[tier] ?? 0;
  }
  if (variantKey[0] === "d") {
    const quality = variantKey.slice(1);
    return inv.droppedEquipment[id]?.[quality] ?? 0;
  }
  return 0;
}

// 변형 키 → (tier, quality). 모르는 키는 base 취급.
export function parseVaultVariantKey(key: string): {
  tier?: CraftTier;
  quality?: DropQuality;
} {
  if (key === "base") return {};
  if (key[0] === "c") {
    const t = Number(key.slice(1));
    if (t === -2 || t === -1 || t === 1 || t === 2) return { tier: t as CraftTier };
    return {};
  }
  if (key[0] === "d") {
    const q = Number(key.slice(1));
    if (q === 1 || q === 2) return { quality: q as DropQuality };
    return {};
  }
  return {};
}

// 인벤토리 (tier, quality) 슬롯에서 n 개 차감. 부족하면 null. 0 tier·0 quality 는 equipment[] 에 합산.
function consumeEquipmentSlot(
  cur: InventoryState,
  id: ItemId,
  tier?: CraftTier | null,
  quality?: DropQuality | null,
  n = 1,
): InventoryState | null {
  if (tier != null && tier !== 0) {
    const key = String(tier);
    const have = cur.craftedEquipment[id]?.[key] ?? 0;
    if (have < n) return null;
    const tierMap = { ...(cur.craftedEquipment[id] ?? {}) };
    const left = have - n;
    if (left > 0) tierMap[key] = left;
    else delete tierMap[key];
    const crafted = { ...cur.craftedEquipment };
    if (Object.keys(tierMap).length) crafted[id] = tierMap;
    else delete crafted[id];
    return { ...cur, craftedEquipment: crafted };
  }
  if (quality != null && quality !== 0) {
    const key = String(quality);
    const have = cur.droppedEquipment[id]?.[key] ?? 0;
    if (have < n) return null;
    const map = { ...(cur.droppedEquipment[id] ?? {}) };
    const left = have - n;
    if (left > 0) map[key] = left;
    else delete map[key];
    const dropped = { ...cur.droppedEquipment };
    if (Object.keys(map).length) dropped[id] = map;
    else delete dropped[id];
    return { ...cur, droppedEquipment: dropped };
  }
  const have = cur.equipment[id] ?? 0;
  if (have < n) return null;
  return { ...cur, equipment: { ...cur.equipment, [id]: have - n } };
}

function addEquipmentSlot(
  cur: InventoryState,
  id: ItemId,
  tier?: CraftTier,
  quality?: DropQuality,
  n = 1,
): InventoryState {
  if (tier != null && tier !== 0) {
    const key = String(tier);
    const tierMap = { ...(cur.craftedEquipment[id] ?? {}) };
    tierMap[key] = (tierMap[key] ?? 0) + n;
    return {
      ...cur,
      craftedEquipment: { ...cur.craftedEquipment, [id]: tierMap },
    };
  }
  if (quality != null && quality !== 0) {
    const key = String(quality);
    const map = { ...(cur.droppedEquipment[id] ?? {}) };
    map[key] = (map[key] ?? 0) + n;
    return {
      ...cur,
      droppedEquipment: { ...cur.droppedEquipment, [id]: map },
    };
  }
  return {
    ...cur,
    equipment: { ...cur.equipment, [id]: (cur.equipment[id] ?? 0) + n },
  };
}

function consumeFromVault(
  cur: InventoryState,
  id: ItemId,
  variantKey: string,
  n = 1,
): InventoryState | null {
  const have = cur.vault[id]?.[variantKey] ?? 0;
  if (have < n) return null;
  const vMap = { ...(cur.vault[id] ?? {}) };
  const left = have - n;
  if (left > 0) vMap[variantKey] = left;
  else delete vMap[variantKey];
  const vault = { ...cur.vault };
  if (Object.keys(vMap).length) vault[id] = vMap;
  else delete vault[id];
  return { ...cur, vault };
}

function addToVault(
  cur: InventoryState,
  id: ItemId,
  variantKey: string,
  n = 1,
): InventoryState {
  const vMap = { ...(cur.vault[id] ?? {}) };
  vMap[variantKey] = (vMap[variantKey] ?? 0) + n;
  return { ...cur, vault: { ...cur.vault, [id]: vMap } };
}

// 인벤 → vault. 인벤 부족이면 null.
export function depositToVaultPure(
  cur: InventoryState,
  id: ItemId,
  tier?: CraftTier,
  quality?: DropQuality,
  n = 1,
): InventoryState | null {
  if (n <= 0) return null;
  const consumed = consumeEquipmentSlot(cur, id, tier, quality, n);
  if (!consumed) return null;
  return addToVault(consumed, id, vaultVariantKey(tier, quality), n);
}

// vault → 인벤. vault 부족이면 null.
export function withdrawFromVaultPure(
  cur: InventoryState,
  id: ItemId,
  variantKey: string,
  n = 1,
): InventoryState | null {
  if (n <= 0) return null;
  const consumed = consumeFromVault(cur, id, variantKey, n);
  if (!consumed) return null;
  const { tier, quality } = parseVaultVariantKey(variantKey);
  return addEquipmentSlot(consumed, id, tier, quality, n);
}
