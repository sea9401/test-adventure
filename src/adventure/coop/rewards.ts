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
    materials: { starfall_shard: 4 },
    recipes: [],
  },
  silver: {
    materials: { starfall_shard: 8 },
    recipes: [],
  },
  gold: {
    materials: { starfall_shard: 14 },
    recipes: [],
  },
  epic: {
    materials: { starfall_shard: 22 },
    recipes: [],
  },
  legend: {
    materials: { starfall_shard: 30 },
    recipes: [],
    titleId: "forgotten_star_slayer",
    // 장신구 드롭은 옵션 확정 전까지 보류 — legend 는 별빛 조각 + 칭호만. 추후 별도 PR 로 추가.
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
  return {
    materials: reward.materials,
    recipes,
    equipment,
    titleId: reward.titleId,
  };
}
