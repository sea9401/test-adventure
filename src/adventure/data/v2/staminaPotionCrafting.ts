export const STAMINA_SHARD_MATERIAL_ID = "v2_stamina_shard";

// 승리당 드롭 확률(%). 평균 250승당 1개, 6개 조합 기준 1,500승당 회복약 1개다.
export const STAMINA_SHARD_DROP_PCT = 0.4;
export const STAMINA_SHARD_COMBINE_COST = 6;

export const STAMINA_SHARD_MATERIAL = {
  [STAMINA_SHARD_MATERIAL_ID]: {
    id: STAMINA_SHARD_MATERIAL_ID,
    name: "활력의 파편",
    description:
      "쓰러진 마물에게서 드물게 남는 응축된 활력. 6개를 모아 스태미나 회복약으로 조합한다.",
  },
} as const;

/** 모든 일반 사냥 승리에 적용되는 독립 글로벌 드롭. 희귀 지도 배율은 적용하지 않는다. */
export function rollStaminaShardDrop(rng: () => number): number {
  return rng() * 100 < STAMINA_SHARD_DROP_PCT ? 1 : 0;
}
