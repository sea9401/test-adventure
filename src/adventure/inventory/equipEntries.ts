import { ITEMS, type EquipItem, type ItemId } from "../data/items";
import { resolveDroppedItem, type DropQuality } from "../data/dropQuality";
import type { CraftTier } from "../data/craftQuality";
import { resolveCraftedItem } from "../data/recipes";
import { resolveEnhancedItem } from "../character/enhancement";
import type { InventoryState } from "./useInventory";

// 보유 장비를 1개당 한 entry 로 펼친다 — 같은 장비라도 묶지 않는다(중첩 X).
// 기본(equipment[]) · 제작산 등급(craftedEquipment[id][tier]) · 드랍 고품질(droppedEquipment[id][q]) 모두 개수만큼.
// 인스턴스 기반(별빛 재단 무구) 은 instanceId 가 박혀 있고 강화 단계가 item.bonus 에 합쳐져 있다.
export type EquipEntry = {
  key: string;
  id: ItemId;
  tier?: CraftTier;
  quality?: DropQuality;
  /** 인스턴스 기반 한정. 동일 itemId·tier 라도 인스턴스마다 별개 entry. */
  instanceId?: string;
  /** 인스턴스 기반 한정. 강화 단계 (0~7). bonus 에 이미 합쳐져 있다. */
  enhancementLevel?: number;
  /** 인스턴스 기반 한정. 자루별 남은 강화 시도 횟수 (성공·실패 모두 1 차감, 시작 7). */
  remainingAttempts?: number;
  item: EquipItem;
};

export function buildEquipEntries(inventory: InventoryState): EquipEntry[] {
  const entries: EquipEntry[] = [];
  for (const id of Object.keys(ITEMS) as ItemId[]) {
    const n = inventory.equipment[id] ?? 0;
    for (let i = 0; i < n; i++) {
      entries.push({ key: `${id}#${i}`, id, item: ITEMS[id] });
    }
  }
  for (const [id, tiers] of Object.entries(inventory.craftedEquipment)) {
    for (const [t, n] of Object.entries(tiers ?? {})) {
      if (!n || n <= 0) continue;
      const tier = Number(t) as CraftTier;
      const item = resolveCraftedItem(id as ItemId, tier);
      for (let i = 0; i < n; i++) {
        entries.push({ key: `${id}@t${t}#${i}`, id: id as ItemId, tier, item });
      }
    }
  }
  for (const [id, quals] of Object.entries(inventory.droppedEquipment)) {
    for (const [q, n] of Object.entries(quals ?? {})) {
      if (!n || n <= 0) continue;
      const quality = Number(q) as DropQuality;
      if (quality !== 1 && quality !== 2) continue;
      const item = resolveDroppedItem(id as ItemId, quality);
      for (let i = 0; i < n; i++) {
        entries.push({ key: `${id}@q${q}#${i}`, id: id as ItemId, quality, item });
      }
    }
  }
  // 인스턴스 기반 — 한 자루마다 instanceId 로 고유 entry. 강화 단계가 표시·bonus 에 반영.
  for (const inst of inventory.equipmentInstances ?? []) {
    const item = resolveEnhancedItem(
      inst.itemId,
      inst.craftTier,
      inst.enhanceHistory ?? inst.enhancementLevel,
      inst.instanceId,
      inst.enchantSlots,
      inst.remainingAttempts,
    );
    entries.push({
      key: `inst:${inst.instanceId}`,
      id: inst.itemId,
      tier: inst.craftTier,
      instanceId: inst.instanceId,
      enhancementLevel: inst.enhancementLevel,
      remainingAttempts: inst.remainingAttempts,
      item,
    });
  }
  return entries;
}
