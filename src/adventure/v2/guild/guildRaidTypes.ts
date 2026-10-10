import type { GuildRaidReward } from "@/adventure/data/v2/guildRaid";
import type { GuildRaidBossId } from "@/adventure/data/v2/guildRaidBosses";
import type { ReplayPayload } from "@/adventure/data/v2/replayPayload";

export type GuildRaidBossSummary = {
  id: GuildRaidBossId;
  name: string;
  desc: string;
  image: string;
  traits: string[];
  rewardMultiplier: 1 | 2;
  bonusMinGuildDamage: number | null;
};

export type GuildRaidState = {
  ok: true;
  event: {
    id: string;
    /** 우리 길드가 고른 보스. 고르기 전이면 null이고 단계·체력도 null. */
    bossKind: GuildRaidBossId | null;
    status: string;
    phase: "active" | "claim" | "expired";
    stage: number | null;
    hp: number | null;
    maxHp: number | null;
    startsAt: number;
    endsAt: number;
    settledAt: number | null;
  };
  selection: { bossId: GuildRaidBossId; selectedAt: number } | null;
  /** 길드장·관리자이고 전투 기간이며 아직 고르지 않았을 때만 true. */
  canSelect: boolean;
  bosses: GuildRaidBossSummary[];
  /** 지금 보여 주는 순위표의 보스. */
  board: GuildRaidBossId;
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
    /** 2배 보상 기준이 있는 보스를 골랐을 때만 boolean. */
    bonusThresholdMet: boolean | null;
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
  bossKind: GuildRaidBossId;
  playerName: string;
  damageDealt: number;
  damageTaken: number;
  diedEarly: boolean;
  turns: number;
  replay: ReplayPayload;
};

export type GuildRaidErrorResponse = { ok?: false; error?: string };
