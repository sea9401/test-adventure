import {
  UNEXPLORED_BOSS_CORE_MATERIAL,
  unexploredBossEquipmentCraftRecipe,
} from "@/adventure/data/v2/unexploredBosses";
import {
  parseUnexploredSave,
  type UnexploredEquipmentCraftReceipt,
  type UnexploredSave,
} from "@/adventure/data/v2/unexploredState";
import {
  mintRolledEquipInstance,
} from "@/adventure/data/v2/v2EquipMint";
import type {
  V2EquipInstance,
  V2EquipmentId,
} from "@/adventure/data/v2/v2Equipment";

export type UnexploredBossEquipmentCraftCharacter = Record<string, unknown> & {
  materials?: unknown;
  unexplored?: unknown;
};

export type UnexploredBossEquipmentCraftError =
  | "not_craftable"
  | "insufficient_boss_cores"
  | "insufficient_pool_material"
  | "request_conflict";

type CraftedCharacter = UnexploredBossEquipmentCraftCharacter & {
  materials: Record<string, number>;
  unexplored: UnexploredSave;
};

type MintEquipment = (equipmentId: V2EquipmentId) => V2EquipInstance;

export type UnexploredBossEquipmentCraftSuccess = {
  ok: true;
  idempotent: boolean;
  character: CraftedCharacter;
  receipt: UnexploredEquipmentCraftReceipt;
  equipment: V2EquipInstance | null;
};

function materialInventory(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return Object.fromEntries(
    Object.entries(raw as Record<string, unknown>).flatMap(([id, value]) => {
      const count = Math.max(0, Math.floor(Number(value) || 0));
      return count > 0 ? [[id, count]] : [];
    }),
  );
}

function spendMaterial(
  materials: Record<string, number>,
  materialId: string,
  count: number,
): void {
  const left = (materials[materialId] ?? 0) - count;
  if (left > 0) materials[materialId] = left;
  else delete materials[materialId];
}

export function applyUnexploredBossEquipmentCraft(
  character: UnexploredBossEquipmentCraftCharacter,
  equipmentId: unknown,
  requestId: string,
  craftedAt: number,
  mint: MintEquipment = mintRolledEquipInstance,
):
  | UnexploredBossEquipmentCraftSuccess
  | { ok: false; error: UnexploredBossEquipmentCraftError } {
  const recipe = unexploredBossEquipmentCraftRecipe(equipmentId);
  if (!recipe) return { ok: false, error: "not_craftable" };

  const save = parseUnexploredSave(character.unexplored);
  const existing = save.equipmentCraftReceipts.find(
    (receipt) => receipt.requestId === requestId,
  );
  if (existing) {
    if (existing.equipmentId !== recipe.equipmentId) {
      return { ok: false, error: "request_conflict" };
    }
    return {
      ok: true,
      idempotent: true,
      character: {
        ...character,
        materials: materialInventory(character.materials),
        unexplored: save,
      },
      receipt: existing,
      equipment: null,
    };
  }

  const materials = materialInventory(character.materials);
  if (
    (materials[UNEXPLORED_BOSS_CORE_MATERIAL.id] ?? 0) < recipe.bossCoreCost
  ) {
    return { ok: false, error: "insufficient_boss_cores" };
  }
  if (
    recipe.materialCosts.some(
      (cost) => (materials[cost.materialId] ?? 0) < cost.count,
    )
  ) {
    return { ok: false, error: "insufficient_pool_material" };
  }

  const equipment = mint(recipe.equipmentId);
  spendMaterial(
    materials,
    UNEXPLORED_BOSS_CORE_MATERIAL.id,
    recipe.bossCoreCost,
  );
  for (const cost of recipe.materialCosts) {
    spendMaterial(materials, cost.materialId, cost.count);
  }
  const receipt: UnexploredEquipmentCraftReceipt = {
    requestId,
    equipmentId: recipe.equipmentId,
    equipmentIid: equipment.iid,
    craftedAt: Math.max(0, Math.floor(craftedAt)),
  };
  const unexplored = parseUnexploredSave({
    ...save,
    equipmentCraftReceipts: [...save.equipmentCraftReceipts, receipt],
  });
  return {
    ok: true,
    idempotent: false,
    character: { ...character, materials, unexplored },
    receipt,
    equipment,
  };
}
