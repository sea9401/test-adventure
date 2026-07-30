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
  gold?: unknown;
  adventureSupport?: unknown;
  stamina?: unknown;
};

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
      // 공용 락 순서에 맞춰 character → attendance → stamina-potions 순으로 잠근다.
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
      let gold: number | null = null;
      let staminaPotions: number | null = null;

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
      } else if (reward.kind === "gold") {
        gold =
          Math.max(0, Math.floor(Number(character.gold) || 0)) + reward.amount;
        nextCharacter = { ...nextCharacter, gold };
        characterChanged = true;
      } else {
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
          gold,
          staminaPotions,
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
  if (reward.kind === "gold") {
    recordEconomyEventSoon({
      userId,
      eventType: "reward.monthly_attendance",
      goldDelta: reward.amount,
      itemKind: "gold",
      itemId: "gold",
      quantity: reward.amount,
    });
    return;
  }
  recordEconomyEventSoon({
    userId,
    eventType: "reward.monthly_attendance",
    itemKind:
      reward.kind === "adventure_support" ? "entitlement" : "consumable",
    itemId:
      reward.kind === "adventure_support"
        ? "monthly_adventure_support"
        : "stamina_potion",
    quantity: reward.kind === "adventure_support" ? reward.days : reward.count,
  });
}
