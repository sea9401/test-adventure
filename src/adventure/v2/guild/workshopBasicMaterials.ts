import {
  MINING_MATERIALS,
  MINING_NODES,
} from "@/adventure/data/v2/miningSpots";
import {
  WOODCUTTING_MATERIALS,
  WOODCUTTING_MATERIAL_ID,
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

const WOOD_MATERIAL_IDS = Object.values(WOODCUTTING_MATERIAL_ID);
const MINERAL_MATERIAL_IDS = Object.values(MINING_NODES).map(
  (node) => node.materialId,
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
