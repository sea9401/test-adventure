import {
  UNEXPLORED_BOSSES,
  UNEXPLORED_BOSS_CORE_MATERIAL,
  type UnexploredBossId,
} from "./unexploredBosses";
import { UNEXPLORED_POOL_BY_ID } from "./unexploredMonsterPools";
import {
  UNEXPLORED_BOSS_JACKPOT_BASE_PCT,
  riskBossCoreCount,
  riskJackpotChancePct,
} from "./unexploredBossRisk";
import type { V2EquipmentId } from "./v2Equipment";

export type UnexploredBossReward = {
  /** 우두머리 핵 수. 위험도마다 1개씩 늘어난다(unexploredBossRisk.ts). */
  bossCore: number;
  bossCoreMaterialId: typeof UNEXPLORED_BOSS_CORE_MATERIAL.id;
  poolMaterialId: string;
  poolMaterialCount: 1;
  uniqueIds: V2EquipmentId[];
};

/**
 * 세 고유를 앞선 성공 여부와 무관하게 항상 세 번 독립 굴림한다.
 * 위험도가 오르면 가장 드문 고유(기본 0.5%)의 확률만 오른다.
 */
export function rollUnexploredBossUniques(
  bossId: UnexploredBossId,
  rng: () => number,
  riskTier: number = 0,
): V2EquipmentId[] {
  const awarded: V2EquipmentId[] = [];
  for (const drop of UNEXPLORED_BOSSES[bossId].uniqueDrops) {
    const chancePct = drop.chancePct === UNEXPLORED_BOSS_JACKPOT_BASE_PCT
      ? riskJackpotChancePct(riskTier)
      : drop.chancePct;
    if (rng() * 100 < chancePct) awarded.push(drop.equipmentId);
  }
  return awarded;
}

export function rollUnexploredBossReward(
  bossId: UnexploredBossId,
  uniqueRng: () => number,
  poolRng: () => number,
  riskTier: number = 0,
): UnexploredBossReward {
  const pools = UNEXPLORED_BOSSES[bossId].pools;
  const uniqueIds = rollUnexploredBossUniques(bossId, uniqueRng, riskTier);
  const poolIndex = Math.min(
    pools.length - 1,
    Math.max(0, Math.floor((Number(poolRng()) || 0) * pools.length)),
  );
  return {
    bossCore: riskBossCoreCount(riskTier),
    bossCoreMaterialId: UNEXPLORED_BOSS_CORE_MATERIAL.id,
    poolMaterialId: UNEXPLORED_POOL_BY_ID[pools[poolIndex]].materialId,
    poolMaterialCount: 1,
    uniqueIds,
  };
}
