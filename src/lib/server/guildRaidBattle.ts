import "server-only";
import type { Monster } from "@/adventure/data/monsters/types";

import {
  coopBossForBattle,
  coopBossMaxMp,
} from "@/adventure/data/v2/coopBosses";
import {
  GUILD_RAID_BOSSES,
  type GuildRaidBossId,
} from "@/adventure/data/v2/guildRaidBosses";
import { COOP_BOSS_MAX_HP_DAMAGE_MULT } from "@/adventure/data/v2/v2CombatConstants";
import type { V2SkillsState } from "@/adventure/data/v2/v2Skills";
import { resolveBattle, type PlayerCombat } from "@/adventure/v2/combat/engine";
import { pickAutoAction } from "@/adventure/v2/combat/pickAutoAction";
import { toReplayPayload, type ReplayPayload } from "@/adventure/data/v2/replayPayload";
import { prepareV2BattleActor } from "@/lib/server/v2BattlePrep";
import {
  lockSaveForUpdate,
  readSave,
  type DbExecutor,
} from "@/lib/server/savesKv";

export type GuildRaidBattleResult = {
  playerName: string;
  damageDealt: number;
  /** Historical API field: net HP loss after recovery, not cumulative hostile damage. */
  damageTaken: number;
  diedEarly: boolean;
  turns: number;
  replay: ReplayPayload;
};

function guildRaidBossMonster(bossId: GuildRaidBossId): Monster {
  const definition = GUILD_RAID_BOSSES[bossId].definition;
  const bossHp = definition.sharedMaxHp;
  const { monster } = coopBossForBattle(definition, bossHp, {
    conditionalEnrageWeakened: false,
    bossMp: coopBossMaxMp(definition),
  });
  return { ...monster, hp: bossHp };
}

export async function simulateGuildRaidBattle({
  tx,
  userId,
  bossId,
  lockForUpdate = true,
}: {
  tx: DbExecutor;
  userId: string;
  bossId: GuildRaidBossId;
  lockForUpdate?: boolean;
}): Promise<GuildRaidBattleResult | null> {
  const charSave = lockForUpdate
    ? await lockSaveForUpdate<Record<string, unknown>>(
        tx,
        userId,
        "character.v2",
        {},
      )
    : await readSave<Record<string, unknown>>(
        tx,
        userId,
        "character.v2",
        {},
      );
  const prepared = await prepareV2BattleActor({
    tx,
    userId,
    charSave,
    lockForUpdate,
  });
  if (!prepared) return null;

  const profile = await readSave<{ name?: string } | null>(
    tx,
    userId,
    "character-profile.v2",
    null,
  );
  return resolveGuildRaidBattle({
    bossId,
    player: prepared.player.player,
    playerMaxHp: prepared.player.maxHp,
    skills: prepared.skills,
    playerName: profile?.name?.trim() || "모험가",
  });
}

// DB 없이 토벌 전투 한 판을 계산한다. 서버 공격·연습과 난이도 시뮬이 같은 경로를 쓴다.
export function resolveGuildRaidBattle({
  bossId,
  player,
  playerMaxHp,
  skills,
  playerName,
}: {
  bossId: GuildRaidBossId;
  player: PlayerCombat;
  playerMaxHp: number;
  skills: V2SkillsState;
  playerName: string;
}): GuildRaidBattleResult {
  const bossForBattle = guildRaidBossMonster(bossId);
  const bossHp = bossForBattle.hp;
  const playerMaxMp = player.maxMp ?? 0;
  const playerForBattle = {
    ...player,
    hp: playerMaxHp,
    mp: playerMaxMp,
  };
  const battle = resolveBattle(playerForBattle, bossForBattle, playerName, {
    pickAction: (state) => pickAutoAction(state, { rules: [], potions: {} }),
    potions: {},
    v2Skills: skills,
    isBoss: true,
    maxHpDamageMult: COOP_BOSS_MAX_HP_DAMAGE_MULT,
    initialEnemyHp: bossHp,
    damageMeter: { continueAfterDefeat: true, refillHp: bossHp },
  });
  const damageDealt = Math.max(
    0,
    battle.damageDealtTotal ?? bossHp - battle.finalState.enemyHp,
  );
  const damageTaken = Math.max(0, playerMaxHp - battle.finalState.playerHp);
  return {
    playerName,
    damageDealt,
    damageTaken,
    diedEarly: battle.finalState.playerHp <= 0,
    turns: battle.turns,
    replay: toReplayPayload(battle.finalState, {
      playerCombat: playerForBattle,
    }),
  };
}
