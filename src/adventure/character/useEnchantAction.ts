"use client";

// 별빛 무구 마법부여 — 서버 권위. 클라는 instanceId + materialId(부여서) 만 보내고,
// 서버가 inventory.v2 잠금 후 검증·RNG 굴림·적용한 새 값을 받아 in-memory state 를 replace.
//
// 사전 검사(자루/부여서/슬롯 capacity) 는 UX 용 — 라운드트립 전에 부족분 안내. 권한은 서버.

import { ITEMS } from "@/adventure/data/items";
import type { MaterialId } from "@/adventure/data/materials";
import {
  ENCHANT_AFFIXES,
  affixFromMaterialId,
  enchantSlotCapacity,
  type EnchantAffixId,
} from "@/adventure/character/enchant";
import type { useInventory } from "@/adventure/inventory/useInventory";
import { useRemoteSave } from "@/lib/storage/SaveProvider";
import { readDeviceSessionId } from "@/lib/storage/deviceSession";
import type { NotificationKind, NotificationMeta } from "@/lib/notifications";

const ENCHANT_ERROR_LABELS: Record<string, string> = {
  instance_not_found: "부여할 장비를 찾지 못했다.",
  not_enchantable: "이 장비에는 마법부여를 할 수 없다.",
  no_slot_unlocked: "강화 단계가 모자라 부여 슬롯이 열리지 않았다.",
  slots_full: "이 자루의 부여 슬롯이 이미 다 찼다 — 새 자루에 부여해야 한다.",
  invalid_affix: "알 수 없는 부여서다.",
  missing_scroll: "부여서가 부족하다.",
  invalid_material_id: "부여서 정보가 잘못됐다.",
  invalid_instance_id: "부여할 장비를 찾지 못했다.",
};

export function useEnchantAction(deps: {
  inventory: ReturnType<typeof useInventory>;
  addNotification: (
    kind: NotificationKind,
    text: string,
    meta?: NotificationMeta,
  ) => void;
}) {
  const { inventory, addNotification } = deps;
  const remote = useRemoteSave();

  const handleEnchant = async (instanceId: string, materialId: string) => {
    // UX 사전 검사 — 서버도 같은 검사를 다시 한다.
    const inst = inventory.findEquipmentInstance(instanceId);
    if (!inst) {
      addNotification("info", "부여할 장비를 찾지 못했다.");
      return;
    }
    const affix = affixFromMaterialId(materialId);
    if (!affix) {
      addNotification("info", "알 수 없는 부여서다.");
      return;
    }
    const cap = enchantSlotCapacity(inst.enhancementLevel);
    if (cap <= 0) {
      addNotification(
        "info",
        "강화 단계가 모자라 부여 슬롯이 열리지 않았다.",
      );
      return;
    }
    const cur = inst.enchantSlots ?? [];
    if (cur.length >= cap) {
      addNotification(
        "info",
        "이 자루의 부여 슬롯이 이미 다 찼다 — 새 자루에 부여해야 한다.",
      );
      return;
    }
    const have = inventory.state.materials[materialId as MaterialId] ?? 0;
    if (have < 1) {
      addNotification("info", "부여서가 부족하다.");
      return;
    }

    // 디바운스 큐 flush — 서버가 stale 값 위에서 차감하지 않게.
    await remote.flush();
    let res: Response;
    try {
      const sessionId = readDeviceSessionId();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (sessionId) headers["X-Session-Id"] = sessionId;
      res = await fetch("/api/enchant", {
        method: "POST",
        headers,
        body: JSON.stringify({ instanceId, materialId }),
      });
    } catch {
      addNotification("info", "통신 오류 — 잠시 후 다시 시도해 주세요.");
      return;
    }
    if (res.status === 401 || res.status === 410) return;
    const data = (await res.json().catch(() => null)) as
      | {
          ok: true;
          inventory: unknown;
          slot: { affixId: EnchantAffixId; value: number };
          itemId: string;
        }
      | { ok: false; error: string }
      | null;
    if (!data) {
      addNotification("info", "부여에 실패했다.");
      return;
    }
    if (data.ok === false) {
      addNotification(
        "info",
        ENCHANT_ERROR_LABELS[data.error] ?? "부여에 실패했다.",
      );
      return;
    }
    inventory.replaceFromSaved(data.inventory);
    const item = ITEMS[data.itemId as keyof typeof ITEMS];
    const itemName = item?.name ?? "장비";
    const affixDef = ENCHANT_AFFIXES[data.slot.affixId];
    const unit = affixDef.unit === "percent" ? "%" : "";
    addNotification(
      "milestone",
      `${itemName}에 ${affixDef.name} ${data.slot.value}${unit} 옵션을 부여했다.`,
      {
        highlight: {
          name: `${affixDef.name} ${data.slot.value}${unit}`,
          className: "text-violet-600 dark:text-violet-400",
        },
      },
    );
  };

  return { handleEnchant };
}
