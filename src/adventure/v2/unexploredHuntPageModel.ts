import type { UnexploredHuntSummary } from "./useDungeonHunt";
import type { UnexploredClientSnapshot } from "./unexploredTreeModel";

export function unexploredSnapshotToHuntSummary(
  snapshot: UnexploredClientSnapshot,
): UnexploredHuntSummary {
  const reward = snapshot.rewardSummary;
  return {
    difficulty: snapshot.difficulty,
    encounterShares: snapshot.encounterShares,
    rewardPct: {
      gold: reward.gold,
      baseMaterial: reward.baseMaterial,
      equipment: reward.equipment,
      quality: reward.quality,
      specialMaterial: reward.specialMaterial,
      rare: reward.rare,
    },
    rareCopyChancePct: reward.rareCopyChancePct,
    traceEnabled: snapshot.effects?.traceEnabled === true,
    traceExtraChancePct: reward.traceExtraChancePct,
  };
}
