import {
  pickUnexploredMonster,
  unexploredEncounterShares,
  type UnexploredEncounterShare,
} from "@/adventure/data/v2/unexploredEncounters";
import {
  UNEXPLORED_BASE_MONSTER_IDS,
  unexploredMonsterAtDifficulty,
  type UnexploredBaseMonsterId,
  type UnexploredRuntimeMonster,
} from "@/adventure/data/v2/unexploredMonsters";
import {
  EXPLORATION_XP_PER_HUNT_WIN,
  grantExplorationXp,
  grantUnexploredAchievements,
  unexploredAchievementCandidates,
} from "@/adventure/data/v2/unexploredProgression";
import { parseUnexploredTraces } from "@/adventure/data/v2/unexploredRewards";
import {
  canChangeUnexploredNodes,
  parseUnexploredSave,
  type UnexploredSave,
} from "@/adventure/data/v2/unexploredState";
import {
  deriveUnexploredEffects,
  type UnexploredEffects,
} from "@/adventure/data/v2/unexploredTree";
import {
  V2_EQUIPMENT,
  type V2EquipInstance,
  type V2EquipmentId,
} from "@/adventure/data/v2/v2Equipment";
import {
  mintEquipInstance,
  mintRolledEquipInstance,
} from "@/adventure/data/v2/v2EquipMint";
import { rollItemStatsBest } from "@/adventure/data/v2/v2EquipVariance";

export type UnexploredHuntCharacter = {
  level?: number;
  unexplored?: unknown;
};

export function validateDungeonHuntMode(
  raw: unknown,
  unexploredEnabled: boolean,
):
  | { ok: true; mode: "normal" | "unexplored" }
  | { ok: false; error: "bad_intent" | "not_found"; status: 400 | 404 } {
  const mode = raw == null || raw === "normal"
    ? "normal"
    : raw === "unexplored"
      ? "unexplored"
      : null;
  if (!mode) return { ok: false, error: "bad_intent", status: 400 };
  if (mode === "unexplored" && !unexploredEnabled) {
    return { ok: false, error: "not_found", status: 404 };
  }
  return { ok: true, mode };
}

export type PreparedUnexploredHunt = {
  ok: true;
  difficulty: number;
  save: UnexploredSave;
  effects: UnexploredEffects;
  encounterShares: UnexploredEncounterShare[];
  runtime: UnexploredRuntimeMonster;
};

export type UnexploredHuntPreparation =
  | PreparedUnexploredHunt
  | { ok: false; error: "level_required" | "start_required" | "empty_encounter" };

export function prepareUnexploredHunt(
  character: UnexploredHuntCharacter,
  rng: () => number,
): UnexploredHuntPreparation {
  const level = Math.max(1, Math.floor(Number(character.level) || 1));
  if (!canChangeUnexploredNodes(level)) {
    return { ok: false, error: "level_required" };
  }
  const save = parseUnexploredSave(character.unexplored);
  if (!save.selectedNodeIds.includes("start")) {
    return { ok: false, error: "start_required" };
  }

  const effects = deriveUnexploredEffects(save.selectedNodeIds);
  const encounterShares = unexploredEncounterShares(
    effects.encounterSelections,
    { baseMinShare: effects.baseMinShare },
  );
  const pick = pickUnexploredMonster({
    baseMonsterIds: UNEXPLORED_BASE_MONSTER_IDS,
    shares: encounterShares,
    groupRng: rng,
    monsterRng: rng,
  });
  if (!pick) return { ok: false, error: "empty_encounter" };

  const runtime =
    pick.source === "base"
      ? unexploredMonsterAtDifficulty({
          source: "base",
          poolId: null,
          monsterId: pick.monsterId as UnexploredBaseMonsterId,
          focused: false,
          difficulty: effects.difficulty,
        })
      : unexploredMonsterAtDifficulty({
          source: "special",
          poolId: pick.poolId,
          monsterId: pick.monsterId,
          focused: effects.focusedPoolIds.includes(pick.poolId),
          difficulty: effects.difficulty,
        });

  return {
    ok: true,
    difficulty: effects.difficulty,
    save,
    effects,
    encounterShares,
    runtime,
  };
}

export function applyUnexploredHuntProgress(params: {
  rawSave: unknown;
  won: boolean;
  specialMonsterKilled: boolean;
  traces: unknown;
}): {
  save: UnexploredSave;
  xpGained: number;
  pointsGained: number;
} {
  const before = parseUnexploredSave(params.rawSave);
  if (!params.won) {
    return { save: before, xpGained: 0, pointsGained: 0 };
  }
  const xp = grantExplorationXp(before, EXPLORATION_XP_PER_HUNT_WIN);
  const withTraces: UnexploredSave = {
    ...xp.save,
    traces: parseUnexploredTraces(params.traces),
  };
  const achievements = grantUnexploredAchievements(
    withTraces,
    unexploredAchievementCandidates({
      unexploredHuntWon: true,
      specialMonsterKilled: params.specialMonsterKilled,
    }),
  );
  return {
    save: achievements.save,
    xpGained: xp.acceptedXp,
    pointsGained: xp.pointsGained,
  };
}

export function mintUnexploredRewardEquipment(
  id: V2EquipmentId,
  qualityBonusPct: number,
  rng: () => number = Math.random,
  minimumQualityPct: number = 0,
): V2EquipInstance {
  const chance = Math.min(
    1,
    Math.max(0, (Number(qualityBonusPct) || 0) / 100),
  );
  if (
    chance <= 0 ||
    Math.min(1 - Number.EPSILON, Math.max(0, rng())) >= chance
  ) {
    return mintRolledEquipInstance(id, rng, { minimumQualityPct });
  }
  return mintEquipInstance(
    id,
    rollItemStatsBest(V2_EQUIPMENT[id], rng, 2, { minimumQualityPct }),
  );
}
