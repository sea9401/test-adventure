import {
  V2_EQUIPMENT,
  parseCraftedBy,
  parseEquipRollForItem,
  parseEquipmentSave,
  parseInstanceCraftQuality,
  parseInstanceEnhance,
  type V2CraftQualityState,
  type V2CraftedBy,
  type V2EquipmentId,
  type V2EquipInstance,
  type V2EquipRoll,
} from "@/adventure/data/v2/v2Equipment";
import type { V2EnhanceState } from "@/adventure/data/v2/v2Enhance";

// 메시지에 저장하는 전송 시점 장비 스냅샷. iid·잠금·장착 여부는 공개하지 않는다.
export type ChatEquipmentLink = {
  kind: "equipment";
  itemId: V2EquipmentId;
  roll?: V2EquipRoll;
  enhance?: V2EnhanceState;
  craftQuality?: V2CraftQualityState;
  craftedBy?: V2CraftedBy;
};

export function chatEquipmentLinkFromInstance(
  instance: V2EquipInstance,
): ChatEquipmentLink {
  return {
    kind: "equipment",
    itemId: instance.id,
    ...(instance.roll ? { roll: instance.roll } : {}),
    ...(instance.enhance ? { enhance: instance.enhance } : {}),
    ...(instance.craftQuality
      ? { craftQuality: instance.craftQuality }
      : {}),
    ...(instance.craftedBy ? { craftedBy: instance.craftedBy } : {}),
  };
}

// DB/네트워크의 JSONB를 그대로 신뢰하지 않고 장비 세이브와 같은 파서로 정규화한다.
export function parseChatEquipmentLink(raw: unknown): ChatEquipmentLink | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  if (value.kind !== "equipment" || typeof value.itemId !== "string") {
    return null;
  }
  if (!Object.prototype.hasOwnProperty.call(V2_EQUIPMENT, value.itemId)) {
    return null;
  }
  const itemId = value.itemId as V2EquipmentId;
  const roll = parseEquipRollForItem(V2_EQUIPMENT[itemId], value.roll);
  const craftedBy = parseCraftedBy(value.craftedBy);
  const craftQuality = parseInstanceCraftQuality(
    value.craftQuality,
    value.enhance,
    craftedBy,
  );
  const enhance = parseInstanceEnhance(
    value.enhance,
    value.craftQuality,
    craftedBy,
  );
  return {
    kind: "equipment",
    itemId,
    ...(roll ? { roll } : {}),
    ...(enhance ? { enhance } : {}),
    ...(craftQuality ? { craftQuality } : {}),
    ...(craftedBy ? { craftedBy } : {}),
  };
}

// 서버 전용 사용처: 현재 보유 세이브에서 iid를 찾은 경우에만 공개 스냅샷을 만든다.
export function chatEquipmentLinkForOwnedIid(
  equipmentRaw: unknown,
  iid: string,
): ChatEquipmentLink | null {
  const instance = parseEquipmentSave(equipmentRaw).owned.find(
    (candidate) => candidate.iid === iid,
  );
  return instance ? chatEquipmentLinkFromInstance(instance) : null;
}

export function chatEquipmentLinkLabel(link: ChatEquipmentLink): string {
  const item = V2_EQUIPMENT[link.itemId];
  const enhance = link.enhance?.level ?? 0;
  return `${item.name}${enhance > 0 ? ` +${enhance}` : ""}`;
}
