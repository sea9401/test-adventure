import { db } from "@/db";
import {
  MONTHLY_ATTENDANCE_REWARDS,
  MONTHLY_ATTENDANCE_SAVE_KEY,
  monthlyAttendanceRewardLabel,
  monthlyAttendanceStatus,
  type MonthlyAttendanceReward,
} from "@/adventure/data/v2/monthlyAttendance";
import {
  ADVENTURE_SUPPORT_PASS,
  grantAdventureSupport,
} from "@/adventure/data/v2/adventureSupport";
import { SUMMON_SCROLL_MATERIAL_ID } from "@/adventure/data/v2/coopBosses";
import { MASTERY_CERTIFICATE_KEY } from "@/adventure/data/v2/masteryTower";
import { ENHANCE_STONE_MATERIAL_ID } from "@/adventure/data/v2/v2Enhance";
import {
  applyRegen,
  parseStaminaFromSave,
  staminaConfigForCharacter,
  staminaOverchargeCap,
} from "@/adventure/v2/stamina";
import {
  STAMINA_POTIONS_KEY,
  parseStaminaPotions,
} from "@/adventure/v2/staminaPotions";
import { ensureUser } from "@/lib/server/ensureUser";
import {
  recordEconomyEventSoon,
  recordRewardFailureSoon,
} from "@/lib/server/economyLog";
import {
  lockSaveForUpdate,
  readSave,
  upsertSave,
} from "@/lib/server/savesKv";

type CharacterSave = Record<string, unknown> & {
  class?: unknown;
  adventureSupport?: unknown;
  stamina?: unknown;
  materials?: unknown;
};

function materialCounts(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return Object.fromEntries(
    Object.entries(raw).flatMap(([id, value]) => {
      const count = Math.max(0, Math.floor(Number(value) || 0));
      return count > 0 ? [[id, count]] : [];
    }),
  );
}

function publicStatus(raw: unknown, now: Date) {
  const status = monthlyAttendanceStatus(raw, now);
  return {
    ...status,
    rewards: MONTHLY_ATTENDANCE_REWARDS,
  };
}

export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const now = new Date();
  const saved = await readSave(db, userId, MONTHLY_ATTENDANCE_SAVE_KEY, {});
  return Response.json({ ok: true, ...publicStatus(saved, now) });
}

export async function POST() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const now = new Date();
  const nowMs = now.getTime();

  try {
    const result = await db.transaction(async (tx) => {
      // 공용 락 순서에 맞춰 character → attendance → 보상별 보조 세이브 순으로 잠근다.
      const character = await lockSaveForUpdate<CharacterSave>(
        tx,
        userId,
        "character.v2",
        {},
      );
      if (typeof character.class !== "string") {
        return {
          status: 409,
          body: { ok: false as const, error: "no_character" },
        };
      }
      const attendanceRaw = await lockSaveForUpdate(
        tx,
        userId,
        MONTHLY_ATTENDANCE_SAVE_KEY,
        {},
      );
      const status = monthlyAttendanceStatus(attendanceRaw, now);
      if (status.claimedToday) {
        return {
          status: 409,
          body: { ok: false as const, error: "already_claimed" },
        };
      }
      if (status.complete || status.nextDay == null) {
        return {
          status: 409,
          body: { ok: false as const, error: "month_complete" },
        };
      }

      const reward = MONTHLY_ATTENDANCE_REWARDS[status.nextDay - 1];
      let nextCharacter: CharacterSave = { ...character };
      let characterChanged = false;
      let adventureSupportActiveUntil: number | null = null;
      let staminaPotions: number | null = null;
      let masteryCertificates: number | null = null;
      let grantedMaterials: Record<string, number> | null = null;

      if (reward.kind === "adventure_support") {
        const grant = grantAdventureSupport(
          character.adventureSupport,
          reward.days,
          nowMs,
        );
        if (!grant) throw new Error("invalid_adventure_support_reward");
        nextCharacter = {
          ...nextCharacter,
          adventureSupport: grant.state,
        };
        adventureSupportActiveUntil = grant.state.activeUntil;
        characterChanged = true;

        if (grant.firstActivation) {
          const previousConfig = staminaConfigForCharacter(character, nowMs);
          const nextConfig = staminaConfigForCharacter(nextCharacter, nowMs);
          const currentStamina = applyRegen(
            parseStaminaFromSave(character.stamina, nowMs),
            nowMs,
            previousConfig.max,
            previousConfig.regenBonusPct,
          );
          nextCharacter = {
            ...nextCharacter,
            stamina: {
              current: Math.min(
                staminaOverchargeCap(nextConfig.max),
                currentStamina.current +
                  ADVENTURE_SUPPORT_PASS.staminaActivationGrant,
              ),
              lastUpdatedAt: currentStamina.lastUpdatedAt,
            },
          };
        }
      } else if (reward.kind === "stamina_potion") {
        const potionSave = await lockSaveForUpdate(
          tx,
          userId,
          STAMINA_POTIONS_KEY,
          { count: 0 },
        );
        staminaPotions = parseStaminaPotions(potionSave).count + reward.count;
        await upsertSave(tx, userId, STAMINA_POTIONS_KEY, {
          count: staminaPotions,
        });
      } else if (reward.kind === "mastery_certificate") {
        const inventory = await lockSaveForUpdate<Record<string, unknown>>(
          tx,
          userId,
          "inventory.v2",
          {},
        );
        masteryCertificates =
          Math.max(
            0,
            Math.floor(Number(inventory[MASTERY_CERTIFICATE_KEY]) || 0),
          ) + reward.count;
        await upsertSave(tx, userId, "inventory.v2", {
          ...inventory,
          [MASTERY_CERTIFICATE_KEY]: masteryCertificates,
        });
      } else {
        const materials = materialCounts(character.materials);
        grantedMaterials = {};
        const grantMaterial = (materialId: string, count: number) => {
          materials[materialId] = (materials[materialId] ?? 0) + count;
          grantedMaterials![materialId] = count;
        };

        if (reward.kind === "enhancement_stone") {
          grantMaterial(ENHANCE_STONE_MATERIAL_ID[reward.color], reward.count);
        } else if (reward.kind === "boss_summon_scroll") {
          grantMaterial(SUMMON_SCROLL_MATERIAL_ID, reward.count);
        } else {
          grantMaterial(ENHANCE_STONE_MATERIAL_ID.red, reward.red);
          grantMaterial(ENHANCE_STONE_MATERIAL_ID.blue, reward.blue);
        }
        nextCharacter = { ...nextCharacter, materials };
        characterChanged = true;
      }

      if (characterChanged) {
        await upsertSave(tx, userId, "character.v2", nextCharacter);
      }
      const nextAttendance = {
        monthKey: status.monthKey,
        claimedDayKeys: [...status.claimedDayKeys, status.todayKey],
      };
      await upsertSave(
        tx,
        userId,
        MONTHLY_ATTENDANCE_SAVE_KEY,
        nextAttendance,
      );

      return {
        status: 200,
        body: {
          ok: true as const,
          reward,
          rewardLabel: monthlyAttendanceRewardLabel(reward),
          adventureSupportActiveUntil,
          staminaPotions,
          masteryCertificates,
          grantedMaterials,
          ...publicStatus(nextAttendance, now),
        },
      };
    });

    if (result.status === 200 && result.body.ok) {
      recordAttendanceReward(userId, result.body.reward);
    }
    return Response.json(result.body, { status: result.status });
  } catch (error) {
    console.error("[monthly-attendance] claim failed", error);
    recordRewardFailureSoon({
      userId,
      source: "monthly_attendance",
      error: "server_error",
    });
    return Response.json(
      { ok: false, error: "server_error" },
      { status: 500 },
    );
  }
}

function recordAttendanceReward(
  userId: string,
  reward: MonthlyAttendanceReward,
) {
  if (reward.kind === "adventure_support") {
    recordEconomyEventSoon({
      userId,
      eventType: "reward.monthly_attendance",
      itemKind: "entitlement",
      itemId: "monthly_adventure_support",
      quantity: reward.days,
    });
    return;
  }
  if (reward.kind === "stamina_potion") {
    recordEconomyEventSoon({
      userId,
      eventType: "reward.monthly_attendance",
      itemKind: "consumable",
      itemId: "stamina_potion",
      quantity: reward.count,
    });
    return;
  }
  if (reward.kind === "mastery_certificate") {
    recordEconomyEventSoon({
      userId,
      eventType: "reward.monthly_attendance",
      itemKind: "mastery_certificate",
      itemId: MASTERY_CERTIFICATE_KEY,
      quantity: reward.count,
    });
    return;
  }

  const recordMaterial = (itemId: string, quantity: number) =>
    recordEconomyEventSoon({
      userId,
      eventType: "reward.monthly_attendance",
      itemKind: "material",
      itemId,
      quantity,
    });
  if (reward.kind === "enhancement_stone") {
    recordMaterial(ENHANCE_STONE_MATERIAL_ID[reward.color], reward.count);
  } else if (reward.kind === "boss_summon_scroll") {
    recordMaterial(SUMMON_SCROLL_MATERIAL_ID, reward.count);
  } else {
    recordMaterial(ENHANCE_STONE_MATERIAL_ID.red, reward.red);
    recordMaterial(ENHANCE_STONE_MATERIAL_ID.blue, reward.blue);
  }
}
