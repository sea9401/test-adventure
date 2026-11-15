import { equipmentLiberationRevision } from "@/adventure/data/v2/equipmentEnchantmentTransfer";
import { spendGoldWalletFirstWithBank } from "@/adventure/data/v2/coreLoopConfig";
import { mergeDrops } from "@/adventure/data/v2/dungeonDrops";
import {
  canLiberateEquipment,
  EQUIPMENT_LIBERATION_GOLD_COST,
  isValidLiberationLockedLines,
  rerollLiberation,
  rollInitialLiberation,
} from "@/adventure/data/v2/equipmentLiberation";
import {
  LIBERATION_LOCK_GOLD_PER_LINE,
  pickLiberationLockGems,
} from "@/adventure/v2/gemCutting";
import {
  ENCHANT_SCROLL_ITEM_ID,
  removeMuseunCashItem,
} from "@/adventure/data/v2/museunCashItems";
import {
  parseEquipmentSave,
  V2_EQUIPMENT,
  type V2EquipInstance,
} from "@/adventure/data/v2/v2Equipment";

export { EQUIPMENT_LIBERATION_GOLD_COST };

export type EquipmentLiberationCharacter = Record<string, unknown> & {
  gold?: unknown;
  bankedGold?: unknown;
  cashItems?: unknown;
  materials?: unknown;
};

/** 마법부여 비용은 골드(지갑 먼저, 부족분 은행) 또는 마법부여서 1장으로 낸다. */
export type EquipmentLiberationPayment = "gold" | "enchant_scroll";

export type EquipmentLiberationError =
  | "not_owned"
  | "ineligible"
  | "stale_state"
  | "invalid_locked_lines"
  | "insufficient_cut_gems"
  | "insufficient_gold"
  | "insufficient_enchant_scroll";

export type EquipmentLiberationSuccess = {
  ok: true;
  character: EquipmentLiberationCharacter & {
    gold: number;
    bankedGold: number;
  };
  equipment: ReturnType<typeof parseEquipmentSave>;
  item: V2EquipInstance;
  spentGold: number;
  spentEnchantScrolls: number;
  /** 줄 고정에 쓴 세공 보석(재료 id → 개수). 고정하지 않았으면 빈 객체. */
  spentCutGems: Record<string, number>;
};

export type EquipmentLiberationFailure =
  | { ok: false; error: "not_owned" | "ineligible" | "invalid_locked_lines" | "insufficient_cut_gems" }
  | { ok: false; error: "stale_state"; item: V2EquipInstance }
  | {
      ok: false;
      error: "insufficient_gold";
      /** 이번 요청에 필요한 골드 총액(기본 비용과 줄 고정 추가분). */
      goldCost: number;
    }
  | { ok: false; error: "insufficient_enchant_scroll" };

export function applyEquipmentLiberation(args: {
  character: EquipmentLiberationCharacter;
  equipment: unknown;
  iid: string;
  expectedRevision: number;
  payment?: EquipmentLiberationPayment;
  /** 다시 마법부여할 때 그대로 둘 줄 번호(0부터). 줄 하나에 세공 보석 1개와 추가 골드가 든다. */
  lockedLines?: readonly number[];
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

  const currentRevision = equipmentLiberationRevision(instance);
  if (currentRevision !== args.expectedRevision) {
    return { ok: false, error: "stale_state", item: instance };
  }

  // 줄 고정: 이미 마법부여한 장비에서만, 줄 수보다 하나 적게까지. 보석은 쓸 수 있는 낮은 등급부터 쓴다.
  const lockedLines = args.lockedLines ?? [];
  let spentCutGems: Record<string, number> = {};
  if (lockedLines.length > 0) {
    if (
      !instance.liberation ||
      !isValidLiberationLockedLines(instance.liberation.lineCount, lockedLines)
    ) {
      return { ok: false, error: "invalid_locked_lines" };
    }
    const picked = pickLiberationLockGems(
      mergeDrops(args.character.materials, {}),
      instance.liberation.rank,
      lockedLines.length,
    );
    if (!picked) return { ok: false, error: "insufficient_cut_gems" };
    spentCutGems = picked;
  }
  const lockGold = lockedLines.length * LIBERATION_LOCK_GOLD_PER_LINE;

  let paidCharacter: EquipmentLiberationCharacter;
  let spentGold = 0;
  let spentEnchantScrolls = 0;
  if (args.payment === "enchant_scroll") {
    const cashItems = removeMuseunCashItem(
      args.character.cashItems,
      ENCHANT_SCROLL_ITEM_ID,
      1,
    );
    if (!cashItems) return { ok: false, error: "insufficient_enchant_scroll" };
    // 마법부여서는 기본 비용만 대신한다. 줄 고정의 추가 골드는 골드로 낸다.
    const lockPayment = spendGoldWalletFirstWithBank(
      Math.max(0, Math.floor(Number(args.character.gold) || 0)),
      Math.max(0, Math.floor(Number(args.character.bankedGold) || 0)),
      lockGold,
    );
    if (!lockPayment.ok) {
      return { ok: false, error: "insufficient_gold", goldCost: lockGold };
    }
    paidCharacter = {
      ...args.character,
      cashItems,
      gold: lockPayment.gold,
      bankedGold: lockPayment.bankedGold,
    };
    spentEnchantScrolls = 1;
    spentGold = lockGold;
  } else {
    const gold = Math.max(0, Math.floor(Number(args.character.gold) || 0));
    const bankedGold = Math.max(
      0,
      Math.floor(Number(args.character.bankedGold) || 0),
    );
    const goldCost = EQUIPMENT_LIBERATION_GOLD_COST + lockGold;
    const payment = spendGoldWalletFirstWithBank(gold, bankedGold, goldCost);
    if (!payment.ok) {
      return { ok: false, error: "insufficient_gold", goldCost };
    }
    paidCharacter = {
      ...args.character,
      gold: payment.gold,
      bankedGold: payment.bankedGold,
    };
    spentGold = goldCost;
  }
  if (lockedLines.length > 0) {
    const materials = mergeDrops(paidCharacter.materials, {});
    for (const [id, amount] of Object.entries(spentCutGems)) {
      const left = (materials[id] ?? 0) - amount;
      if (left > 0) materials[id] = left;
      else delete materials[id];
    }
    paidCharacter = { ...paidCharacter, materials };
  }

  const liberation = instance.liberation
    ? rerollLiberation(catalogItem.slot, instance.liberation, args.rng, lockedLines)
    : rollInitialLiberation(catalogItem.slot, args.rng);
  const item: V2EquipInstance = {
    ...instance,
    bound: true,
    liberation: { ...liberation, revision: currentRevision + 1 },
    liberationRevision: currentRevision + 1,
  };
  const owned = [...equipment.owned];
  owned[itemIndex] = item;

  return {
    ok: true,
    character: {
      ...paidCharacter,
      gold: Math.max(0, Math.floor(Number(paidCharacter.gold) || 0)),
      bankedGold: Math.max(0, Math.floor(Number(paidCharacter.bankedGold) || 0)),
    },
    equipment: { owned, equipped: equipment.equipped },
    item,
    spentGold,
    spentEnchantScrolls,
    spentCutGems,
  };
}
