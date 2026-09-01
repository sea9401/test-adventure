import "server-only";

import {
  COOP_BOSSES,
  coopBossForBattle,
  coopBossMaxMp,
  type CoopBossKindId,
} from "@/adventure/data/v2/coopBosses";
import { COOP_BOSS_MAX_HP_DAMAGE_MULT } from "@/adventure/data/v2/v2CombatConstants";
import { resolveBattle } from "@/adventure/v2/combat/engine";
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
  damageTaken: number;
  diedEarly: boolean;
  turns: number;
  replay: ReplayPayload;
};

export async function simulateGuildRaidBattle({
  tx,
  userId,
  bossKind,
}: {
  tx: DbExecutor;
  userId: string;
  bossKind: CoopBossKindId;
}): Promise<GuildRaidBattleResult | null> {
  const charSave = await lockSaveForUpdate<Record<string, unknown>>(
    tx,
    userId,
    "character.v2",
    {},
  );
  const prepared = await prepareV2BattleActor({ tx, userId, charSave });
  if (!prepared) return null;

  const profile = await readSave<{ name?: string } | null>(
    tx,
    userId,
    "character-profile.v2",
    null,
  );
  const playerName = profile?.name?.trim() || "모험가";
  const definition = COOP_BOSSES[bossKind];
  const bossHp = definition.sharedMaxHp;
  const { monster } = coopBossForBattle(definition, bossHp, {
    conditionalEnrageWeakened: false,
    bossMp: coopBossMaxMp(definition),
  });
  const bossForBattle = { ...monster, hp: bossHp };
  const playerMaxHp = prepared.player.maxHp;
  const playerMaxMp = prepared.player.player.maxMp ?? 0;
  const playerForBattle = {
    ...prepared.player.player,
    hp: playerMaxHp,
    mp: playerMaxMp,
  };
  const battle = resolveBattle(playerForBattle, bossForBattle, playerName, {
    pickAction: (state) => pickAutoAction(state, { rules: [], potions: {} }),
    potions: {},
    v2Skills: prepared.skills,
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
