import { spendGold } from "@/adventure/data/v2/coreLoopConfig";
import { SUMMON_SCROLL_MATERIAL_ID } from "@/adventure/data/v2/coopBosses";
import {
  UNEXPLORED_BOSSES,
  UNEXPLORED_SUMMON_STONE_GOLD_COST,
  UNEXPLORED_SUMMON_STONE_POOL_MATERIAL_COST,
  UNEXPLORED_SUMMON_STONE_SCROLL_COST,
  UNEXPLORED_SUMMON_STONE_TRACE_COST,
  type UnexploredBossId,
} from "@/adventure/data/v2/unexploredBosses";
import { UNEXPLORED_POOL_BY_ID } from "@/adventure/data/v2/unexploredMonsterPools";
import {
  grantUnexploredAchievements,
  unexploredAchievementCandidates,
} from "@/adventure/data/v2/unexploredProgression";
import {
  parseUnexploredSave,
  type UnexploredCraftReceipt,
  type UnexploredSave,
} from "@/adventure/data/v2/unexploredState";

export {
  UNEXPLORED_SUMMON_STONE_GOLD_COST,
  UNEXPLORED_SUMMON_STONE_POOL_MATERIAL_COST,
  UNEXPLORED_SUMMON_STONE_SCROLL_COST,
  UNEXPLORED_SUMMON_STONE_TRACE_COST,
} from "@/adventure/data/v2/unexploredBosses";

export type UnexploredBossCraftCharacter = Record<string, unknown> & {
  gold?: unknown;
  bankedGold?: unknown;
  materials?: unknown;
  unexplored?: unknown;
};

export type UnexploredBossCraftError =
  | "boss_node_required"
  | "insufficient_trace"
  | "insufficient_material"
  | "insufficient_scrolls"
  | "insufficient_gold"
  | "request_conflict";

type CraftedCharacter = UnexploredBossCraftCharacter & {
  gold: number;
  bankedGold: number;
  materials: Record<string, number>;
  unexplored: UnexploredSave;
};

export type UnexploredBossCraftSuccess = {
  ok: true;
  idempotent: boolean;
  character: CraftedCharacter;
  receipt: UnexploredCraftReceipt;
};

function materialInventory(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return Object.fromEntries(
    Object.entries(raw as Record<string, unknown>).flatMap(([id, value]) => {
      const count = Math.max(0, Math.floor(Number(value) || 0));
      return count > 0 ? [[id, count]] : [];
    }),
  );
}

function spendMaterial(
  materials: Record<string, number>,
  materialId: string,
  count: number,
): void {
  const left = (materials[materialId] ?? 0) - count;
  if (left > 0) materials[materialId] = left;
  else delete materials[materialId];
}

export function applyUnexploredBossCraft(
  character: UnexploredBossCraftCharacter,
  bossId: UnexploredBossId,
  requestId: string,
  craftedAt: number,
):
  | UnexploredBossCraftSuccess
  | { ok: false; error: UnexploredBossCraftError } {
  const save = parseUnexploredSave(character.unexplored);
  const existing = save.craftReceipts.find(
    (receipt) => receipt.requestId === requestId,
  );
  if (existing) {
    if (existing.bossId !== bossId) {
      return { ok: false, error: "request_conflict" };
    }
    return {
      ok: true,
      idempotent: true,
      character: {
        ...character,
        gold: Math.max(0, Math.floor(Number(character.gold) || 0)),
        bankedGold: Math.max(
          0,
          Math.floor(Number(character.bankedGold) || 0),
        ),
        materials: materialInventory(character.materials),
        unexplored: save,
      },
      receipt: existing,
    };
  }
  if (!save.selectedNodeIds.includes("deep-boss")) {
    return { ok: false, error: "boss_node_required" };
  }

  const boss = UNEXPLORED_BOSSES[bossId];
  const [poolA, poolB] = boss.pools;
  if (
    (save.traces[poolA] ?? 0) < UNEXPLORED_SUMMON_STONE_TRACE_COST ||
    (save.traces[poolB] ?? 0) < UNEXPLORED_SUMMON_STONE_TRACE_COST
  ) {
    return { ok: false, error: "insufficient_trace" };
  }

  const materials = materialInventory(character.materials);
  const materialA = UNEXPLORED_POOL_BY_ID[poolA].materialId;
  const materialB = UNEXPLORED_POOL_BY_ID[poolB].materialId;
  if (
    (materials[materialA] ?? 0) <
      UNEXPLORED_SUMMON_STONE_POOL_MATERIAL_COST ||
    (materials[materialB] ?? 0) < UNEXPLORED_SUMMON_STONE_POOL_MATERIAL_COST
  ) {
    return { ok: false, error: "insufficient_material" };
  }
  if (
    (materials[SUMMON_SCROLL_MATERIAL_ID] ?? 0) <
    UNEXPLORED_SUMMON_STONE_SCROLL_COST
  ) {
    return { ok: false, error: "insufficient_scrolls" };
  }
  const payment = spendGold(
    Number(character.gold) || 0,
    Number(character.bankedGold) || 0,
    UNEXPLORED_SUMMON_STONE_GOLD_COST,
  );
  if (!payment.ok) return { ok: false, error: "insufficient_gold" };

  spendMaterial(
    materials,
    materialA,
    UNEXPLORED_SUMMON_STONE_POOL_MATERIAL_COST,
  );
  spendMaterial(
    materials,
    materialB,
    UNEXPLORED_SUMMON_STONE_POOL_MATERIAL_COST,
  );
  spendMaterial(
    materials,
    SUMMON_SCROLL_MATERIAL_ID,
    UNEXPLORED_SUMMON_STONE_SCROLL_COST,
  );
  materials[boss.summonMaterialId] =
    (materials[boss.summonMaterialId] ?? 0) + 1;

  const nextTraces = { ...save.traces };
  for (const poolId of boss.pools) {
    const left = (nextTraces[poolId] ?? 0) - UNEXPLORED_SUMMON_STONE_TRACE_COST;
    if (left > 0) nextTraces[poolId] = left;
    else delete nextTraces[poolId];
  }
  const receipt: UnexploredCraftReceipt = {
    requestId,
    bossId,
    craftedAt: Math.max(0, Math.floor(craftedAt)),
  };
  const achievement = grantUnexploredAchievements(
    { ...save, traces: nextTraces },
    unexploredAchievementCandidates({ summonStoneCrafted: true }),
  );
  const unexplored = parseUnexploredSave({
    ...achievement.save,
    craftReceipts: [...achievement.save.craftReceipts, receipt],
  });
  return {
    ok: true,
    idempotent: false,
    character: {
      ...character,
      gold: payment.gold,
      bankedGold: payment.bankedGold,
      materials,
      unexplored,
    },
    receipt,
  };
}
