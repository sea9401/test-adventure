import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { derivePlayerCombatV2 } from "@/lib/server/derivePlayerCombatV2";
import { derivePowerScore } from "@/adventure/data/v2/power";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import {
  MASTERY_TOWER_MAX_FLOOR,
  MASTERY_TOWER_SAVE_KEY,
  clearMasteryTowerFloor,
  kstDateKey,
  masteryTowerAttemptLog,
  masteryTowerClaimPreview,
  masteryTowerRequiredPower,
  parseMasteryTowerState,
} from "@/adventure/data/v2/masteryTower";

export async function POST() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const derived = await derivePlayerCombatV2(userId);
  if (!derived) {
    return Response.json(
      { ok: false, error: "no_character" },
      { status: 400 },
    );
  }
  const power = derivePowerScore({
    atk: derived.player.atk,
    magicAtk: derived.player.magicAtk ?? 0,
    def: derived.player.def,
    spd: derived.player.spd,
    maxHp: derived.maxHp,
    maxMp: derived.player.maxMp ?? 0,
  });

  const result = await db.transaction(async (tx) => {
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
          claimPreview,
          log: masteryTowerAttemptLog({
            floor: null,
            power,
            requiredPower: null,
            success: false,
            tower,
            claimPreview,
          }),
        },
      };
    }

    const requiredPower = masteryTowerRequiredPower(floor);
    const success = power >= requiredPower;
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
        claimPreview,
        log: masteryTowerAttemptLog({
          floor,
          power,
          requiredPower,
          success,
          tower,
          claimPreview,
        }),
      },
    };
  });

  return Response.json(result.body, { status: result.status });
}
