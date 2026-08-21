import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { savesKv } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { derivePlayerCombatV2 } from "@/lib/server/derivePlayerCombatV2";
import { derivePowerScore } from "@/adventure/data/v2/power";
import { powerInputFromPlayer } from "@/lib/server/playerPowerInput";
import { recordEconomyEventSoon } from "@/lib/server/economyLog";
import { settleMasteryTowerRollover } from "@/lib/server/masteryTowerRollover";
import {
  MASTERY_CERTIFICATE_KEY,
  MASTERY_TOWER_MAX_FLOOR,
  MASTERY_TOWER_MILESTONES,
  MASTERY_TOWER_SAVE_KEY,
  kstDateKey,
  masteryTowerClaimPreview,
  masteryTowerEntryStaminaCost,
  masteryTowerFloorReward,
  masteryTowerGuardianPreview,
  masteryTowerNextFloor,
  masteryTowerRequiredPower,
  masteryTowerStartFloors,
  parseMasteryTowerState,
} from "@/adventure/data/v2/masteryTower";
import {
  applyRegen,
  parseStaminaFromSave,
  staminaConfigForCharacter,
} from "@/adventure/v2/stamina";
import { masteryCertificateJobs } from "@/lib/server/masteryCertificateStatus";
import { parseProficiencyForChar } from "@/adventure/data/v2/proficiency";

const STATUS_KEYS = [
  "character.v2",
  "proficiency.v2",
  "inventory.v2",
  MASTERY_TOWER_SAVE_KEY,
] as const;

type StatusKey = (typeof STATUS_KEYS)[number];

export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const date = kstDateKey();
  const rollover = await db.transaction((tx) =>
    settleMasteryTowerRollover(tx, userId, date),
  );
  if (rollover.autoClaimedReward) {
    recordEconomyEventSoon({
      userId,
      eventType: "reward.mastery_tower.certificate",
      itemKind: "mastery_certificate",
      itemId: MASTERY_CERTIFICATE_KEY,
      quantity: rollover.autoClaimedReward.total,
      detail: {
        automatic: true,
        previousDate: rollover.autoClaimedReward.previousDate,
        previousBestFloor: rollover.autoClaimedReward.previousBestFloor,
        base: rollover.autoClaimedReward.base,
        firstClearBonus: rollover.autoClaimedReward.firstClearBonus,
      },
    });
  }

  const [derived, rows] = await Promise.all([
    derivePlayerCombatV2(userId),
    db
      .select({ key: savesKv.key, value: savesKv.value })
      .from(savesKv)
      .where(
        and(eq(savesKv.userId, userId), inArray(savesKv.key, [...STATUS_KEYS])),
      ),
  ]);
  if (!derived) {
    return Response.json(
      { ok: false, error: "no_character" },
      { status: 400 },
    );
  }

  const map = new Map(rows.map((r) => [r.key as StatusKey, r.value]));
  const tower = parseMasteryTowerState(map.get(MASTERY_TOWER_SAVE_KEY), date);
  const now = Date.now();
  const retryAfterSeconds =
    tower.cooldownUntil && tower.cooldownUntil > now
      ? Math.ceil((tower.cooldownUntil - now) / 1000)
      : 0;
  const preview = masteryTowerClaimPreview(tower);
  const inventory = (map.get("inventory.v2") ?? {}) as Record<string, unknown>;
  const certificates = Math.max(
    0,
    Math.floor(Number(inventory[MASTERY_CERTIFICATE_KEY]) || 0),
  );
  const charSave = (map.get("character.v2") ?? {}) as Record<string, unknown>;
  const staminaConfig = staminaConfigForCharacter(charSave, now);
  const stamina = applyRegen(
    parseStaminaFromSave(charSave.stamina, now),
    now,
    staminaConfig.max,
    staminaConfig.regenBonusPct,
  );
  const prof = parseProficiencyForChar(map.get("proficiency.v2"), charSave);
  const power = derivePowerScore(
    powerInputFromPlayer(
      derived.player,
      derived.maxHp,
      derived.player.maxMp ?? 0,
    ),
  );

  const jobs = masteryCertificateJobs(prof);
  const startOptions = masteryTowerStartFloors(tower).map((floor) => ({
    floor,
    checkpointFloor: floor === 1 ? null : floor - 1,
    requiredPower: masteryTowerRequiredPower(floor),
    guardian: masteryTowerGuardianPreview(floor),
  }));
  const nextFloor = masteryTowerNextFloor(tower);

  return Response.json({
    ok: true,
    tower,
    entryStaminaCost: masteryTowerEntryStaminaCost(tower),
    stamina,
    certificates,
    autoClaimedReward: rollover.autoClaimedReward,
    claimPreview: preview,
    power,
    retryAfterSeconds,
    nextFloor,
    nextRequiredPower: masteryTowerRequiredPower(nextFloor),
    nextGuardian: masteryTowerGuardianPreview(nextFloor),
    startOptions,
    rewards: {
      maxFloor: MASTERY_TOWER_MAX_FLOOR,
      milestones: MASTERY_TOWER_MILESTONES,
      samples: [5, 10, 20, 30, 40, 50].map((floor) => ({
        floor,
        reward: masteryTowerFloorReward(floor),
      })),
    },
    jobs,
  });
}
