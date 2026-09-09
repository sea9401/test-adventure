import { spendGoldWalletFirstWithBank } from "@/adventure/data/v2/coreLoopConfig";
import { canLiberateEquipment } from "@/adventure/data/v2/equipmentLiberation";
import { enchantmentTransferCost, equipmentLiberationRevision } from "@/adventure/data/v2/equipmentEnchantmentTransfer";
import { parseEquipmentSave, V2_EQUIPMENT, type V2EquipInstance } from "@/adventure/data/v2/v2Equipment";
import type { EquipmentLiberationCharacter } from "./equipmentLiberationService";

export type EnchantmentTransferIntent = {
  sourceIid: string;
  targetIid: string;
  expectedSourceRevision: number;
  expectedTargetRevision: number;
};
export type EnchantmentTransferFailure = {
  ok: false;
  error: "not_owned" | "same_item" | "ineligible" | "slot_mismatch" | "no_enchantment" | "stale_state" | "insufficient_gold";
  source?: V2EquipInstance;
  target?: V2EquipInstance;
  goldCost?: number;
};
export type EnchantmentTransferResponse = {
  ok: true;
  source: V2EquipInstance;
  target: V2EquipInstance;
  gold: number;
  bankedGold: number;
  spentGold: number;
};

type Success = {
  ok: true;
  character: EquipmentLiberationCharacter & { gold: number; bankedGold: number };
  equipment: ReturnType<typeof parseEquipmentSave>;
  source: V2EquipInstance;
  target: V2EquipInstance;
  spentGold: number;
};

export function applyEquipmentEnchantmentTransfer(args: EnchantmentTransferIntent & {
  character: EquipmentLiberationCharacter;
  equipment: unknown;
}): Success | EnchantmentTransferFailure {
  if (args.sourceIid === args.targetIid) return { ok: false, error: "same_item" };
  const equipment = parseEquipmentSave(args.equipment);
  const source = equipment.owned.find(({ iid }) => iid === args.sourceIid);
  const target = equipment.owned.find(({ iid }) => iid === args.targetIid);
  if (!source || !target) return { ok: false, error: "not_owned" };
  const sourceCatalog = V2_EQUIPMENT[source.id];
  const targetCatalog = V2_EQUIPMENT[target.id];
  if (!canLiberateEquipment(sourceCatalog, source) || !canLiberateEquipment(targetCatalog, target)) {
    return { ok: false, error: "ineligible" };
  }
  if (sourceCatalog.slot !== targetCatalog.slot) return { ok: false, error: "slot_mismatch" };
  const sourceRevision = equipmentLiberationRevision(source);
  const targetRevision = equipmentLiberationRevision(target);
  if (sourceRevision !== args.expectedSourceRevision || targetRevision !== args.expectedTargetRevision) {
    return { ok: false, error: "stale_state", source, target };
  }
  if (!source.liberation) return { ok: false, error: "no_enchantment" };
  const { goldCost } = enchantmentTransferCost(source.liberation);
  const payment = spendGoldWalletFirstWithBank(
    Math.max(0, Math.floor(Number(args.character.gold) || 0)),
    Math.max(0, Math.floor(Number(args.character.bankedGold) || 0)),
    goldCost,
  );
  if (!payment.ok) return { ok: false, error: "insufficient_gold", goldCost };

  const nextSource: V2EquipInstance = { ...source, bound: true, liberationRevision: sourceRevision + 1 };
  delete nextSource.liberation;
  const nextTarget: V2EquipInstance = {
    ...target,
    bound: true,
    liberationRevision: targetRevision + 1,
    liberation: {
      ...source.liberation,
      options: source.liberation.options.map((option) => ({ ...option })),
      revision: targetRevision + 1,
    },
  };
  return {
    ok: true,
    character: { ...args.character, gold: payment.gold, bankedGold: payment.bankedGold },
    equipment: {
      ...equipment,
      owned: equipment.owned.map((item) => item.iid === source.iid ? nextSource : item.iid === target.iid ? nextTarget : item),
    },
    source: nextSource,
    target: nextTarget,
    spentGold: goldCost,
  };
}
