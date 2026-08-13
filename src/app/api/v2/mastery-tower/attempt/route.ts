import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";
import { derivePowerScore } from "@/adventure/data/v2/power";
import { powerInputFromPlayer } from "@/lib/server/playerPowerInput";
import {
  lockSaveForUpdate,
  readSave,
  upsertSave,
} from "@/lib/server/savesKv";
import { recordEconomyEventSoon } from "@/lib/server/economyLog";
import { settleMasteryTowerRollover } from "@/lib/server/masteryTowerRollover";
import { prepareV2BattleActor } from "@/lib/server/v2BattlePrep";
import { resolveBattle } from "@/adventure/v2/combat/engine";
import { pickAutoAction } from "@/adventure/v2/combat/pickAutoAction";
import { toReplayPayload } from "@/adventure/data/v2/replayPayload";
import {
  MASTERY_CERTIFICATE_KEY,
  MASTERY_TOWER_MAX_FLOOR,
  MASTERY_TOWER_SAVE_KEY,
  clearMasteryTowerFloor,
  failMasteryTowerRun,
  kstDateKey,
  markMasteryTowerEntryStaminaPaid,
  masteryTowerAttemptLog,
  masteryTowerClaimPreview,
  masteryTowerEntryStaminaCost,
  masteryTowerGuardianForFloor,
  masteryTowerGuardianPreview,
  masteryTowerRequiredPower,
  resolveMasteryTowerAttemptFloor,
} from "@/adventure/data/v2/masteryTower";
import {
  applyRegen,
  parseStaminaFromSave,
  staminaConfigForCharacter,
  tryConsume,
} from "@/adventure/v2/stamina";
import { parseMasteryTowerAttemptRequest } from "./request";

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

  const attemptRequest = parseMasteryTowerAttemptRequest(
    await req.json().catch(() => ({})),
  );
  if (!attemptRequest.ok) {
    return Response.json(
      { ok: false, error: attemptRequest.error },
      { status: 400 },
    );
  }

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
    const power = derivePowerScore(
      powerInputFromPlayer(
        player.player,
        player.maxHp,
        player.player.maxMp ?? 0,
      ),
    );
    const rollover = await settleMasteryTowerRollover(
      tx,
      userId,
      kstDateKey(),
    );
    const now = Date.now();
    let tower = rollover.tower;
    const completedTower = tower.runFloor >= MASTERY_TOWER_MAX_FLOOR;
    if (tower.cooldownUntil && tower.cooldownUntil > now) {
      const retryAfterSeconds = Math.ceil((tower.cooldownUntil - now) / 1000);
      return {
        status: 200,
        body: {
          ok: true as const,
          success: false,
          practice: completedTower,
          error: "cooldown" as const,
          tower,
          power,
          floor: completedTower
            ? MASTERY_TOWER_MAX_FLOOR
            : tower.runFloor + 1,
          requiredPower: null,
          guardian: null,
          retryAfterSeconds,
          autoClaimedReward: rollover.autoClaimedReward,
          claimPreview: masteryTowerClaimPreview(tower),
          log: [
            {
              kind: "fail" as const,
              text: completedTower
                ? `재입장 대기 중입니다. ${retryAfterSeconds}초 후 50층 연습에 다시 도전할 수 있습니다.`
                : `재입장 대기 중입니다. ${retryAfterSeconds}초 후 시작 위치를 다시 선택할 수 있습니다.`,
            },
          ],
        },
      };
    }

    const resolvedFloor = resolveMasteryTowerAttemptFloor(
      tower,
      attemptRequest.startFloor,
    );
    if (!resolvedFloor.ok) {
      return {
        status: 400,
        body: { ok: false as const, error: resolvedFloor.error },
      };
    }
    const floor = resolvedFloor.floor;
    const practice = completedTower && floor === MASTERY_TOWER_MAX_FLOOR;
    if (floor > MASTERY_TOWER_MAX_FLOOR) {
      const claimPreview = masteryTowerClaimPreview(tower);
      return {
        status: 200,
        body: {
          ok: true as const,
          success: false,
          practice,
          error: "max_floor" as const,
          tower,
          power,
          floor: null,
          requiredPower: null,
          guardian: null,
          retryAfterSeconds: 0,
          autoClaimedReward: rollover.autoClaimedReward,
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

    // 하루 첫 실제 전투에만 200을 받고, 이후 층 진행·실패 후 재입장은 무료다.
    const entryStaminaCost = masteryTowerEntryStaminaCost(tower);
    const staminaConfig = staminaConfigForCharacter(charSave, now);
    const stamina = parseStaminaFromSave(charSave.stamina, now);
    const afterStamina =
      entryStaminaCost > 0
        ? tryConsume(
            stamina,
            entryStaminaCost,
            now,
            staminaConfig.max,
            staminaConfig.regenBonusPct,
          )
        : applyRegen(
            stamina,
            now,
            staminaConfig.max,
            staminaConfig.regenBonusPct,
          );
    if (!afterStamina) {
      return {
        status: 409,
        body: {
          ok: false as const,
          error: "out_of_stamina" as const,
          requiredStamina: entryStaminaCost,
          autoClaimedReward: rollover.autoClaimedReward,
          stamina: applyRegen(
            stamina,
            now,
            staminaConfig.max,
            staminaConfig.regenBonusPct,
          ),
        },
      };
    }
    if (entryStaminaCost > 0) {
      tower = markMasteryTowerEntryStaminaPaid(tower);
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
    } else {
      tower = failMasteryTowerRun(tower, now);
      await upsertSave(tx, userId, MASTERY_TOWER_SAVE_KEY, tower);
    }
    if (entryStaminaCost > 0) {
      await upsertSave(tx, userId, "character.v2", {
        ...charSave,
        stamina: afterStamina,
      });
    }
    const claimPreview = masteryTowerClaimPreview(tower);
    const retryAfterSeconds = success
      ? 0
      : Math.ceil(((tower.cooldownUntil ?? now) - now) / 1000);

    return {
      status: 200,
      body: {
        ok: true as const,
        success,
        practice,
        stamina: afterStamina,
        staminaCost: entryStaminaCost,
        nextEntryStaminaCost: masteryTowerEntryStaminaCost(tower),
        tower,
        power,
        floor,
        requiredPower,
        guardian: masteryTowerGuardianPreview(floor),
        retryAfterSeconds,
        autoClaimedReward: rollover.autoClaimedReward,
        turns: battle.turns,
        startPlayerHp: player.maxHp,
        playerName,
        gender: typeof profile?.gender === "string" ? profile.gender : "male1",
        replay: toReplayPayload(battle.finalState),
        claimPreview,
        log: masteryTowerAttemptLog({
          floor,
          success,
          practice,
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

  const autoClaimedReward =
    "autoClaimedReward" in result.body
      ? result.body.autoClaimedReward
      : null;
  if (autoClaimedReward) {
    recordEconomyEventSoon({
      userId,
      eventType: "reward.mastery_tower.certificate",
      itemKind: "mastery_certificate",
      itemId: MASTERY_CERTIFICATE_KEY,
      quantity: autoClaimedReward.total,
      detail: {
        automatic: true,
        previousDate: autoClaimedReward.previousDate,
        previousBestFloor: autoClaimedReward.previousBestFloor,
        base: autoClaimedReward.base,
        firstClearBonus: autoClaimedReward.firstClearBonus,
      },
    });
  }

  return Response.json(result.body, { status: result.status });
}
