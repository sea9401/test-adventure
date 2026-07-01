import type { GuildTrainingDrillId } from "@/adventure/data/v2/guildTrainingGround";

export type TrainingDrillView = {
  id: GuildTrainingDrillId;
  title: string;
  desc: string;
  focus: string;
  category: string;
  focusLabel: string;
  categoryLabel: string;
  minBuildingLevel: number;
  minCharacterLevel: number;
  claimed: boolean;
  available: boolean;
  lockedReason: string | null;
  rewardMastery: number;
  rewardGold: number;
};

export type TrainingState = {
  ok?: boolean;
  dayKey?: string;
  hasTrainingGround?: boolean;
  trainingGroundLevel?: number;
  upgrade?: {
    label: string;
    trainingRewardBonusPct: number;
    unlockedDrillCount: number;
  };
  currentJob?: { id: string; name: string; mastery: number | null } | null;
  claimedCount?: number;
  availableCount?: number;
  remainingClaims?: number;
  claimableCount?: number;
  drills?: TrainingDrillView[];
};

export function trainingClaimableCountOf(
  state: TrainingState | null | undefined,
): number | null {
  if (!state?.ok) return null;
  if (typeof state.claimableCount === "number") {
    return Math.max(0, Math.floor(state.claimableCount));
  }
  const availableCount =
    typeof state.availableCount === "number"
      ? Math.max(0, Math.floor(state.availableCount))
      : Array.isArray(state.drills)
        ? state.drills.filter((drill) => drill.available).length
        : null;
  if (availableCount == null) return null;
  if (typeof state.remainingClaims === "number") {
    return Math.min(
      availableCount,
      Math.max(0, Math.floor(state.remainingClaims)),
    );
  }
  return availableCount;
}

export async function fetchGuildTrainingClaimableCount(): Promise<number | null> {
  try {
    const res = await fetch("/api/v2/guild/training-ground");
    const json = (await res.json().catch(() => null)) as TrainingState | null;
    if (!res.ok || !json?.ok) return null;
    return trainingClaimableCountOf(json);
  } catch {
    return null;
  }
}
