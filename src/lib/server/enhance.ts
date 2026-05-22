import "server-only";

// 별빛 무구 강화 서버 lib — /api/enhance 의 핵심 로직.
//
// 권위: 서버. 클라는 instanceId + 모드만 보내고, 서버가 inventory.v2 를 잠그고 검증·RNG 굴림.
// 비용·단계 캡은 character/enhancement.ts 의 상수 그대로 — 클라/서버 동일 정책.
//
// 비용·시도 카운터 모두 *시도* 시 항상 처리 (성공/실패 무관) — 자루당 총 7회로 캡.
// 성공: enhanceHistory 에 모드 push + enhancementLevel +1 + remainingAttempts -= 1.
// 실패: remainingAttempts -= 1. enhancementLevel / history 그대로.
// remainingAttempts 가 0 이 되면 더 시도 불가 — 자루 천장이 깎인 상태.
//
// 순수 계산(computeEnhanceOutcome)과 DB I/O(applyEnhanceAction) 를 분리해 단위 테스트.
// RNG 는 외부 주입 — 테스트는 결정적 RNG 로 검증.

import { and, eq } from "drizzle-orm";
import { savesKv } from "@/db/schema";
import { upsertSave, type DbExecutor } from "@/lib/server/savesKv";
import {
  ENHANCE_GOLD_COST,
  ENHANCE_MAX_LEVEL,
  ENHANCE_MODE_SPEC,
  ENHANCE_SHARD_COST,
  isEnhanceable,
  type EnhanceMode,
} from "@/adventure/character/enhancement";
import {
  normalizeInstances,
  type EquipmentInstance,
} from "@/adventure/inventory/equipmentInstances";

const SHARD_MATERIAL = "starfall_shard" as const;

export class EnhanceError extends Error {
  constructor(public code: string) {
    super(code);
    this.name = "EnhanceError";
  }
}

type CountMap = Record<string, number>;

export type EnhanceComputeInput = {
  materials: CountMap;
  equipmentInstances: EquipmentInstance[];
  /** 보유 골드 — 강화 골드 비용 검증용. */
  gold: number;
};

export type EnhanceComputeResult = {
  materials: CountMap;
  equipmentInstances: EquipmentInstance[];
  /** 시도 후 결과 — 성공 시 단계 +1, 실패 시 그대로. */
  toLevel: number;
  /** 시도 후 남은 가능 횟수 — 성공/실패 무관 매 시도 -1. */
  remainingAttempts: number;
  /** 차감된 별빛 조각 양 (시도 시 항상 차감). */
  shardsSpent: number;
  /** 차감된 골드 양 (시도 시 항상 차감). */
  goldSpent: number;
  /** 강화 시도 성공 여부. */
  success: boolean;
  /** 사용된 모드 — 응답 토스트에 사용. */
  mode: EnhanceMode;
};

// 순수 함수 — 인스턴스 +1 강화 *시도*. RNG 결과에 따라 성공/실패 분기.
// 위반 시 EnhanceError throw. rng() 는 0 이상 1 미만 반환.
export function computeEnhanceOutcome(
  input: EnhanceComputeInput,
  instanceId: string,
  mode: EnhanceMode,
  rng: () => number,
): EnhanceComputeResult {
  const idx = input.equipmentInstances.findIndex(
    (i) => i.instanceId === instanceId,
  );
  if (idx < 0) throw new EnhanceError("instance_not_found");
  const inst = input.equipmentInstances[idx];
  if (!isEnhanceable(inst.itemId)) {
    throw new EnhanceError("not_enhanceable");
  }
  if (inst.enhancementLevel >= ENHANCE_MAX_LEVEL) {
    throw new EnhanceError("max_level");
  }
  const spec = ENHANCE_MODE_SPEC[mode];
  if (!spec) throw new EnhanceError("invalid_mode");
  if (inst.remainingAttempts <= 0) {
    throw new EnhanceError("no_attempts");
  }
  const targetLevel = inst.enhancementLevel + 1;
  const cost = ENHANCE_SHARD_COST[targetLevel] ?? 0;
  const have = input.materials[SHARD_MATERIAL] ?? 0;
  if (have < cost) throw new EnhanceError("insufficient_shards");
  // 골드 비용 — 조각과 병행. 시도 시 항상 차감(성공/실패 무관).
  const goldCost = ENHANCE_GOLD_COST[targetLevel] ?? 0;
  if (input.gold < goldCost) throw new EnhanceError("insufficient_gold");

  // 비용 차감 (시도 시 항상).
  const materials: CountMap = { ...input.materials };
  const left = have - cost;
  if (left > 0) materials[SHARD_MATERIAL] = left;
  else delete materials[SHARD_MATERIAL];

  // RNG — 0~1 < successPct/100 이면 성공.
  const success = rng() < spec.successPct / 100;

  // 성공/실패 무관 매 시도 -1 — 자루당 총 시도 7회 캡.
  const nextRemainingAttempts = inst.remainingAttempts - 1;
  let updated: EquipmentInstance;
  if (success) {
    const nextHistory: EnhanceMode[] = [
      ...(inst.enhanceHistory ?? new Array<EnhanceMode>(inst.enhancementLevel).fill("safe")),
      mode,
    ];
    updated = {
      ...inst,
      enhancementLevel: targetLevel,
      enhanceHistory: nextHistory,
      remainingAttempts: nextRemainingAttempts,
    };
  } else {
    updated = {
      ...inst,
      remainingAttempts: nextRemainingAttempts,
    };
  }
  const equipmentInstances = [
    ...input.equipmentInstances.slice(0, idx),
    updated,
    ...input.equipmentInstances.slice(idx + 1),
  ];
  return {
    materials,
    equipmentInstances,
    toLevel: updated.enhancementLevel,
    remainingAttempts: updated.remainingAttempts,
    shardsSpent: cost,
    goldSpent: goldCost,
    success,
    mode,
  };
}

// ─────────────────────────────────────────────────────────────────────

type SavedInventory = {
  materials?: CountMap;
  equipmentInstances?: unknown;
  [k: string]: unknown;
};

type SavedCharacter = {
  gold?: number;
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

export type EnhanceOutcome = {
  inventory: SavedInventory;
  /** 골드 차감 반영된 character.v2 — 클라가 잔액을 갱신할 수 있게 반환. */
  character: SavedCharacter;
  toLevel: number;
  remainingAttempts: number;
  shardsSpent: number;
  goldSpent: number;
  success: boolean;
  mode: EnhanceMode;
};

// 트랜잭션 안에서 호출. character.v2 → inventory.v2 잠금(shop 등과 일관된 순서로 데드락 방지)
// → 검증(조각+골드) → RNG 굴림 → 적용. 호출부 route 의 tx 를 그대로 받아 nested transaction 안 만듦.
export async function applyEnhanceAction(
  tx: DbExecutor,
  userId: string,
  instanceId: string,
  mode: EnhanceMode,
): Promise<EnhanceOutcome> {
  const character =
    (await readKv<SavedCharacter>(tx, userId, "character.v2")) ?? {};
  const currentGold = typeof character.gold === "number" ? character.gold : 0;
  const inv = (await readKv<SavedInventory>(tx, userId, "inventory.v2")) ?? {};
  const out = computeEnhanceOutcome(
    {
      materials: { ...(inv.materials ?? {}) },
      equipmentInstances: normalizeInstances(inv.equipmentInstances),
      gold: currentGold,
    },
    instanceId,
    mode,
    Math.random,
  );
  const newInventory: SavedInventory = {
    ...inv,
    materials: out.materials,
    equipmentInstances: out.equipmentInstances,
  };
  await upsertSave(tx, userId, "inventory.v2", newInventory);
  let newCharacter = character;
  if (out.goldSpent > 0) {
    newCharacter = { ...character, gold: Math.max(0, currentGold - out.goldSpent) };
    await upsertSave(tx, userId, "character.v2", newCharacter);
  }
  return {
    inventory: newInventory,
    character: newCharacter,
    toLevel: out.toLevel,
    remainingAttempts: out.remainingAttempts,
    shardsSpent: out.shardsSpent,
    goldSpent: out.goldSpent,
    success: out.success,
    mode: out.mode,
  };
}
