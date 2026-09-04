import type { CoopBossKindId } from "@/adventure/data/v2/coopBosses";
import type { GuildRaidReward } from "@/adventure/data/v2/guildRaid";
import type { ReplayPayload } from "@/adventure/data/v2/replayPayload";

export type GuildRaidState = {
  ok: true;
  event: {
    id: string;
    bossKind: CoopBossKindId;
    status: string;
    phase: "active" | "claim" | "expired";
    stage: number;
    hp: number;
    maxHp: number;
    startsAt: number;
    endsAt: number;
    settledAt: number | null;
  };
  my: {
    lockedGuildId: number | null;
    damage: number;
    attackCount: number;
    dailyAttackCount: number;
    dailyAttackLimit: number;
    remainingAttacks: number;
    eligible: boolean;
    rewardClaimedAt: number | null;
    reward: GuildRaidReward | null;
    canClaim: boolean;
  };
  guild: {
    id: number;
    name: string;
    emblem: string | null;
    damage: number;
    rank: number | null;
  };
  members: {
    userId: string;
    name: string;
    damage: number;
    attackCount: number;
    eligible: boolean;
  }[];
  leaderboard: {
    guildId: number;
    guildName: string;
    guildEmblem: string | null;
    damage: number;
    rank: number;
  }[];
  leaderboardPagination: GuildRaidPagination;
  recentAttacks: {
    id: number;
    name: string;
    guildId: number;
    damageDealt: number;
    stagesCleared: number;
    at: number;
  }[];
  recentPagination: GuildRaidPagination;
};

export type GuildRaidPagination = {
  page: number;
  pageSize: number;
  totalPages: number;
  total: number;
};

export type GuildRaidAttackResult = {
  ok: true;
  alreadyCommitted: boolean;
  attackId: number;
  damageDealt: number;
  damageTaken: number;
  diedEarly: boolean;
  replay: ReplayPayload;
  stage: number;
  hp: number;
  maxHp: number;
  stagesCleared: number;
  myDamage: number;
  myAttackCount: number;
  dailyAttackCount: number;
};

export type GuildRaidPracticeResult = {
  ok: true;
  practice: true;
  bossKind: CoopBossKindId;
  playerName: string;
  damageDealt: number;
  damageTaken: number;
  diedEarly: boolean;
  turns: number;
  replay: ReplayPayload;
};

export type GuildRaidErrorResponse = { ok?: false; error?: string };
