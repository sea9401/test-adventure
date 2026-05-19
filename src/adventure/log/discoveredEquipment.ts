// 모험의 서 → 아이템 도감의 "발견한 장비" 계산 유틸.
// 핵심 개념: 장비는 한 번이라도 인벤토리에 들어오거나 장착되면 도감에 영구 등록된다.
// 폐기/판매로 인벤토리에서 사라져도 도감 기록은 남는다(컬렉션 로그). 제작·드랍 등급
// 변형(정교한/빼어난, 불량~걸작)도 각각 별도 변형으로 등록된다 — itemId 는 같고 변형 키로 구분.

import { ITEMS, findItemId, type EquipItem, type ItemId } from "@/adventure/data/items";
import {
  DROP_QUALITY_NAMES,
  resolveDroppedItem,
  type DropQuality,
} from "@/adventure/data/dropQuality";
import { CRAFT_TIER_NAMES, type CraftTier } from "@/adventure/data/craftQuality";
import { resolveCraftedItem } from "@/adventure/data/recipes";
import type { EquippedSlots } from "@/adventure/character/types";
import type { InventoryState } from "@/adventure/inventory/useInventory";

// 변형 키 — "base"(평범한 장비, 등급 0 포함) | "d1"|"d2"(드랍 등급) | "c-2"|"c-1"|"c1"|"c2"(제작 등급).
export type EquipVariantKey = "base" | "d1" | "d2" | "c-2" | "c-1" | "c1" | "c2";

const EQUIP_SLOTS = ["weapon", "armor", "accessory"] as const;

// (제작 등급, 드랍 등급) → 변형 키. 둘 다 0/미지정이면 "base". (둘이 동시에 박히는 경우는 없음.)
export function variantKey(
  tier?: CraftTier | null,
  quality?: DropQuality | null,
): EquipVariantKey {
  if (tier != null && tier !== 0) return `c${tier}` as EquipVariantKey;
  if (quality != null && quality !== 0) return `d${quality}` as EquipVariantKey;
  return "base";
}

export type ParsedVariant =
  | { kind: "base" }
  | { kind: "crafted"; tier: CraftTier }
  | { kind: "dropped"; quality: DropQuality };

export function parseVariantKey(key: string): ParsedVariant | null {
  if (key === "base") return { kind: "base" };
  if (key[0] === "c") {
    const t = Number(key.slice(1));
    if (t === -2 || t === -1 || t === 1 || t === 2) return { kind: "crafted", tier: t };
    return null;
  }
  if (key[0] === "d") {
    const q = Number(key.slice(1));
    if (q === 1 || q === 2) return { kind: "dropped", quality: q };
    return null;
  }
  return null;
}

// itemId + 변형 키 → 등급 반영된 EquipItem. itemId 가 없거나 키가 깨졌으면 null.
export function resolveVariant(id: ItemId, key: string): EquipItem | null {
  if (!(id in ITEMS)) return null;
  const p = parseVariantKey(key);
  if (!p) return null;
  if (p.kind === "base") return ITEMS[id];
  if (p.kind === "crafted") return resolveCraftedItem(id, p.tier);
  return resolveDroppedItem(id, p.quality);
}

// 도감 표시명 — "야구 방망이" / "정교한 야구 방망이" / "야구 방망이 ⟨걸작⟩".
export function variantDisplayName(id: ItemId, key: string): string {
  const base = ITEMS[id]?.name ?? id;
  const p = parseVariantKey(key);
  if (!p || p.kind === "base") return base;
  if (p.kind === "crafted") return `${base} ⟨${CRAFT_TIER_NAMES[p.tier]}⟩`;
  return `${DROP_QUALITY_NAMES[p.quality]} ${base}`;
}

// 도감 등급 라벨(없으면 null) — "정교한" / "걸작" 등. 평범한 장비("base")는 null.
export function variantGradeLabel(key: string): string | null {
  const p = parseVariantKey(key);
  if (!p || p.kind === "base") return null;
  if (p.kind === "crafted") return CRAFT_TIER_NAMES[p.tier];
  return DROP_QUALITY_NAMES[p.quality];
}

// 현재 인벤토리/장착 상태에서 "지금 보유 또는 장착 중인" 모든 (itemId → 변형 키 집합).
// 도감 동기화의 입력 — 여기 들어온 것은 (없으면) 도감에 새로 등록되고, 빠진 것은 그대로 둔다.
export function currentlyHeldVariants(
  inv: InventoryState,
  equipped: EquippedSlots | null | undefined,
): Map<ItemId, Set<EquipVariantKey>> {
  const out = new Map<ItemId, Set<EquipVariantKey>>();
  const mark = (id: ItemId, key: EquipVariantKey) => {
    if (!(id in ITEMS)) return;
    let s = out.get(id);
    if (!s) {
      s = new Set<EquipVariantKey>();
      out.set(id, s);
    }
    s.add(key);
  };

  for (const [id, n] of Object.entries(inv.equipment)) {
    if ((n ?? 0) > 0) mark(id as ItemId, "base");
  }
  for (const [id, tiers] of Object.entries(inv.craftedEquipment)) {
    for (const [t, n] of Object.entries(tiers ?? {})) {
      if ((n ?? 0) > 0) mark(id as ItemId, variantKey(Number(t) as CraftTier, null));
    }
  }
  for (const [id, quals] of Object.entries(inv.droppedEquipment)) {
    for (const [q, n] of Object.entries(quals ?? {})) {
      if ((n ?? 0) > 0) mark(id as ItemId, variantKey(null, Number(q) as DropQuality));
    }
  }
  // 인스턴스 풀 (별빛 무구) — variantKey 는 craftTier 만 본다. 강화/마법부여는 변형 키로
  // 구분하지 않는다 (도감은 한 아이템의 craftTier 까지만 변형 — 강화 단계는 인스턴스 단위라
  // 도감 차원에서 의미가 약함).
  for (const inst of inv.equipmentInstances ?? []) {
    mark(inst.itemId, variantKey(inst.craftTier ?? null, null));
  }
  if (equipped) {
    for (const slot of EQUIP_SLOTS) {
      const e = equipped[slot];
      if (!e) continue;
      const id = findItemId(e);
      if (!id) continue;
      mark(id, variantKey(e.craftTier ?? null, e.dropQuality ?? null));
    }
  }
  return out;
}
