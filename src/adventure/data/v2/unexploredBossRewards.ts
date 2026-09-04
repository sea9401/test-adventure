import {
  UNEXPLORED_BOSSES,
  UNEXPLORED_BOSS_CORE_MATERIAL,
  type UnexploredBossId,
} from "./unexploredBosses";
import { UNEXPLORED_POOL_BY_ID } from "./unexploredMonsterPools";
import type { V2EquipmentId } from "./v2Equipment";

export type UnexploredBossReward = {
  bossCore: 1;
  bossCoreMaterialId: typeof UNEXPLORED_BOSS_CORE_MATERIAL.id;
  poolMaterialId: string;
  poolMaterialCount: 1;
  uniqueIds: V2EquipmentId[];
};

/** 세 고유를 앞선 성공 여부와 무관하게 항상 세 번 독립 굴림한다. */
export function rollUnexploredBossUniques(
  bossId: UnexploredBossId,
  rng: () => number,
): V2EquipmentId[] {
  const awarded: V2EquipmentId[] = [];
  for (const drop of UNEXPLORED_BOSSES[bossId].uniqueDrops) {
    if (rng() * 100 < drop.chancePct) awarded.push(drop.equipmentId);
  }
  return awarded;
}

export function rollUnexploredBossReward(
  bossId: UnexploredBossId,
  uniqueRng: () => number,
  poolRng: () => number,
): UnexploredBossReward {
  const pools = UNEXPLORED_BOSSES[bossId].pools;
  const uniqueIds = rollUnexploredBossUniques(bossId, uniqueRng);
  const poolIndex = Math.min(
    pools.length - 1,
    Math.max(0, Math.floor((Number(poolRng()) || 0) * pools.length)),
  );
  return {
    bossCore: 1,
    bossCoreMaterialId: UNEXPLORED_BOSS_CORE_MATERIAL.id,
    poolMaterialId: UNEXPLORED_POOL_BY_ID[pools[poolIndex]].materialId,
    poolMaterialCount: 1,
    uniqueIds,
  };
}
