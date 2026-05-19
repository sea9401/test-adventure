// 분해 — 잉여 장비/재료를 갈아 마력가루(mana_dust)로 환산.
//
// 통화성 재료 mana_dust 를 통해 회복약 라인의 재료를 통합. UI 패널은 PR E 에서,
// 회복약 레시피는 PR F 에서. 이 모듈은 순수 함수만 — 수율 테이블 + 잠금 판정 +
// 적용 후 새 InventoryState 산출. React/저장소와 분리해 단위 테스트 가능하게 둔다.
//
// 수치 근거(설계 §2-4): 1 시간 사냥 캡 + 종류별 포션 인벤 캡(기본 10)을 고려해
// 수급 위주로 잡았다. 한 사이클 정리에 작은 회복약 캡(10)을 채우고도 남는 정도.

import type { ItemId } from "../data/items";
import { ITEMS, type EquipItem, type ItemRarity } from "../data/items";
import type { MaterialId } from "../data/materials";
import type { CraftTier } from "../data/craftQuality";
import type { DropQuality } from "../data/dropQuality";
import type { EquippedSlots } from "../character/types";
import type { InventoryState } from "../inventory/useInventory";

// ── 수율 테이블 ─────────────────────────────────────────────────────────
// rarity 미지정 장비(common 으로 취급) 는 1, 그 외 단조 증가. unique 는 "유실된
// 명품" — 한 번 녹이면 의미가 있어야 해서 무거운 가중치.
export const RARITY_DUST_YIELD: Record<ItemRarity, number> = {
  common: 1,
  uncommon: 3,
  rare: 8,
  unique: 20,
  legendary: 50,
};

// 재료 → 마력가루. 대다수는 1 (잉여 흡수), 마력성/보스성만 살짝 가중.
// 명단에 없는 재료는 1 (보수적 기본). mana_dust 자체는 매핑하지 않음 — 분해 불가.
const MATERIAL_DUST_OVERRIDE: Partial<Record<MaterialId, number>> = {
  // 마력성 — 결정·정수처럼 잔류 마력이 큰 재료.
  mana_crystal: 3,
  soul_crystal: 3,
  fairy_dust: 3,
  hard_crystal: 3,
  wind_mana_stone: 3,
  // 보스/희귀 — 한 마리에서 한 두 점만 나오는 재료.
  phoenix_feather: 5,
  flame_scale: 5,
  lava_core: 5,
  deep_scale: 5,
  giant_scale: 5,
  unbong_ore: 5,
  war_banner_scrap: 5,
};

// 시작 장비 — character/defaults.ts 의 기본값과 일치. equip_set 라인 의뢰
// ("diola-marin-first-gear-set") 가 이 세 점을 다시 차고 와야 진행되므로
// 분해를 막아 두지 않으면 의도치 않게 막힌다.
const STARTER_ITEM_IDS: readonly ItemId[] = [
  "branch_stick",
  "cloth_clothes",
  "mom_amulet",
];

// ── 입력/출력 타입 ──────────────────────────────────────────────────────
// 인벤토리 안의 "한 위치"를 가리키는 주소.
//   - equipment        : equipment[itemId] (등급 0, 무등급)
//   - craftedEquipment : craftedEquipment[itemId][tier]
//   - droppedEquipment : droppedEquipment[itemId][quality]
//   - material         : materials[materialId]
export type DisassembleEntry =
  | { kind: "equipment"; itemId: ItemId }
  | { kind: "craftedEquipment"; itemId: ItemId; tier: CraftTier }
  | { kind: "droppedEquipment"; itemId: ItemId; quality: DropQuality }
  // 인스턴스 풀(별빛 무구) — 자루마다 instanceId 가 고유. count 는 항상 1 (인스턴스 단위).
  | { kind: "equipmentInstance"; instanceId: string; itemId: ItemId }
  | { kind: "material"; materialId: MaterialId };

export type DisassembleRequest = readonly { entry: DisassembleEntry; count: number }[];

export type BlockReason =
  | "equipped"        // 그 itemId 가 어느 슬롯엔가 장착 중
  | "starter-gear"    // 시작 장비 — equip_set 의뢰 보존
  | "mana-dust"       // mana_dust 자체는 분해 불가
  | "not-enough";     // 인벤에 그 위치 잔량 < 요청 count

export type AppliedEntry = {
  entry: DisassembleEntry;
  count: number;
  yieldEach: number;  // 1점 분해 시 마력가루
};

export type BlockedEntry = {
  entry: DisassembleEntry;
  reason: BlockReason;
};

export type DisassemblePlan = {
  totalDust: number;
  applied: readonly AppliedEntry[];
  blocked: readonly BlockedEntry[];
};

// ── 헬퍼 ─────────────────────────────────────────────────────────────────

function itemIdEquipped(itemId: ItemId, slots: EquippedSlots): boolean {
  const name = ITEMS[itemId]?.name;
  if (!name) return false;
  return (
    slots.weapon?.name === name ||
    slots.armor?.name === name ||
    slots.accessory?.name === name
  );
}

// 인스턴스가 어느 슬롯엔가 장착 중인지 — instanceId 정확 일치. 같은 itemId 두 자루를
// 한 쪽만 차고 한 쪽은 분해하고 싶을 때 itemIdEquipped 보다 정확.
function instanceEquipped(instanceId: string, slots: EquippedSlots): boolean {
  return (
    slots.weapon?.instanceId === instanceId ||
    slots.armor?.instanceId === instanceId ||
    slots.accessory?.instanceId === instanceId
  );
}

function isStarter(itemId: ItemId): boolean {
  return STARTER_ITEM_IDS.includes(itemId);
}

function entryItemRarity(itemId: ItemId): ItemRarity {
  // rarity 미지정은 common 으로 취급 (items.ts 의 rarity 옵셔널 규약).
  const r = (ITEMS[itemId] as EquipItem | undefined)?.rarity;
  return r ?? "common";
}

function entryHave(entry: DisassembleEntry, inv: InventoryState): number {
  switch (entry.kind) {
    case "equipment":
      return inv.equipment[entry.itemId] ?? 0;
    case "craftedEquipment":
      return inv.craftedEquipment[entry.itemId]?.[String(entry.tier)] ?? 0;
    case "droppedEquipment":
      return inv.droppedEquipment[entry.itemId]?.[String(entry.quality)] ?? 0;
    case "equipmentInstance":
      return (inv.equipmentInstances ?? []).some(
        (i) => i.instanceId === entry.instanceId,
      )
        ? 1
        : 0;
    case "material":
      return inv.materials[entry.materialId] ?? 0;
  }
}

// ── 공개 API ─────────────────────────────────────────────────────────────

/**
 * 한 위치(item/tier/quality 또는 material)를 1점 분해할 때 얻는 마력가루.
 * 등급(tier/quality)는 v1 에서는 보너스 없음 — 추후 튜닝.
 */
export function entryYield(entry: DisassembleEntry): number {
  if (entry.kind === "material") {
    if (entry.materialId === "mana_dust") return 0;
    return MATERIAL_DUST_OVERRIDE[entry.materialId] ?? 1;
  }
  // 인스턴스(별빛 무구) 도 rarity 기반 — uncommon=3. 자루별 강화/마법부여는 별도 가치라
  // 분해 시 mana_dust 단위로는 환산하지 않는다 (강화 sink 의 의미를 지키기 위해).
  return RARITY_DUST_YIELD[entryItemRarity(entry.itemId)] ?? 1;
}

/**
 * 잠금 사유. null 이면 분해 가능.
 * count 가 잔량보다 크면 "not-enough" — UI 가 동적 클램프할 때도 이걸로 검사.
 */
export function entryBlockReason(
  entry: DisassembleEntry,
  count: number,
  inv: InventoryState,
  slots: EquippedSlots,
): BlockReason | null {
  if (entry.kind === "material") {
    if (entry.materialId === "mana_dust") return "mana-dust";
  } else if (entry.kind === "equipmentInstance") {
    if (isStarter(entry.itemId)) return "starter-gear";
    // 인스턴스는 instanceId 로 정확히 매칭 — 같은 itemId 둘이라도 한 쪽만 차단.
    if (instanceEquipped(entry.instanceId, slots)) return "equipped";
  } else {
    if (isStarter(entry.itemId)) return "starter-gear";
    if (itemIdEquipped(entry.itemId, slots)) return "equipped";
  }
  if (count <= 0) return "not-enough";
  if (entryHave(entry, inv) < count) return "not-enough";
  return null;
}

/**
 * 요청을 받아 실제 적용 가능한 항목과 차단 항목을 분리. 양은 절대 클램프하지
 * 않고(잔량 부족이면 통째로 blocked) — UI 가 미리 보장하는 게 더 깨끗하다.
 */
export function planDisassemble(
  request: DisassembleRequest,
  inv: InventoryState,
  slots: EquippedSlots,
): DisassemblePlan {
  const applied: AppliedEntry[] = [];
  const blocked: BlockedEntry[] = [];
  let totalDust = 0;
  for (const { entry, count } of request) {
    const reason = entryBlockReason(entry, count, inv, slots);
    if (reason) {
      blocked.push({ entry, reason });
      continue;
    }
    const yieldEach = entryYield(entry);
    applied.push({ entry, count, yieldEach });
    totalDust += yieldEach * count;
  }
  return { totalDust, applied, blocked };
}

/**
 * 계획을 받아 새 InventoryState 를 산출. 입력은 변경하지 않는다(immutable).
 * 잔량 비면 키를 삭제 — useInventory 의 consume 패턴과 동일.
 */
export function applyDisassemble(
  plan: DisassemblePlan,
  inv: InventoryState,
): InventoryState {
  if (plan.applied.length === 0 || plan.totalDust === 0) return inv;

  const equipment = { ...inv.equipment };
  const craftedEquipment: typeof inv.craftedEquipment = {};
  for (const k of Object.keys(inv.craftedEquipment) as ItemId[]) {
    craftedEquipment[k] = { ...inv.craftedEquipment[k] };
  }
  const droppedEquipment: typeof inv.droppedEquipment = {};
  for (const k of Object.keys(inv.droppedEquipment) as ItemId[]) {
    droppedEquipment[k] = { ...inv.droppedEquipment[k] };
  }
  const materials = { ...inv.materials };
  // 인스턴스 풀 — 분해 대상 instanceId 셋 모아두고 한 번에 필터.
  const removeInstanceIds = new Set<string>();

  for (const { entry, count } of plan.applied) {
    if (entry.kind === "equipment") {
      const left = (equipment[entry.itemId] ?? 0) - count;
      if (left > 0) equipment[entry.itemId] = left;
      else delete equipment[entry.itemId];
    } else if (entry.kind === "craftedEquipment") {
      const map = craftedEquipment[entry.itemId];
      if (!map) continue;
      const key = String(entry.tier);
      const left = (map[key] ?? 0) - count;
      if (left > 0) map[key] = left;
      else delete map[key];
      if (Object.keys(map).length === 0) delete craftedEquipment[entry.itemId];
    } else if (entry.kind === "droppedEquipment") {
      const map = droppedEquipment[entry.itemId];
      if (!map) continue;
      const key = String(entry.quality);
      const left = (map[key] ?? 0) - count;
      if (left > 0) map[key] = left;
      else delete map[key];
      if (Object.keys(map).length === 0) delete droppedEquipment[entry.itemId];
    } else if (entry.kind === "equipmentInstance") {
      removeInstanceIds.add(entry.instanceId);
    } else {
      const left = (materials[entry.materialId] ?? 0) - count;
      if (left > 0) materials[entry.materialId] = left;
      else delete materials[entry.materialId];
    }
  }

  // 마력가루 가산.
  materials.mana_dust = (materials.mana_dust ?? 0) + plan.totalDust;

  const equipmentInstances =
    removeInstanceIds.size > 0
      ? (inv.equipmentInstances ?? []).filter(
          (i) => !removeInstanceIds.has(i.instanceId),
        )
      : inv.equipmentInstances;

  return {
    ...inv,
    equipment,
    craftedEquipment,
    droppedEquipment,
    materials,
    ...(equipmentInstances !== undefined ? { equipmentInstances } : {}),
  };
}
