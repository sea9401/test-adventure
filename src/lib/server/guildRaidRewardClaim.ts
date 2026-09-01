import "server-only";

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  guildRaidGuildScores,
  guildRaidParticipants,
} from "@/db/schema";
import {
  guildRaidPhase,
  guildRaidRewardForRank,
  type GuildRaidReward,
} from "@/adventure/data/v2/guildRaid";
import { MASTERY_CERTIFICATE_KEY } from "@/adventure/data/v2/masteryTower";
import { ensureCurrentGuildRaid } from "@/lib/server/guildRaidLifecycle";
import {
  lockSavesForUpdate,
  upsertSaves,
} from "@/lib/server/savesKv";

export type GuildRaidRewardClaimError =
  | "claim_not_open"
  | "reward_expired"
  | "not_settled"
  | "not_eligible"
  | "already_claimed";

export function resolveGuildRaidRewardClaim(input: {
  now: Date;
  event: { startsAt: Date; endsAt: Date; status: string };
  participant: {
    eligibleAtSettlement: boolean | null;
    rewardClaimedAt: Date | null;
  } | null;
  finalRank: number | null;
}):
  | { ok: false; error: GuildRaidRewardClaimError }
  | { ok: true; rank: number; reward: GuildRaidReward } {
  const phase = guildRaidPhase(input.now, input.event);
  if (phase === "active") return { ok: false, error: "claim_not_open" };
  if (phase === "expired") return { ok: false, error: "reward_expired" };
  if (input.event.status !== "settled" || input.finalRank == null) {
    return { ok: false, error: "not_settled" };
  }
  if (!input.participant?.eligibleAtSettlement) {
    return { ok: false, error: "not_eligible" };
  }
  if (input.participant.rewardClaimedAt) {
    return { ok: false, error: "already_claimed" };
  }
  return {
    ok: true,
    rank: input.finalRank,
    reward: guildRaidRewardForRank(input.finalRank),
  };
}

export type GuildRaidRewardClaimOutcome =
  | { ok: false; error: GuildRaidRewardClaimError }
  | {
      ok: true;
      rank: number;
      reward: GuildRaidReward;
      gold: number;
      masteryCertificates: number;
      claimedAt: number;
    };

export async function claimGuildRaidReward({
  userId,
  now = new Date(),
}: {
  userId: string;
  now?: Date;
}): Promise<GuildRaidRewardClaimOutcome> {
  const event = await ensureCurrentGuildRaid(now);
  return db.transaction(async (tx) => {
    const [participant] = await tx
      .select()
      .from(guildRaidParticipants)
      .where(
        and(
          eq(guildRaidParticipants.eventId, event.id),
          eq(guildRaidParticipants.userId, userId),
        ),
      )
      .for("update");
    const [score] = participant
      ? await tx
          .select({ finalRank: guildRaidGuildScores.finalRank })
          .from(guildRaidGuildScores)
          .where(
            and(
              eq(guildRaidGuildScores.eventId, event.id),
              eq(guildRaidGuildScores.guildId, participant.guildId),
            ),
          )
          .limit(1)
      : [];
    const decision = resolveGuildRaidRewardClaim({
      now,
      event,
      participant: participant
        ? {
            eligibleAtSettlement: participant.eligibleAtSettlement,
            rewardClaimedAt: participant.rewardClaimedAt,
          }
        : null,
      finalRank: score?.finalRank ?? null,
    });
    if (!decision.ok) return decision;

    const saves = await lockSavesForUpdate(tx, userId, {
      "character.v2": {} as Record<string, unknown>,
      "inventory.v2": {} as Record<string, unknown>,
    });
    const character = saves["character.v2"];
    const inventory = saves["inventory.v2"];
    const gold =
      Math.max(0, Math.floor(Number(character.gold) || 0)) +
      decision.reward.gold;
    const masteryCertificates =
      Math.max(
        0,
        Math.floor(Number(inventory[MASTERY_CERTIFICATE_KEY]) || 0),
      ) + decision.reward.masteryCertificates;
    await upsertSaves(tx, userId, {
      "character.v2": { ...character, gold },
      "inventory.v2": {
        ...inventory,
        [MASTERY_CERTIFICATE_KEY]: masteryCertificates,
      },
    });
    await tx
      .update(guildRaidParticipants)
      .set({ rewardClaimedAt: now, updatedAt: now })
      .where(
        and(
          eq(guildRaidParticipants.eventId, event.id),
          eq(guildRaidParticipants.userId, userId),
        ),
      );
    return {
      ...decision,
      gold,
      masteryCertificates,
      claimedAt: now.getTime(),
    };
  });
}
