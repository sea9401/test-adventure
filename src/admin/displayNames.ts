import {
  V2_EQUIPMENT,
  V2_SLOT_LABEL,
  type V2EquipSlot,
  type V2Equipment,
} from "@/adventure/data/v2/v2Equipment";
import { V2_MATERIALS } from "@/adventure/data/v2/dungeonDrops";
import { RARE_MAP_KINDS } from "@/adventure/data/v2/rareMaps";

const EQUIP_SLOT_ORDER: readonly V2EquipSlot[] = [
  "weapon",
  "armor",
  "gloves",
  "boots",
  "ring",
  "necklace",
];

const ACTION_LABELS: Record<string, string> = {
  "grant.v2": "아이템 지급",
  "mail.broadcast": "전체 우편",
  "mail.user": "개별 우편",
  "reset-character": "캐릭터 초기화",
  "sanction.ban": "영구 밴",
  "sanction.suspend": "기간 정지",
  "sanction.warn": "경고",
  "sanction.lift": "제재 해제",
  "season-ops.pvp-rollover": "아레나 시즌 정리",
  "season-ops.pvp-rewards": "아레나 보상 지급",
  "season-ops.fishing-rewards": "낚시 보상 지급",
  "season-ops.treasure-rewards": "발굴 보상 지급",
};

const GRANT_KEY_LABELS: Record<string, string> = {
  materials: "재료",
  hpCharges: "HP 충전약",
  mpCharges: "MP 충전약",
  proficiencyEarned: "숙련도",
  masteryEarned: "직업 숙련도",
  equipmentOwned: "장비",
  equipmentNoOp: "장비 변경 없음",
  staminaRefilled: "스태미나 회복",
  rareMapGranted: "레어맵",
  fishingCoins: "낚시 코인",
  treasureCoins: "발굴 코인",
};

export function adminMaterialName(id: string): string {
  return V2_MATERIALS[id as keyof typeof V2_MATERIALS]?.name ?? id;
}

export function adminEquipmentName(id: string): string {
  return V2_EQUIPMENT[id as keyof typeof V2_EQUIPMENT]?.name ?? id;
}

export function adminRareMapName(id: string): string {
  return RARE_MAP_KINDS[id as keyof typeof RARE_MAP_KINDS]?.name ?? id;
}

export function adminEquipmentOptionLabel(item: V2Equipment): string {
  return `T${item.tier} · ${V2_SLOT_LABEL[item.slot]} · ${item.name}`;
}

export function adminEquipSlotSortValue(slot: V2EquipSlot): number {
  const idx = EQUIP_SLOT_ORDER.indexOf(slot);
  return idx < 0 ? EQUIP_SLOT_ORDER.length : idx;
}

export function adminActionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

export function formatAdminAuditDetail(
  detail: Record<string, unknown> | null,
): string {
  if (!detail) return "—";

  const parts: string[] = [];
  const gameName = stringValue(detail.gameName);
  if (gameName) parts.push(`대상 ${gameName}`);

  const gold = numberValue(detail.gold);
  if (gold && gold > 0) parts.push(`${gold.toLocaleString()} 골드`);

  const recipients = numberValue(detail.recipients);
  if (recipients != null) parts.push(`수신 ${recipients.toLocaleString()}명`);

  const materials = materialListValue(detail.materials);
  if (materials) parts.push(`재료 ${materials}`);

  const items = itemListValue(detail.items);
  if (items) parts.push(`장비 ${items}`);

  const staminaPotions = numberValue(detail.staminaPotions);
  if (staminaPotions && staminaPotions > 0) {
    parts.push(`스태미나 회복약 ${staminaPotions.toLocaleString()}개`);
  }

  const granted = grantListValue(detail.granted);
  if (granted) parts.push(`지급 ${granted}`);

  const reason = stringValue(detail.reason);
  if (reason) parts.push(`사유 ${reason}`);

  const days = numberValue(detail.days);
  if (days && days > 0) parts.push(`${days.toLocaleString()}일`);

  const message = stringValue(detail.message);
  if (message) parts.push(`메시지 "${message}"`);

  return parts.length > 0 ? parts.join(" · ") : fallbackDetail(detail);
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function materialListValue(value: unknown): string | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const row = entry as Record<string, unknown>;
      const id = stringValue(row.materialId);
      const count = numberValue(row.count);
      if (!id || !count) return null;
      return `${adminMaterialName(id)} x${count.toLocaleString()}`;
    })
    .filter((v): v is string => Boolean(v))
    .join(", ");
}

function itemListValue(value: unknown): string | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const row = entry as Record<string, unknown>;
      const id = stringValue(row.itemId);
      const count = numberValue(row.count);
      if (!id || !count) return null;
      return `${adminEquipmentName(id)} x${count.toLocaleString()}`;
    })
    .filter((v): v is string => Boolean(v))
    .join(", ");
}

function grantListValue(value: unknown): string | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  return value
    .map((entry) => (typeof entry === "string" ? GRANT_KEY_LABELS[entry] ?? entry : null))
    .filter((v): v is string => Boolean(v))
    .join(", ");
}

function fallbackDetail(detail: Record<string, unknown>): string {
  return Object.entries(detail)
    .map(([key, value]) => `${key}: ${formatUnknownValue(key, value)}`)
    .join(" · ");
}

function formatUnknownValue(key: string, value: unknown): string {
  if (typeof value === "string") {
    if (key === "materialId") return adminMaterialName(value);
    if (key === "itemId" || key === "equipmentId") return adminEquipmentName(value);
    if (key === "kind") return adminRareMapName(value);
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map((v) => formatUnknownValue(key, v)).join(", ");
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => `${k}: ${formatUnknownValue(k, v)}`)
      .join(", ");
  }
  return "—";
}
