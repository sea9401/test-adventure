import {
  V2_EQUIPMENT,
  type V2Equipment,
  type V2EquipmentId,
} from "./v2Equipment";

export type EquipmentProgressionRequirement = {
  minFrontierDepth: number;
  label: string;
};

const FRONTIER_DEPTH_LABEL: Readonly<Record<number, string>> = {
  6: "들판 6",
  12: "마른 협곡 6",
  18: "얼음 호수 6",
  24: "심층 동굴 6",
  30: "잊힌 성소 6",
  36: "리자드 늪지 6",
  42: "짐승의 소굴 6",
  48: "검은 왕도 6",
  54: "붉은 벌판 6",
  60: "백골 고원 6",
  66: "폭풍 산맥 6",
  68: "심해 폐허 2",
  72: "심해 폐허 6",
};

// 표시 티어는 내부 카탈로그 티어 3개씩을 묶으므로 장착 게이트에는 쓸 수 없다.
// T4~T11 은 카탈로그 티어마다 사냥터 1개가 정확히 대응하고, T12부터는 여러 출처가
// 같은 티어를 공유해 id 출처를 별도로 구분한다.
function minFrontierDepthForEquipment(item: V2Equipment): number | null {
  if (item.tier <= 3) return null;

  if (item.id.startsWith("v2_stormpeak_")) return 60;
  if (item.id.startsWith("v2_abyssruin_")) return 66;

  // 협동 보스 장비는 보스가 스케일되는 사냥터 깊이를 진행 게이트로 사용한다.
  if (item.id.startsWith("v2_boss_void_")) return 60;
  if (item.id.startsWith("v2_hard_sangoon_")) return 68;
  if (item.id.startsWith("v2_boss_abyssal_")) return 60;

  // T4=마른 협곡 장비(들판 6 돌파), ... T12=백골 고원 장비(붉은 벌판 6 돌파).
  if (item.tier <= 12) return (item.tier - 3) * 6;

  // 출처가 추가된 미래 5T 장비는 마지막 현행 사냥터 돌파를 안전 기본값으로 둔다.
  return 72;
}

export function equipmentProgressionRequirement(
  itemOrId: V2Equipment | V2EquipmentId,
): EquipmentProgressionRequirement | null {
  const item =
    typeof itemOrId === "string" ? V2_EQUIPMENT[itemOrId] : itemOrId;
  const minFrontierDepth = minFrontierDepthForEquipment(item);
  if (minFrontierDepth == null) return null;
  const depthLabel =
    FRONTIER_DEPTH_LABEL[minFrontierDepth] ?? `사냥터 깊이 ${minFrontierDepth}`;
  return {
    minFrontierDepth,
    label: `${depthLabel} 돌파`,
  };
}

export function normalizeEquipmentFrontierDepth(raw: unknown): number {
  return Math.max(2, Math.floor(Number(raw) || 2));
}

export function equipmentProgressionLock(
  itemOrId: V2Equipment | V2EquipmentId,
  frontierDepthRaw: unknown,
): EquipmentProgressionRequirement | null {
  const requirement = equipmentProgressionRequirement(itemOrId);
  if (!requirement) return null;
  return normalizeEquipmentFrontierDepth(frontierDepthRaw) <
    requirement.minFrontierDepth
    ? requirement
    : null;
}

