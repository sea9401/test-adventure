import { V2_EQUIPMENT } from "@/adventure/data/v2/v2Equipment";
import { V2_MATERIALS } from "@/adventure/data/v2/dungeonDrops";
import { COOP_EQUIPMENT_BOX } from "@/adventure/data/v2/coopRewards";

export const ECONOMY_EVENT_LABELS: Record<string, string> = {
  "admin.grant.fishing_coin": "관리자 낚시 코인 지급",
  "admin.grant.mastery": "관리자 직업 숙련도 지급",
  "admin.grant.proficiency_points": "관리자 숙련 포인트 지급",
  "admin.grant.treasure_coin": "관리자 발굴 코인 지급",
  "admin.reward.compensate": "관리자 보상 보정",
  "admin.reward.failure.compensated": "보상 실패 보정 처리",
  "admin.reward.failure.ignored": "보상 실패 무시 처리",
  "admin.reward.failure.reviewed": "보상 실패 검토 처리",
  "bank.deposit": "은행 입금",
  "bank.withdraw": "은행 출금",
  "currency.fishing.catch": "낚시 어획 코인",
  "mail.claim": "우편 수령",
  "marketplace.buy": "거래소 구매",
  "marketplace.cancel": "거래소 취소",
  "marketplace.expire": "거래소 만료",
  "marketplace.list": "거래소 등록",
  "marketplace.sell": "거래소 판매",
  "proficiency.certificate.gain": "숙련 증서 보너스",
  "proficiency.certificate.use": "숙련 증서 사용",
  "proficiency.guild_training": "길드 훈련장 숙련",
  "reward.claim": "보상 수령",
  "reward.compensate": "보상 보정",
  "reward.coop.claim": "협동 보스 보상",
  "reward.failure.coop": "협동 보상 실패",
  "reward.failure.fishing": "낚시 보상 실패",
  "reward.failure.marketplace": "거래소 보상 실패",
  "reward.failure.quest": "의뢰 보상 실패",
  "reward.failure.treasure": "발굴 보상 실패",
  "reward.fishing.challenge": "낚시 의뢰 보상",
  "reward.fishing.level": "낚시 레벨 보상",
  "reward.mastery_tower.certificate": "숙련의 탑 증서",
  "reward.quest.equip": "의뢰 장비 보상",
  "reward.quest.gold": "의뢰 골드 보상",
  "reward.quest.stamina_potion": "의뢰 회복약 보상",
  "reward.quest_bundle.stamina_potion": "의뢰 묶음 회복약",
  "shop.equipment.buy": "장비 상점 구매",
  "shop.equipment.sell": "장비 판매",
  "shop.equipment.sell_bulk": "장비 일괄 판매",
  "shop.material.sell": "재료 판매",
  "shop.buy": "상점 구매",
  "shop.sell": "상점 판매",
};

export const ECONOMY_ITEM_KIND_LABELS: Record<string, string> = {
  consumable: "소비 아이템",
  coop_reward: "협동 보상",
  equip: "장비",
  equipment: "장비",
  failure: "보상 실패",
  failure_review: "보상 실패 처리",
  fishing_coin: "낚시 코인",
  gold: "골드",
  mastery: "직업 숙련도",
  mastery_certificate: "숙련 증서",
  material: "재료",
  proficiency: "숙련 포인트",
  stamina_potion: "스태미나 회복약",
  treasure_coin: "발굴 코인",
};

export function economyEventLabel(key: string): string {
  return ECONOMY_EVENT_LABELS[key] ?? key;
}

export function economyItemKindLabel(key: string): string {
  return ECONOMY_ITEM_KIND_LABELS[key] ?? key;
}

export function resolveEconomyEventFilter(raw: string): string {
  return resolveLabelFilter(raw, ECONOMY_EVENT_LABELS);
}

export function resolveEconomyItemKindFilter(raw: string): string {
  return resolveLabelFilter(raw, ECONOMY_ITEM_KIND_LABELS);
}

export function economyItemLabel(kind: string | null, id: string | null): string {
  if (!kind && !id) return "-";
  if (kind === "material" && id) return materialName(id);
  if ((kind === "equip" || kind === "equipment") && id) return equipmentName(id);

  const kindLabel = kind ? economyItemKindLabel(kind) : "";
  if (!id || id === kind) return kindLabel || id || "-";

  return [kindLabel, economyKnownItemName(id)].filter(Boolean).join(" · ");
}

export function economyCountKeyLabel(key: string): string {
  if (key.includes(":")) {
    const [kind, id] = key.split(":", 2);
    return economyItemLabel(kind || null, id || null);
  }
  if (key in ECONOMY_EVENT_LABELS) return economyEventLabel(key);
  if (key in ECONOMY_ITEM_KIND_LABELS) return economyItemKindLabel(key);
  return economyKnownItemName(key) || key;
}

export function economyDetailKeyLabel(key: string): string {
  const labels: Record<string, string> = {
    equipmentId: "장비",
    equipmentBoxId: "장비 상자",
    itemId: "아이템",
    itemKind: "아이템 종류",
    bossMaterialId: "보스 재료",
    materialId: "재료",
    message: "메시지",
    spFruitCount: "SP 열매",
    spFruitMaterialId: "SP 열매 재료",
    quantity: "수량",
    reason: "사유",
    source: "출처",
  };
  return labels[key] ?? key;
}

export function economyDetailValueLabel(key: string, value: unknown): string {
  if (typeof value === "string") {
    if (key === "eventType") return economyEventLabel(value);
    if (key === "itemKind") return economyItemKindLabel(value);
    if (key === "materialId" || key === "bossMaterialId" || key === "spFruitMaterialId") {
      return materialName(value) || economyKnownItemName(value);
    }
    if (key === "itemId" || key === "equipmentId" || key === "uniqueId") {
      return economyKnownItemName(value) || value;
    }
    if (key === "equipmentBoxId") return coopEquipmentBoxName(value) || value;
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return value.map((v) => economyDetailValueLabel(key, v)).join(", ");
  }
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => `${economyDetailKeyLabel(k)}: ${economyDetailValueLabel(k, v)}`)
      .join(", ");
  }
  return "-";
}

export function economyKnownItemName(id: string): string {
  return equipmentName(id) || materialName(id) || coopEquipmentBoxName(id) || economyItemKindLabel(id);
}

function resolveLabelFilter(raw: string, labels: Record<string, string>): string {
  const value = raw.trim();
  if (!value) return "";
  const found = Object.entries(labels).find(
    ([key, label]) => key === value || label === value,
  );
  return found?.[0] ?? value;
}

function materialName(id: string): string {
  return V2_MATERIALS[id as keyof typeof V2_MATERIALS]?.name ?? "";
}

function equipmentName(id: string): string {
  return V2_EQUIPMENT[id as keyof typeof V2_EQUIPMENT]?.name ?? "";
}

function coopEquipmentBoxName(id: string): string {
  return Object.values(COOP_EQUIPMENT_BOX).find((box) => box.id === id)?.name ?? "";
}
