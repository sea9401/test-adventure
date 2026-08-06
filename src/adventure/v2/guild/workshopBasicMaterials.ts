import {
  MINING_MATERIALS,
  MINING_SPOT_IDS,
  MINING_SPOTS,
  miningNodeForSpot,
} from "@/adventure/data/v2/miningSpots";
import {
  WOODCUTTING_MATERIALS,
  WOODCUTTING_SPOT_IDS,
  WOODCUTTING_SPOTS,
  woodcuttingTreeForSpot,
} from "@/adventure/data/v2/woodcuttingSpots";

export type WorkshopBasicMaterialEntry = {
  key: string;
  label: string;
  amount: number;
};

export type WorkshopBasicMaterialGroup = {
  key: "wood" | "mineral";
  label: "목재" | "광물";
  entries: WorkshopBasicMaterialEntry[];
};

// 생활지도와 같은 지역 순서를 그대로 사용한다. 재료 카탈로그의 선언 순서를 사용하면
// 지역 순서가 바뀌었을 때 두 화면이 서로 다르게 보일 수 있다.
const WOOD_MATERIAL_IDS = WOODCUTTING_SPOT_IDS.map(
  (spotId) => woodcuttingTreeForSpot(WOODCUTTING_SPOTS[spotId]).materialId,
);
const MINERAL_MATERIAL_IDS = MINING_SPOT_IDS.map(
  (spotId) => miningNodeForSpot(MINING_SPOTS[spotId]).materialId,
);

export function workshopBasicMaterialGroups(
  materials: Readonly<Record<string, number>>,
): WorkshopBasicMaterialGroup[] {
  const entry = (
    id: string,
    catalog: Readonly<Record<string, { name: string }>>,
  ): WorkshopBasicMaterialEntry => ({
    key: id,
    label: catalog[id].name,
    amount: Math.max(0, Math.floor(materials[id] ?? 0)),
  });

  return [
    {
      key: "wood",
      label: "목재",
      entries: WOOD_MATERIAL_IDS.map((id) => entry(id, WOODCUTTING_MATERIALS)),
    },
    {
      key: "mineral",
      label: "광물",
      entries: MINERAL_MATERIAL_IDS.map((id) => entry(id, MINING_MATERIALS)),
    },
  ];
}
