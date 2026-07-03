import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";
import { derivePowerScore } from "@/adventure/data/v2/power";
import {
  lockSaveForUpdate,
  readSave,
  upsertSave,
} from "@/lib/server/savesKv";
import { prepareV2BattleActor } from "@/lib/server/v2BattlePrep";
import { resolveBattle } from "@/adventure/v2/combat/engine";
import { pickAutoAction } from "@/adventure/v2/combat/pickAutoAction";
import { toReplayPayload } from "@/adventure/data/v2/replayPayload";
import {
  MASTERY_TOWER_MAX_FLOOR,
  MASTERY_TOWER_SAVE_KEY,
  clearMasteryTowerFloor,
  kstDateKey,
  masteryTowerAttemptLog,
  masteryTowerClaimPreview,
  masteryTowerGuardianForFloor,
  masteryTowerGuardianPreview,
  masteryTowerRequiredPower,
  parseMasteryTowerState,
} from "@/adventure/data/v2/masteryTower";

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const limited = enforceUserAndIpRateLimit(req, {
    userId,
    action: "v2:mastery-tower:attempt",
    userLimit: 90,
    ipLimit: 500,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const result = await db.transaction(async (tx) => {
    const charSave = await lockSaveForUpdate<Record<string, unknown>>(
      tx,
      userId,
      "character.v2",
      {},
    );
    const prepared = await prepareV2BattleActor({
      tx,
      userId,
      charSave,
      deriveSkills: "sanitized",
    });
    if (!prepared) {
      return {
        status: 400,
        body: { ok: false as const, error: "no_character" as const },
      };
    }
    const { player, skills: v2Skills } = prepared;
    const power = derivePowerScore({
      atk: player.player.atk,
      magicAtk: player.player.magicAtk ?? 0,
      def: player.player.def,
      spd: player.player.spd,
      maxHp: player.maxHp,
      maxMp: player.player.maxMp ?? 0,
    });
    const raw = await lockSaveForUpdate<unknown>(
      tx,
      userId,
      MASTERY_TOWER_SAVE_KEY,
      {},
    );
    let tower = parseMasteryTowerState(raw, kstDateKey());
    const floor = tower.todayBestFloor + 1;
    if (floor > MASTERY_TOWER_MAX_FLOOR) {
      const claimPreview = masteryTowerClaimPreview(tower);
      return {
        status: 200,
        body: {
          ok: true as const,
          success: false,
          error: "max_floor" as const,
          tower,
          power,
          floor: null,
          requiredPower: null,
          guardian: null,
          claimPreview,
          log: masteryTowerAttemptLog({
            floor: null,
            success: false,
            tower,
            claimPreview,
          }),
        },
      };
    }

    const requiredPower = masteryTowerRequiredPower(floor);
    const guardian = masteryTowerGuardianForFloor(floor);
    const profile = await readSave<{ name?: string; gender?: string } | null>(
      tx,
      userId,
      "character-profile.v2",
      null,
    );
    const playerName = profile?.name?.trim() || "모험가";
    const playerForBattle = {
      ...player.player,
      hp: player.maxHp,
      mp: player.player.maxMp ?? player.player.mp,
    };
    const battle = resolveBattle(playerForBattle, guardian, playerName, {
      pickAction: (state) => pickAutoAction(state, { rules: [], potions: {} }),
      potions: {},
      v2Skills,
      maxTurns: 80,
      openingNote: `숙련의 탑 ${floor}층 도전`,
    });
    const success = battle.outcome === "win";
    if (success) {
      tower = clearMasteryTowerFloor(tower, floor);
      await upsertSave(tx, userId, MASTERY_TOWER_SAVE_KEY, tower);
    }
    const claimPreview = masteryTowerClaimPreview(tower);

    return {
      status: 200,
      body: {
        ok: true as const,
        success,
        tower,
        power,
        floor,
        requiredPower,
        guardian: masteryTowerGuardianPreview(floor),
        turns: battle.turns,
        startPlayerHp: player.maxHp,
        playerName,
        gender: typeof profile?.gender === "string" ? profile.gender : "male1",
        replay: toReplayPayload(battle.finalState, 220),
        claimPreview,
        log: masteryTowerAttemptLog({
          floor,
          success,
          tower,
          claimPreview,
          turns: battle.turns,
          playerHp: battle.finalState.playerHp,
          playerMaxHp: battle.finalState.playerMaxHp,
          enemyHp: battle.finalState.enemyHp,
          enemyMaxHp: battle.finalState.enemy.hp,
        }),
      },
    };
  });

  return Response.json(result.body, { status: result.status });
}
