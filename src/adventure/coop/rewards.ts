// 2026-05-19: 스토리 7종(운봉의 거인 / 별을 지키는 자 / 천공인의 왕 / 창공의 주재 /
// 3 별빛 잔영) 솔로 region.boss 로 전환. 그쪽 legend unique·칭호는 monster.drops /
// onDefeatTitleId 로 마이그레이션. 이 파일은 dragon_nest 월드 보스 한 종만 남음.
//
// RNG 정책:
//   computeCoopReward 는 누적 보상 테이블만 펼쳐 반환한다(클라/서버 공용 데이터).
//   resolveCoopReward 가 서버에서 deterministic seed (sessionId+userId 해시) 로
//   recipeOneOf 추첨·recipeRolls/equipRolls 굴림을 결정해 최종 ResolvedCoopReward 를
//   확정한다. 클라는 받은 결과를 그대로 적용 — favorable seed replay 가 불가.

import type { MaterialId } from "@/adventure/data/materials";
import type { ItemId } from "@/adventure/data/items";
import type { CoopRewardTier } from "./data";
import type { EquipmentInstance } from "@/adventure/inventory/equipmentInstances";
import {
  STARLIT_RING_ITEM_ID,
  rollStarlitRingBonus,
} from "@/adventure/inventory/starlitRing";

export type CoopReward = {
  materials: Partial<Record<MaterialId, number>>;
  /** 학습 시도할 제작서 — knowsRecipe 로 이미 알고 있으면 무시. */
  recipes: string[];
  /** recipe_one_of 풀 — 하나만 무작위 추첨해 학습 시도. */
  recipeOneOf?: string[];
  /** 추가 굴림: { recipeId, chance } — chance 비율로 학습 시도. */
  recipeRolls?: { recipeId: string; chance: number }[];
  /** 장비 드랍 굴림: { itemId, chance } — chance 비율로 그 장비를 인벤토리에 추가. legend 티어의 물욕 드랍용. */
  equipRolls?: { itemId: ItemId; chance: number }[];
  /**
   * 별빛 고리(롤 인스턴스) 드랍 — chance 비율로 옵션이 랜덤 롤된 인스턴스 1개 지급.
   * 롤·instanceId 모두 seed 에서 결정(retry 시 dedup 안전). 잊힌 봉인 legend 전용.
   */
  ringRoll?: { chance: number };
  /** 부여할 칭호. */
  titleId?: string;
};

// 월드 보스 — 태고의 노룡. 일주일 단위 이벤트라 일반 coop 보다 보상 분량 두툼.
// gold/epic 에서 equipRolls 로 무구 4종을 직접 굴리고, legend 에 한해 정점 액세서리
// (태고의 비늘관) 가 5% 로 떨어진다 (창공의 옥새 1% 보다 후함 — 7일 한정).
const PRIMORDIAL_DRAGON_TIER_REWARDS: Record<CoopRewardTier, CoopReward> = {
  bronze: {
    materials: { dragonscale_shard: 3 },
    recipes: [],
  },
  silver: {
    materials: { bone_rune_steel: 1, scale_dust: 5 },
    recipes: [],
  },
  gold: {
    materials: { dragonscale_shard: 3, bone_rune_steel: 2 },
    recipes: [],
    // gold 도달자에게 3종 무구 중 한 자루씩 굴림 — 평균 ~50% 확률로 한 자루 획득.
    equipRolls: [
      { itemId: "primordial_blade", chance: 0.2 },
      { itemId: "primordial_aegis", chance: 0.2 },
      { itemId: "primordial_helm", chance: 0.2 },
    ],
  },
  epic: {
    materials: { bone_rune_steel: 2 },
    recipes: [],
    // epic 까지 깎은 자에게 망토 직접 굴림 — 가볍게 15%.
    equipRolls: [{ itemId: "primordial_cloak", chance: 0.15 }],
  },
  legend: {
    materials: {},
    recipes: [],
    titleId: "primordial_slayer",
    // 만렙 정점 물욕 드랍 — 창공의 옥새(1%) 위. 7일 한 번 시도 가능하니 5%.
    equipRolls: [{ itemId: "primordial_regalia", chance: 0.05 }],
  },
};

// 6막 「별을 잊은 것」 — 잊힌 봉인 월드 레이드. T6 별빛 장신구(잊힌 별의 유물) 획득처.
// 누적 데미지 티어로 별빛 조각을 쌓고, legend 에 한해 T6 장신구가 5% 로 떨어진다.
// 무구류 직접 굴림은 두지 않는다 — 이 보스는 "장신구 획득처" 컨셉. (수치는 튜닝 포인트.)
const FORGOTTEN_STAR_TIER_REWARDS: Record<CoopRewardTier, CoopReward> = {
  bronze: {
    materials: { starfall_shard: 8 },
    recipes: [],
  },
  silver: {
    materials: { starfall_shard: 16 },
    recipes: [],
  },
  gold: {
    materials: { starfall_shard: 28 },
    recipes: [],
    // T6 별빛 고리(랜덤 롤 장신구) — gold 부터 드랍, 티어 오를수록 드랍률↑(덮어쓰기).
    // 옵션이 인스턴스마다 롤(2/5 × 1~20)이라 진짜 그라인드는 "롤"이지 드랍이 아님 → 드랍은 후하게.
    ringRoll: { chance: 0.15 },
  },
  epic: {
    materials: { starfall_shard: 44 },
    recipes: [],
    ringRoll: { chance: 0.2 },
  },
  legend: {
    materials: { starfall_shard: 60 },
    recipes: [],
    titleId: "forgotten_star_slayer",
    ringRoll: { chance: 0.25 },
  },
};

const TIER_TABLES: Record<string, Record<CoopRewardTier, CoopReward>> = {
  "태고의 노룡": PRIMORDIAL_DRAGON_TIER_REWARDS,
  "별을 잊은 것": FORGOTTEN_STAR_TIER_REWARDS,
};

const TIER_ORDER: CoopRewardTier[] = ["bronze", "silver", "gold", "epic", "legend"];

/**
 * 도달 티어까지의 모든 누적 보상 합산.
 * gold 도달이면 bronze + silver + gold 의 보상이 합쳐진다.
 */
export function computeCoopReward(
  bossName: string,
  tier: CoopRewardTier,
): CoopReward {
  const table = TIER_TABLES[bossName];
  if (!table) return { materials: {}, recipes: [] };

  const out: CoopReward = { materials: {}, recipes: [] };
  for (const t of TIER_ORDER) {
    const r = table[t];
    for (const [k, v] of Object.entries(r.materials)) {
      const id = k as MaterialId;
      out.materials[id] = (out.materials[id] ?? 0) + (v ?? 0);
    }
    out.recipes.push(...r.recipes);
    if (r.recipeOneOf) {
      out.recipeOneOf = [...(out.recipeOneOf ?? []), ...r.recipeOneOf];
    }
    if (r.recipeRolls) {
      out.recipeRolls = [...(out.recipeRolls ?? []), ...r.recipeRolls];
    }
    if (r.equipRolls) {
      out.equipRolls = [...(out.equipRolls ?? []), ...r.equipRolls];
    }
    if (r.titleId) out.titleId = r.titleId;
    // ringRoll 은 누적이 아니라 "도달한 가장 높은 티어 값으로 덮어쓰기" (titleId 와 동일).
    // → 티어가 오를수록 드랍률이 갈아끼워져, 한 번만 굴리되 높은 티어일수록 확률↑.
    // (이 줄이 없으면 ringRoll 이 resolve 까지 전달되지 않아 별빛 고리가 영영 안 떨어진다.)
    if (r.ringRoll) out.ringRoll = r.ringRoll;
    if (t === tier) break;
  }
  return out;
}

// ── 서버 측 RNG 결정 ─────────────────────────────────────────────────────────

/** 최종 보상 — 모든 RNG 가 펼쳐진 후 클라가 그대로 적용할 수 있는 형태. */
export type ResolvedCoopReward = {
  materials: Partial<Record<MaterialId, number>>;
  /** recipeOneOf picked + recipeRolls 통과 + 확정 recipes 모두 합산. */
  recipes: string[];
  /** equipRolls 에서 통과한 itemId 들. */
  equipment: ItemId[];
  /** ringRoll 통과 시 생성된 롤 인스턴스(별빛 고리). 인벤토리 equipmentInstances 에 push. */
  equipmentInstances: EquipmentInstance[];
  titleId?: string;
};

// mulberry32 — 32bit seed 결정적 PRNG. 같은 seed → 같은 sequence.
function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  };
}

function fnv1a(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** (sessionId, userId) 한 쌍에서 결정되는 seed. retry 시 같은 결과를 위해 deterministic. */
export function coopRewardSeed(sessionId: string, userId: string): number {
  return fnv1a(`${sessionId}:${userId}`);
}

/** 누적 보상의 RNG 항목들을 seed 로 풀어 ResolvedCoopReward 로 확정. */
export function resolveCoopReward(
  reward: CoopReward,
  seed: number,
): ResolvedCoopReward {
  const rng = mulberry32(seed);
  const recipes: string[] = [...reward.recipes];
  if (reward.recipeOneOf && reward.recipeOneOf.length > 0) {
    const idx = Math.floor(rng() * reward.recipeOneOf.length);
    recipes.push(reward.recipeOneOf[idx]!);
  }
  if (reward.recipeRolls) {
    for (const roll of reward.recipeRolls) {
      if (rng() < roll.chance) recipes.push(roll.recipeId);
    }
  }
  const equipment: ItemId[] = [];
  if (reward.equipRolls) {
    for (const roll of reward.equipRolls) {
      if (rng() < roll.chance) equipment.push(roll.itemId);
    }
  }
  // 별빛 고리 — chance 통과 시 옵션 롤된 인스턴스 1개. instanceId 도 seed 에서 결정해
  // retry 시 같은 instanceId → 인벤 dedup 으로 중복 지급 방지(claim 측 + addInstance 둘 다).
  const equipmentInstances: EquipmentInstance[] = [];
  if (reward.ringRoll && rng() < reward.ringRoll.chance) {
    equipmentInstances.push({
      instanceId: `starlit-ring-${(seed >>> 0).toString(36)}`,
      itemId: STARLIT_RING_ITEM_ID,
      enhancementLevel: 0,
      remainingAttempts: 0,
      rolledBonus: rollStarlitRingBonus(rng),
    });
  }
  return {
    materials: reward.materials,
    recipes,
    equipment,
    equipmentInstances,
    titleId: reward.titleId,
  };
}
