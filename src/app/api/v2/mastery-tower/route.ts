import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { savesKv } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { derivePlayerCombatV2 } from "@/lib/server/derivePlayerCombatV2";
import { derivePowerScore } from "@/adventure/data/v2/power";
import {
  MASTERY_CERTIFICATE_KEY,
  MASTERY_TOWER_MAX_FLOOR,
  MASTERY_TOWER_MILESTONES,
  MASTERY_TOWER_SAVE_KEY,
  kstDateKey,
  masteryTowerClaimPreview,
  masteryTowerFloorReward,
  masteryTowerGuardianPreview,
  masteryTowerRequiredPower,
  parseMasteryTowerState,
} from "@/adventure/data/v2/masteryTower";
import {
  LEGACY_CLASS_SPEC_BY_JOB,
  V2_JOB_LIST,
  isFishingJobId,
  isJobUnlocked,
  isRootJobSelectable,
} from "@/adventure/data/v2/v2JobCatalog";
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
  const date = kstDateKey();
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
  const prof = parseProficiencyForChar(map.get("proficiency.v2"), charSave);
  const power = derivePowerScore({
    atk: derived.player.atk,
    magicAtk: derived.player.magicAtk ?? 0,
    def: derived.player.def,
    spd: derived.player.spd,
    maxHp: derived.maxHp,
    maxMp: derived.player.maxMp ?? 0,
  });

  const jobs = V2_JOB_LIST.filter(
    (job) =>
      job.id !== "none" &&
      !isFishingJobId(job.id) &&
      isRootJobSelectable(job) &&
      isJobUnlocked(job, prof),
  ).map((job) => ({
    id: job.id,
    name: job.name,
    tier: job.tier,
    group: LEGACY_CLASS_SPEC_BY_JOB[job.id]?.class ?? job.id,
    mastery:
      job.tier <= 1
        ? (prof.groups[job.id]?.cumLevel ?? 0)
        : (prof.jobCumLevel?.[job.id] ?? 0),
  }));

  return Response.json({
    ok: true,
    tower,
    certificates,
    claimPreview: preview,
    power,
    retryAfterSeconds,
    nextFloor:
      tower.runFloor >= MASTERY_TOWER_MAX_FLOOR ? null : tower.runFloor + 1,
    nextRequiredPower:
      tower.runFloor >= MASTERY_TOWER_MAX_FLOOR
        ? null
        : masteryTowerRequiredPower(tower.runFloor + 1),
    nextGuardian:
      tower.runFloor >= MASTERY_TOWER_MAX_FLOOR
        ? null
        : masteryTowerGuardianPreview(tower.runFloor + 1),
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
