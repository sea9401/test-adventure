import type { DropResult } from "./dungeonDrops";
import type { UnexploredBaseMonsterId, UnexploredRuntimeMonster } from "./unexploredMonsters";
import type { UnexploredPoolId } from "./unexploredMonsterPools";
import {
  grantUnexploredTrace,
  parseUnexploredTraces,
  type UnexploredTraceState,
} from "./unexploredRewards";
import {
  BOSS_UNEXPLORED_POOL_IDS,
  type UnexploredEffects,
} from "./unexploredTree";
import type { V2EquipmentId } from "./v2Equipment";

export type UnexploredDropTag =
  | "base"
  | "special"
  | "rare"
  | "trace"
  | "gold";

export type UnexploredRewardRule = {
  id: string;
  tag: Exclude<UnexploredDropTag, "trace" | "gold">;
  chance: number;
  amount: number;
};

export type UnexploredRewardPlan = {
  monsterKind: UnexploredRuntimeMonster["kind"];
  poolId: UnexploredPoolId | null;
  rolls: UnexploredRewardRule[];
  commonBonusPct: {
    gold: number;
    material: number;
    equipment: number;
    rare: number;
    quality: number;
  };
  specialMaterialBonusPct: number;
  rareCopyChance: number;
  trace: null | {
    poolId: UnexploredPoolId;
    extraChance: number;
  };
};

export type UnexploredCommonRewards = {
  gold: number;
  drops: DropResult;
  droppedEquipments: V2EquipmentId[];
  droppedUniques: V2EquipmentId[];
};

export type UnexploredRewardGrant = {
  kind: "material" | "equipment" | "unique" | "trace" | "gold";
  id: string;
  amount: number;
  tag: UnexploredDropTag;
  source: "unexplored_monster_drop" | "unexplored_node_bonus";
};

export type UnexploredHuntRewardResult = UnexploredCommonRewards & {
  traces: UnexploredTraceState;
  traceGranted: number;
  grants: UnexploredRewardGrant[];
};

const BASE_DROP_RULES: Record<
  UnexploredBaseMonsterId,
  readonly [
    { id: string; tag: "base"; chance: 0.03; amount: 1 },
    { id: string; tag: "rare"; chance: 0.001; amount: 1 },
  ]
> = {
  unexplored_star_sea_warden: [
    { id: "v2_unexplored_star_sea_shell", tag: "base", chance: 0.03, amount: 1 },
    { id: "v2_unexplored_star_sea_core", tag: "rare", chance: 0.001, amount: 1 },
  ],
  unexplored_comet_tail_stalker: [
    { id: "v2_unexplored_comet_feather", tag: "base", chance: 0.03, amount: 1 },
    { id: "v2_unexplored_faded_star_needle", tag: "rare", chance: 0.001, amount: 1 },
  ],
  unexplored_red_giant_priest: [
    { id: "v2_unexplored_red_stardust", tag: "base", chance: 0.03, amount: 1 },
    { id: "v2_unexplored_red_giant_ritual_tool", tag: "rare", chance: 0.001, amount: 1 },
  ],
  unexplored_void_devourer: [
    { id: "v2_unexplored_void_fang", tag: "base", chance: 0.03, amount: 1 },
    { id: "v2_unexplored_compressed_void_sac", tag: "rare", chance: 0.001, amount: 1 },
  ],
  unexplored_dead_star_observer: [
    { id: "v2_unexplored_observation_lens", tag: "base", chance: 0.03, amount: 1 },
    { id: "v2_unexplored_dead_star_eye", tag: "rare", chance: 0.001, amount: 1 },
  ],
};

const BOSS_POOL_IDS = new Set<UnexploredPoolId>(BOSS_UNEXPLORED_POOL_IDS);

function percentMultiplier(pct: number): number {
  return Math.max(0, 1 + (Number.isFinite(pct) ? pct : 0) / 100);
}

function clampChance(chance: number): number {
  return Math.min(1, Math.max(0, chance));
}

function normalizedRoll(rng: () => number): number {
  return Math.min(1 - Number.EPSILON, Math.max(0, Number(rng()) || 0));
}

function adjustedCopies(
  amount: number,
  bonusPct: number,
  rng: () => number,
): number {
  const count = Math.max(0, Math.floor(amount));
  const multiplier = percentMultiplier(bonusPct);
  const guaranteed = Math.floor(multiplier);
  const fractional = multiplier - guaranteed;
  let result = count * guaranteed;
  for (let index = 0; index < count; index += 1) {
    if (fractional > 0 && normalizedRoll(rng) < fractional) result += 1;
  }
  return result;
}

function addDrop(drops: DropResult, id: string, amount: number): void {
  if (amount <= 0) return;
  drops[id] = (drops[id] ?? 0) + amount;
}

export function buildUnexploredRewardPlan(
  monster: UnexploredRuntimeMonster,
  effects: UnexploredEffects,
): UnexploredRewardPlan {
  const basePoolBonus = monster.kind === "base" ? effects.basePoolRewardPct : 0;
  const poolLootBonus = monster.poolId
    ? (effects.poolLootPctByPool[monster.poolId] ?? 0)
    : 0;
  const specialMaterialBonusPct = monster.poolId
    ? effects.rewardPct.specialMaterial +
      (effects.poolMaterialPctByPool[monster.poolId] ?? 0)
    : effects.rewardPct.specialMaterial;

  let rolls: UnexploredRewardRule[];
  if (monster.kind === "base") {
    const [material, rare] = BASE_DROP_RULES[
      monster.monsterId as UnexploredBaseMonsterId
    ];
    rolls = [
      {
        ...material,
        chance: clampChance(
          material.chance *
            percentMultiplier(effects.rewardPct.baseMaterial + basePoolBonus),
        ),
      },
      {
        ...rare,
        chance: clampChance(
          rare.chance *
            percentMultiplier(effects.rewardPct.rare + basePoolBonus),
        ),
      },
    ];
  } else {
    if (!monster.poolId) throw new Error("Special reward plan requires poolId");
    const materialId = `v2_unexplored_${monster.poolId}_material`;
    rolls = [
      {
        id: materialId,
        tag: "special",
        chance: clampChance(
          (monster.focused ? 0.015 : 0.01) *
            percentMultiplier(specialMaterialBonusPct),
        ),
        amount: 1,
      },
    ];
  }

  const tracePoolId =
    monster.kind === "special" &&
    monster.poolId &&
    effects.traceEnabled &&
    BOSS_POOL_IDS.has(monster.poolId)
      ? monster.poolId
      : null;

  return {
    monsterKind: monster.kind,
    poolId: monster.poolId,
    rolls,
    commonBonusPct: {
      gold: effects.rewardPct.gold + basePoolBonus + poolLootBonus,
      material: effects.rewardPct.baseMaterial + basePoolBonus,
      equipment: effects.rewardPct.equipment + basePoolBonus + poolLootBonus,
      rare: effects.rewardPct.rare + basePoolBonus,
      quality: effects.rewardPct.quality,
    },
    specialMaterialBonusPct,
    rareCopyChance: clampChance(effects.rareCopyChancePct / 100),
    trace: tracePoolId
      ? {
          poolId: tracePoolId,
          extraChance: clampChance(
            Math.min(
              95,
              effects.traceExtraChancePct +
                (effects.traceExtraChancePctByPool[tracePoolId] ?? 0),
            ) / 100,
          ),
        }
      : null,
  };
}

export function rollUnexploredHuntRewards(
  plan: UnexploredRewardPlan,
  rng: () => number,
  input: {
    common?: UnexploredCommonRewards;
    existingTraces?: unknown;
  } = {},
): UnexploredHuntRewardResult {
  const common = input.common ?? {
    gold: 0,
    drops: {},
    droppedEquipments: [],
    droppedUniques: [],
  };
  const grants: UnexploredRewardGrant[] = [];
  const drops: DropResult = {};

  // 몬스터 고유 슬롯을 먼저 굴린다. 희귀 추가 복사는 성공한 희귀 슬롯에만
  // 이어서 판정해 특화 재료와 중복 분류되지 않게 한다.
  for (const rule of plan.rolls) {
    if (normalizedRoll(rng) >= rule.chance) continue;
    addDrop(drops, rule.id, rule.amount);
    grants.push({
      kind: "material",
      id: rule.id,
      amount: rule.amount,
      tag: rule.tag,
      source: "unexplored_monster_drop",
    });
    if (
      rule.tag === "rare" &&
      normalizedRoll(rng) < plan.rareCopyChance
    ) {
      addDrop(drops, rule.id, rule.amount);
      grants.push({
        kind: "material",
        id: rule.id,
        amount: rule.amount,
        tag: "rare",
        source: "unexplored_node_bonus",
      });
    }
  }

  const gold = Math.max(
    0,
    Math.floor(common.gold * percentMultiplier(plan.commonBonusPct.gold)),
  );
  if (gold > common.gold) {
    grants.push({
      kind: "gold",
      id: "gold",
      amount: gold - common.gold,
      tag: "gold",
      source: "unexplored_node_bonus",
    });
  }

  for (const [id, amountRaw] of Object.entries(common.drops)) {
    const amount = adjustedCopies(
      amountRaw ?? 0,
      plan.commonBonusPct.material,
      rng,
    );
    addDrop(drops, id, amount);
    if (amount > (amountRaw ?? 0)) {
      grants.push({
        kind: "material",
        id,
        amount: amount - (amountRaw ?? 0),
        tag: "base",
        source: "unexplored_node_bonus",
      });
    }
  }

  const droppedEquipments: V2EquipmentId[] = [];
  for (const id of common.droppedEquipments) {
    const copies = adjustedCopies(1, plan.commonBonusPct.equipment, rng);
    for (let count = 0; count < copies; count += 1) droppedEquipments.push(id);
    if (copies > 1) {
      grants.push({
        kind: "equipment",
        id,
        amount: copies - 1,
        tag: "base",
        source: "unexplored_node_bonus",
      });
    }
  }

  const droppedUniques: V2EquipmentId[] = [];
  for (const id of common.droppedUniques) {
    const copies = adjustedCopies(1, plan.commonBonusPct.rare, rng);
    for (let count = 0; count < copies; count += 1) droppedUniques.push(id);
    if (copies > 0 && normalizedRoll(rng) < plan.rareCopyChance) {
      droppedUniques.push(id);
      grants.push({
        kind: "unique",
        id,
        amount: 1,
        tag: "rare",
        source: "unexplored_node_bonus",
      });
    }
  }

  let traces = parseUnexploredTraces(input.existingTraces);
  let traceGranted = 0;
  if (plan.trace) {
    const amount = normalizedRoll(rng) < plan.trace.extraChance ? 2 : 1;
    const granted = grantUnexploredTrace(traces, plan.trace.poolId, amount);
    traces = granted.traces;
    traceGranted = granted.granted;
    if (granted.granted > 0) {
      const baseAmount = Math.min(1, granted.granted);
      grants.push({
        kind: "trace",
        id: plan.trace.poolId,
        amount: baseAmount,
        tag: "trace",
        source: "unexplored_monster_drop",
      });
      if (granted.granted > baseAmount) {
        grants.push({
          kind: "trace",
          id: plan.trace.poolId,
          amount: granted.granted - baseAmount,
          tag: "trace",
          source: "unexplored_node_bonus",
        });
      }
    }
  }

  return {
    gold,
    drops,
    droppedEquipments,
    droppedUniques,
    traces,
    traceGranted,
    grants,
  };
}
