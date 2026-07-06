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
  masteryTowerClaimPreview,
  type MasteryTowerCombatProfile,
  masteryTowerFloorInfo,
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
  const combatProfile: MasteryTowerCombatProfile = {
    power,
    atk: derived.player.atk,
    magicAtk: derived.player.magicAtk ?? 0,
    def: derived.player.def,
    magicDef: derived.player.magicDef ?? 0,
    spd: derived.player.spd,
    maxHp: derived.maxHp,
    critResistPct: derived.player.critResistPct ?? 0,
    evaRating: derived.player.evaRating ?? derived.player.evasionPct ?? 0,
    accRating: derived.player.accRating ?? derived.player.accuracyPct ?? 0,
    extraAttackChancePct: derived.player.extraAttackChancePct ?? 0,
  };

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
          claimPreview: masteryTowerClaimPreview(tower),
        },
      };
    }

    const encounter = masteryTowerFloorInfo(floor, combatProfile);
    const requiredPower = encounter.requiredPower;
    const success = power >= requiredPower;
    if (success) {
      tower = clearMasteryTowerFloor(tower, floor);
      await upsertSave(tx, userId, MASTERY_TOWER_SAVE_KEY, tower);
    }

    return {
      status: 200,
      body: {
        ok: true as const,
        success,
        tower,
        power,
        floor,
        requiredPower,
        encounter,
        claimPreview: masteryTowerClaimPreview(tower),
      },
    };
  });

  return Response.json(result.body, { status: result.status });
}
