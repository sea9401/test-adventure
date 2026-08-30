import { spendGoldWalletFirstWithBank } from "@/adventure/data/v2/coreLoopConfig";
import {
  canLiberateEquipment,
  EQUIPMENT_LIBERATION_GOLD_COST,
  rerollLiberation,
  rollInitialLiberation,
} from "@/adventure/data/v2/equipmentLiberation";
import {
  parseEquipmentSave,
  V2_EQUIPMENT,
  type V2EquipInstance,
} from "@/adventure/data/v2/v2Equipment";

export { EQUIPMENT_LIBERATION_GOLD_COST };

export type EquipmentLiberationCharacter = Record<string, unknown> & {
  gold?: unknown;
  bankedGold?: unknown;
};

export type EquipmentLiberationError =
  | "not_owned"
  | "ineligible"
  | "stale_state"
  | "insufficient_gold";

export type EquipmentLiberationSuccess = {
  ok: true;
  character: EquipmentLiberationCharacter & {
    gold: number;
    bankedGold: number;
  };
  equipment: ReturnType<typeof parseEquipmentSave>;
  item: V2EquipInstance;
  spentGold: typeof EQUIPMENT_LIBERATION_GOLD_COST;
};

export type EquipmentLiberationFailure =
  | { ok: false; error: "not_owned" | "ineligible" }
  | { ok: false; error: "stale_state"; item: V2EquipInstance }
  | {
      ok: false;
      error: "insufficient_gold";
      goldCost: typeof EQUIPMENT_LIBERATION_GOLD_COST;
    };

export function applyEquipmentLiberation(args: {
  character: EquipmentLiberationCharacter;
  equipment: unknown;
  iid: string;
  expectedRevision: number;
  rng: () => number;
}): EquipmentLiberationSuccess | EquipmentLiberationFailure {
  const equipment = parseEquipmentSave(args.equipment);
  const itemIndex = equipment.owned.findIndex(({ iid }) => iid === args.iid);
  if (itemIndex < 0) return { ok: false, error: "not_owned" };

  const instance = equipment.owned[itemIndex];
  const catalogItem = V2_EQUIPMENT[instance.id];
  if (!canLiberateEquipment(catalogItem, instance)) {
    return { ok: false, error: "ineligible" };
  }

  const currentRevision = instance.liberation?.revision ?? 0;
  if (currentRevision !== args.expectedRevision) {
    return { ok: false, error: "stale_state", item: instance };
  }

  const gold = Math.max(0, Math.floor(Number(args.character.gold) || 0));
  const bankedGold = Math.max(
    0,
    Math.floor(Number(args.character.bankedGold) || 0),
  );
  const payment = spendGoldWalletFirstWithBank(
    gold,
    bankedGold,
    EQUIPMENT_LIBERATION_GOLD_COST,
  );
  if (!payment.ok) {
    return {
      ok: false,
      error: "insufficient_gold",
      goldCost: EQUIPMENT_LIBERATION_GOLD_COST,
    };
  }

  const liberation = instance.liberation
    ? rerollLiberation(catalogItem.slot, instance.liberation, args.rng)
    : rollInitialLiberation(catalogItem.slot, args.rng);
  const item: V2EquipInstance = {
    ...instance,
    bound: true,
    liberation,
  };
  const owned = [...equipment.owned];
  owned[itemIndex] = item;

  return {
    ok: true,
    character: {
      ...args.character,
      gold: payment.gold,
      bankedGold: payment.bankedGold,
    },
    equipment: { owned, equipped: equipment.equipped },
    item,
    spentGold: EQUIPMENT_LIBERATION_GOLD_COST,
  };
}
