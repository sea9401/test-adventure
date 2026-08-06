import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import {
  recordEconomyEventSoon,
  recordRewardFailureSoon,
} from "@/lib/server/economyLog";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { settleMasteryTowerRollover } from "@/lib/server/masteryTowerRollover";
import {
  MASTERY_CERTIFICATE_KEY,
  MASTERY_TOWER_SAVE_KEY,
  kstDateKey,
  masteryTowerClaimPreview,
} from "@/adventure/data/v2/masteryTower";

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const limited = enforceUserAndIpRateLimit(req, {
    userId,
    action: "v2:mastery-tower:claim",
    userLimit: 20,
    ipLimit: 120,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const result = await db.transaction(async (tx) => {
    const rollover = await settleMasteryTowerRollover(
      tx,
      userId,
      kstDateKey(),
    );
    const tower = rollover.tower;
    const preview = masteryTowerClaimPreview(tower);
    if (tower.claimed) {
      return { status: 400, body: { ok: false as const, error: "claimed" } };
    }
    if (tower.todayBestFloor <= 0 || preview.total <= 0) {
      if (rollover.autoClaimedReward && rollover.certificates != null) {
        return {
          status: 200,
          body: {
            ok: true as const,
            automatic: true,
            gained: rollover.autoClaimedReward.total,
            base: rollover.autoClaimedReward.base,
            firstClearBonus: rollover.autoClaimedReward.firstClearBonus,
            certificates: rollover.certificates,
            tower,
            autoClaimedReward: rollover.autoClaimedReward,
          },
        };
      }
      return { status: 400, body: { ok: false as const, error: "no_reward" } };
    }

    const inventory = await lockSaveForUpdate<Record<string, unknown>>(
      tx,
      userId,
      "inventory.v2",
      {},
    );
    const held = Math.max(
      0,
      Math.floor(Number(inventory[MASTERY_CERTIFICATE_KEY]) || 0),
    );
    const nextTower = {
      ...tower,
      claimed: true,
      firstClearRewardsClaimed: [
        ...new Set([
          ...tower.firstClearRewardsClaimed,
          ...preview.newlyClaimedMilestones,
        ]),
      ].sort((a, b) => a - b),
    };
    const certificates = held + preview.total;

    await upsertSave(tx, userId, MASTERY_TOWER_SAVE_KEY, nextTower);
    await upsertSave(tx, userId, "inventory.v2", {
      ...inventory,
      [MASTERY_CERTIFICATE_KEY]: certificates,
    });

    return {
      status: 200,
      body: {
        ok: true as const,
        automatic: false,
        gained: preview.total,
        base: preview.base,
        firstClearBonus: preview.firstClearBonus,
        certificates,
        tower: nextTower,
        autoClaimedReward: null,
      },
    };
  });

  if (result.status === 200 && result.body.ok && result.body.gained > 0) {
    recordEconomyEventSoon({
      userId,
      eventType: "reward.mastery_tower.certificate",
      itemKind: "mastery_certificate",
      itemId: MASTERY_CERTIFICATE_KEY,
      quantity: result.body.gained,
      detail: {
        automatic: result.body.automatic === true,
        base: result.body.base,
        firstClearBonus: result.body.firstClearBonus,
        ...(result.body.autoClaimedReward
          ? {
              previousDate: result.body.autoClaimedReward.previousDate,
              previousBestFloor:
                result.body.autoClaimedReward.previousBestFloor,
            }
          : {}),
      },
    });
  } else if (result.status !== 200 && !result.body.ok) {
    recordRewardFailureSoon({
      userId,
      source: "mastery_tower",
      error: result.body.error,
      detail: { status: result.status },
    });
  }

  return Response.json(result.body, { status: result.status });
}
