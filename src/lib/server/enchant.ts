import "server-only";

// 별빛 무구 마법부여 서버 lib — /api/enchant 의 핵심 로직.
//
// 권위: 서버. 클라는 instanceId + materialId(부여서) 만 보내고, 서버가 inventory.v2 를
// 잠그고 검증·RNG 굴림·적용.
//
// 흐름:
//   1) materialId → affix 도출
//   2) 자루 찾음 + 강화 단계 → 슬롯 capacity (+2/+4/+7 → 1/2/3) 확인
//   3) 기존 enchantSlots 가 capacity 미만이어야 새 슬롯 부여 가능 (재부여 불가 정책 —
//      모든 슬롯이 채워져 있으면 거절). 새 자루에 부여하고 싶으면 자루를 다시 만들어야 함.
//   4) 부여서 1장 소비 + range 안에서 value 정수 롤 → enchantSlots push.
//
// 순수 계산(computeEnchantOutcome)과 DB I/O(applyEnchantAction) 를 분리해 단위 테스트.
// RNG 외부 주입.

import { and, eq } from "drizzle-orm";
import { savesKv } from "@/db/schema";
import { upsertSave, type DbExecutor } from "@/lib/server/savesKv";
import { isEnhanceable } from "@/adventure/character/enhancement";
import {
  ENCHANT_AFFIXES,
  affixFromMaterialId,
  enchantSlotCapacity,
  rollEnchantValue,
  type EnchantSlot,
} from "@/adventure/character/enchant";
import {
  normalizeInstances,
  type EquipmentInstance,
} from "@/adventure/inventory/equipmentInstances";

export class EnchantError extends Error {
  constructor(public code: string) {
    super(code);
    this.name = "EnchantError";
  }
}

type CountMap = Record<string, number>;

export type EnchantComputeInput = {
  materials: CountMap;
  equipmentInstances: EquipmentInstance[];
};

export type EnchantComputeResult = {
  materials: CountMap;
  equipmentInstances: EquipmentInstance[];
  /** 부여된 슬롯 — UI 토스트에 사용. */
  slot: EnchantSlot;
  /** 자루 itemId — UI 토스트에 사용. */
  itemId: EquipmentInstance["itemId"];
};

// 순수 함수 — 부여서 1장 소비 + 자루에 슬롯 1개 부여.
export function computeEnchantOutcome(
  input: EnchantComputeInput,
  instanceId: string,
  materialId: string,
  rng: () => number,
): EnchantComputeResult {
  const affix = affixFromMaterialId(materialId);
  if (!affix) throw new EnchantError("invalid_affix");
  const idx = input.equipmentInstances.findIndex(
    (i) => i.instanceId === instanceId,
  );
  if (idx < 0) throw new EnchantError("instance_not_found");
  const inst = input.equipmentInstances[idx];
  if (!isEnhanceable(inst.itemId)) {
    throw new EnchantError("not_enchantable");
  }
  const cap = enchantSlotCapacity(inst.enhancementLevel);
  if (cap <= 0) throw new EnchantError("no_slot_unlocked");
  const cur = inst.enchantSlots ?? [];
  if (cur.length >= cap) throw new EnchantError("slots_full");
  // 부여서 보유 확인.
  const have = input.materials[materialId] ?? 0;
  if (have < 1) throw new EnchantError("missing_scroll");

  // 부여서 1장 소비.
  const materials: CountMap = { ...input.materials };
  const left = have - 1;
  if (left > 0) materials[materialId] = left;
  else delete materials[materialId];

  // value 정수 롤 — range 안에서.
  const value = rollEnchantValue(ENCHANT_AFFIXES[affix.id], rng);
  const newSlot: EnchantSlot = { affixId: affix.id, value };
  const updated: EquipmentInstance = {
    ...inst,
    enchantSlots: [...cur, newSlot],
  };
  const equipmentInstances = [
    ...input.equipmentInstances.slice(0, idx),
    updated,
    ...input.equipmentInstances.slice(idx + 1),
  ];
  return {
    materials,
    equipmentInstances,
    slot: newSlot,
    itemId: inst.itemId,
  };
}

// ─────────────────────────────────────────────────────────────────────

type SavedInventory = {
  materials?: CountMap;
  equipmentInstances?: unknown;
  [k: string]: unknown;
};

async function readKv<T>(
  tx: DbExecutor,
  userId: string,
  key: string,
): Promise<T | null> {
  const rows = await tx
    .select()
    .from(savesKv)
    .where(and(eq(savesKv.userId, userId), eq(savesKv.key, key)))
    .for("update");
  return (rows[0]?.value as T | undefined) ?? null;
}

export type EnchantOutcome = {
  inventory: SavedInventory;
  slot: EnchantSlot;
  itemId: EquipmentInstance["itemId"];
};

// 트랜잭션 안에서 호출. inventory.v2 잠금 → 검증 → RNG 롤 → 적용.
export async function applyEnchantAction(
  tx: DbExecutor,
  userId: string,
  instanceId: string,
  materialId: string,
): Promise<EnchantOutcome> {
  const inv = (await readKv<SavedInventory>(tx, userId, "inventory.v2")) ?? {};
  const out = computeEnchantOutcome(
    {
      materials: { ...(inv.materials ?? {}) },
      equipmentInstances: normalizeInstances(inv.equipmentInstances),
    },
    instanceId,
    materialId,
    Math.random,
  );
  const newInventory: SavedInventory = {
    ...inv,
    materials: out.materials,
    equipmentInstances: out.equipmentInstances,
  };
  await upsertSave(tx, userId, "inventory.v2", newInventory);
  return {
    inventory: newInventory,
    slot: out.slot,
    itemId: out.itemId,
  };
}
