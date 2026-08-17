import { COOP_BOSSES, type CoopBossKindId } from "./coopBosses";
import { kstDayKey, kstWeekMondayKey } from "@/lib/kst";

export const GUILD_RAID_DAILY_ATTACKS = 3;
export const GUILD_RAID_ELIGIBLE_ATTACKS = 3;
export const GUILD_RAID_PILOT_BOSS_KIND =
  "mountain_chief_hard" satisfies CoopBossKindId;
export const GUILD_RAID_STAGE_HP_GROWTH = 1.25;

export const guildRaidDayKey = kstDayKey;
export const guildRaidWeekKey = kstWeekMondayKey;

export type GuildRaidStageState = {
  stage: number;
  hp: number;
  maxHp: number;
};

export type GuildRaidDamageResult = GuildRaidStageState & {
  stagesCleared: number;
};

export function guildRaidMaxHp(stage: number): number {
  const normalizedStage = Math.max(1, Math.floor(stage));
  const base = COOP_BOSSES[GUILD_RAID_PILOT_BOSS_KIND].sharedMaxHp;
  return Math.max(
    1,
    Math.min(
      Number.MAX_SAFE_INTEGER,
      Math.floor(base * GUILD_RAID_STAGE_HP_GROWTH ** (normalizedStage - 1)),
    ),
  );
}

export function applyGuildRaidDamage(
  state: GuildRaidStageState,
  rawDamage: number,
  maxHpForStage: (stage: number) => number = guildRaidMaxHp,
): GuildRaidDamageResult {
  let stage = Math.max(1, Math.floor(state.stage));
  let maxHp = Math.max(1, Math.floor(state.maxHp));
  let hp = Math.max(1, Math.min(maxHp, Math.floor(state.hp)));
  let damage =
    Number.isFinite(rawDamage) && rawDamage > 0 ? Math.floor(rawDamage) : 0;
  let stagesCleared = 0;

  while (damage >= hp) {
    damage -= hp;
    stage += 1;
    stagesCleared += 1;
    maxHp = Math.max(1, Math.floor(maxHpForStage(stage)));
    hp = maxHp;
  }

  return {
    stage,
    hp: hp - damage,
    maxHp,
    stagesCleared,
  };
}

export function isGuildRaidParticipantEligible(
  attackCount: number,
  damage: number,
): boolean {
  return attackCount >= GUILD_RAID_ELIGIBLE_ATTACKS && damage >= 1;
}

export function rankGuildRaidScores<T extends { guildId: number; damage: number }>(
  rows: readonly T[],
): Array<T & { rank: number }> {
  const sorted = [...rows].sort(
    (a, b) => b.damage - a.damage || a.guildId - b.guildId,
  );
  let previousDamage: number | null = null;
  let previousRank = 0;
  return sorted.map((row, index) => {
    const rank = row.damage === previousDamage ? previousRank : index + 1;
    previousDamage = row.damage;
    previousRank = rank;
    return { ...row, rank };
  });
}
