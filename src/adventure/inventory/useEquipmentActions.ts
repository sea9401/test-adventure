"use client";

import {
  ITEMS,
  findItemId,
  rarityTextClass,
  type EquipSlot,
  type ItemId,
} from "@/adventure/data/items";
import { craftTierSuffix, type CraftTier } from "@/adventure/data/craftQuality";
import {
  dropQualityPrefix,
  dropQualityTextClass,
  resolveDroppedItem,
  type DropQuality,
} from "@/adventure/data/dropQuality";
import { resolveCraftedItem } from "@/adventure/data/recipes";
import {
  ENHANCE_INITIAL_ATTEMPTS,
  isEnhanceable,
  resolveEnhancedItem,
} from "@/adventure/character/enhancement";
import {
  isStarlitRing,
  resolveStarlitRing,
} from "@/adventure/inventory/starlitRing";
import type { EquippedItem } from "@/adventure/character/types";
import type { useCharacterState } from "@/adventure/character/useCharacterState";
import type { useInventory } from "@/adventure/inventory/useInventory";
import type { NotificationKind, NotificationMeta } from "@/lib/notifications";

// 장비 장착/해제 핸들러 묶음. 순수 클라 상태 조작이라 서버 권위 불필요 —
// consume/setSlot 후 useRemotePatch 가 inventory.v2 / character.v2 를 동기화한다.
// 잉여 장비 정리는 가방의 폐기가 아니라 대장간 옆 분해실(crafting/disassemble)에서 처리.
export function useEquipmentActions(deps: {
  inventory: ReturnType<typeof useInventory>;
  characterStateHook: ReturnType<typeof useCharacterState>;
  addNotification: (
    kind: NotificationKind,
    text: string,
    meta?: NotificationMeta,
  ) => void;
}) {
  const { inventory, characterStateHook, addNotification } = deps;

  // 한 장비 인스턴스의 표시 이름 — 드랍 품질은 prefix("정교한 ○○"), 제작 등급은 suffix("○○ ⟨걸작⟩"),
  // 강화 단계는 끝에 " +N" 으로 붙는다(별빛 재단 무구 한정).
  const equipDisplayName = (
    id: ItemId,
    tier?: CraftTier,
    quality?: DropQuality,
    enhancementLevel?: number,
  ): string =>
    dropQualityPrefix(quality) +
    ITEMS[id].name +
    craftTierSuffix(tier) +
    (enhancementLevel && enhancementLevel > 0 ? ` +${enhancementLevel}` : "");

  // 표시 이름 강조 색 — 드랍 고품질이면 그 등급 톤, 아니면 아이템 rarity 톤.
  const equipNameClass = (id: ItemId, quality?: DropQuality): string =>
    quality ? dropQualityTextClass(quality) : rarityTextClass(ITEMS[id]);

  // 슬롯에 장착돼 있던 장비를 인벤토리로 회수 — 인스턴스 기반이면 풀로, 제작산/드랍
  // 고품질이면 등급별 칸으로, 아니면 기본 칸으로.
  const returnEquippedToInventory = (item: EquippedItem | null) => {
    if (!item) return;
    const id = findItemId(item);
    if (!id) return;
    // 별빛 고리(롤 장신구) — instanceId + rolledBonus 로 풀에 복원. 롤 보존.
    if (item.instanceId && isStarlitRing(id) && item.rolledBonus) {
      inventory.addEquipmentInstance({
        instanceId: item.instanceId,
        itemId: id,
        enhancementLevel: 0,
        remainingAttempts: 0,
        rolledBonus: item.rolledBonus,
      });
      return;
    }
    // 인스턴스 기반(별빛 재단 무구) — instanceId 로 풀에 복원. 강화 단계 보존.
    if (item.instanceId && isEnhanceable(id)) {
      inventory.addEquipmentInstance({
        instanceId: item.instanceId,
        itemId: id,
        craftTier: item.craftTier,
        enhancementLevel: item.enhancementLevel ?? 0,
        // 슬롯에 박혀 있는 동안 history/remainingAttempts 는 EquippedItem 에 미반영이라
        // 회수 시 풀에서 복원이 필요. 단 EquippedItem 자체에 그 메타가 없으니
        // safe 모드 fallback + 시작 가능 횟수로 임시 박는다 — 실제 history 보존은
        // 슬롯 장착 시점에 EquippedItem 까지 메타를 끌고 가는 후속 PR 에서 정리.
        enhanceHistory: item.enhanceHistory,
        remainingAttempts:
          item.remainingAttempts ?? ENHANCE_INITIAL_ATTEMPTS,
        // 마법부여 슬롯도 풀로 되돌린다 — 누락 시 장착 해제하면 부여가 사라진다.
        enchantSlots: item.enchantSlots,
      });
      return;
    }
    const tier = item.craftTier;
    if (tier != null && tier !== 0) {
      inventory.addCraftedEquipment(id, tier, 1);
      return;
    }
    const q = item.dropQuality;
    if (q === 1 || q === 2) {
      inventory.addDroppedEquipment(id, q, 1);
      return;
    }
    inventory.addEquipment(id, 1);
  };

  // 인스턴스 기반 장비 장착 — 풀에서 instanceId 로 한 자루 꺼내 슬롯에 박는다.
  // 기존 장비는 회수(인스턴스 기반이면 풀로, 아니면 스택으로).
  const handleEquipInstanceFromInventory = (instanceId: string) => {
    const inst = inventory.findEquipmentInstance(instanceId);
    if (!inst) return;
    if (!inventory.consumeEquipmentInstance(instanceId)) return;
    const equipItem: EquippedItem =
      isStarlitRing(inst.itemId) && inst.rolledBonus
        ? resolveStarlitRing(inst.rolledBonus, inst.instanceId)
        : resolveEnhancedItem(
            inst.itemId,
            inst.craftTier,
            inst.enhanceHistory ?? inst.enhancementLevel,
            inst.instanceId,
            inst.enchantSlots,
            inst.remainingAttempts,
          );
    returnEquippedToInventory(
      characterStateHook.equippedSlots[equipItem.slot],
    );
    characterStateHook.setSlot(equipItem.slot, equipItem);
    const name = equipDisplayName(
      inst.itemId,
      inst.craftTier,
      undefined,
      inst.enhancementLevel,
    );
    addNotification("item", `${name}을(를) 장착했다.`, {
      highlight: { name, className: equipNameClass(inst.itemId) },
    });
  };

  // 인벤토리에서 장비를 꺼내 장착. 보유분에서 1개 차감, 기존 장비는 회수.
  // tier ±1·±2 = 제작산 등급 스택, quality 1·2 = 드랍 고품질 스택, 둘 다 미지정/0 = 기본 스택.
  const handleEquipFromInventory = (
    id: ItemId,
    tier?: CraftTier,
    quality?: DropQuality,
  ) => {
    const isCrafted = tier != null && tier !== 0;
    const isDropped = !isCrafted && (quality === 1 || quality === 2);
    if (isCrafted) {
      if (!inventory.consumeCraftedEquipment(id, tier, 1)) return;
    } else if (isDropped) {
      if (!inventory.consumeDroppedEquipment(id, quality, 1)) return;
    } else {
      if (!inventory.consumeEquipment(id, 1)) return;
    }
    const item = ITEMS[id];
    const equipItem: EquippedItem = isCrafted
      ? resolveCraftedItem(id, tier)
      : isDropped
        ? resolveDroppedItem(id, quality)
        : item;
    returnEquippedToInventory(characterStateHook.equippedSlots[item.slot]);
    characterStateHook.setSlot(item.slot, equipItem);
    const name = equipDisplayName(id, tier, isDropped ? quality : undefined);
    addNotification("item", `${name}을(를) 장착했다.`, {
      highlight: {
        name,
        className: equipNameClass(id, isDropped ? quality : undefined),
      },
    });
  };

  const handleUnequip = (slot: EquipSlot) => {
    const current = characterStateHook.equippedSlots[slot];
    if (!current) return;
    returnEquippedToInventory(current);
    characterStateHook.setSlot(slot, null);
    const id = findItemId(current);
    const name = id
      ? equipDisplayName(
          id,
          current.craftTier,
          current.dropQuality,
          current.enhancementLevel,
        )
      : current.name;
    addNotification("item", `${name}을(를) 해제했다.`, {
      highlight: {
        name,
        className: id
          ? equipNameClass(id, current.dropQuality)
          : rarityTextClass(current),
      },
    });
  };

  // 가방 → 도감 보관함. inventory.depositToVault 가 atomic 으로 인벤 차감 + vault 증가.
  const handleDepositToVault = (
    id: ItemId,
    tier?: CraftTier,
    quality?: DropQuality,
  ) => {
    const isDropped = (tier == null || tier === 0) && (quality === 1 || quality === 2);
    if (!inventory.depositToVault(id, tier, quality, 1)) return;
    addNotification(
      "item",
      `${equipDisplayName(id, tier, isDropped ? quality : undefined)}을(를) 모험의 서에 보관했다.`,
    );
  };

  // 도감 보관함 → 가방. variantKey 는 ItemsTab 이 알고 있는 형태("base"|"c±N"|"dN").
  const handleWithdrawFromVault = (id: ItemId, variantKey: string) => {
    if (!inventory.withdrawFromVault(id, variantKey, 1)) return;
    const tier =
      variantKey[0] === "c"
        ? (Number(variantKey.slice(1)) as CraftTier)
        : undefined;
    const quality =
      variantKey[0] === "d"
        ? (Number(variantKey.slice(1)) as DropQuality)
        : undefined;
    const isDropped = quality === 1 || quality === 2;
    addNotification(
      "item",
      `${equipDisplayName(id, tier, isDropped ? quality : undefined)}을(를) 가방으로 꺼냈다.`,
    );
  };

  return {
    handleEquipFromInventory,
    handleEquipInstanceFromInventory,
    handleUnequip,
    handleDepositToVault,
    handleWithdrawFromVault,
  };
}
