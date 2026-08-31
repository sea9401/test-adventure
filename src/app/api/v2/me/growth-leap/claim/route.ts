import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { recordEconomyEventSoon } from "@/lib/server/economyLog";
import {
  GROWTH_LEAP_MILESTONES,
  GROWTH_LEAP_SAVE_KEY,
  claimGrowthLeapMilestone,
  growthLeapMissionView,
  type GrowthLeapMilestoneId,
} from "@/adventure/data/v2/growthLeap";
import {
  MASTERY_CERTIFICATE_KEY,
} from "@/adventure/data/v2/masteryTower";
import {
  STAMINA_POTIONS_KEY,
  grantStaminaPotions,
} from "@/adventure/v2/staminaPotions";
import {
  addMuseunCashItem,
  parseMuseunCashItems,
} from "@/adventure/data/v2/museunCashItems";

function errorStatus(error: string): number {
  if (error === "expired") return 410;
  if (error === "unknown_milestone") return 400;
  return 409;
}

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { milestoneId?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const milestone = GROWTH_LEAP_MILESTONES.find(
    (candidate) => candidate.id === body.milestoneId,
  );
  if (!milestone) {
    return Response.json(
      { ok: false, error: "unknown_milestone" },
      { status: 400 },
    );
  }
  const milestoneId = milestone.id as GrowthLeapMilestoneId;
  const now = Date.now();

  const result = await db.transaction(async (tx) => {
    const character = await lockSaveForUpdate<Record<string, unknown>>(
      tx,
      userId,
      "character.v2",
      {},
    );
    const growthLeap = await lockSaveForUpdate(
      tx,
      userId,
      GROWTH_LEAP_SAVE_KEY,
      {},
    );
    const claim = claimGrowthLeapMilestone(growthLeap, milestoneId, now);
    if (!claim.ok) {
      return {
        status: errorStatus(claim.error),
        body: { ok: false as const, error: claim.error },
      };
    }

    const inventory = await lockSaveForUpdate<Record<string, unknown>>(
      tx,
      userId,
      "inventory.v2",
      {},
    );
    const currentCertificates = Math.max(
      0,
      Math.floor(Number(inventory[MASTERY_CERTIFICATE_KEY]) || 0),
    );
    const certificates =
      currentCertificates + claim.reward.masteryCertificates;
    const nextInventory = {
      ...inventory,
      [MASTERY_CERTIFICATE_KEY]: certificates,
    };

    const currentPotions = await lockSaveForUpdate(
      tx,
      userId,
      STAMINA_POTIONS_KEY,
      { count: 0, boundCount: 0 },
    );
    const staminaPotions = grantStaminaPotions(
      currentPotions,
      claim.reward.staminaPotions,
      { bound: true },
    );

    let cashItems = parseMuseunCashItems(character.cashItems);
    if (claim.reward.cosmeticExtensions > 0) {
      cashItems = addMuseunCashItem(
        cashItems,
        "cosmetic_extension_30d",
        claim.reward.cosmeticExtensions,
      );
      await upsertSave(tx, userId, "character.v2", {
        ...character,
        cashItems,
      });
    }
    await upsertSave(tx, userId, "inventory.v2", nextInventory);
    if (claim.reward.staminaPotions > 0) {
      await upsertSave(tx, userId, STAMINA_POTIONS_KEY, staminaPotions);
    }
    await upsertSave(tx, userId, GROWTH_LEAP_SAVE_KEY, claim.state);

    return {
      status: 200,
      body: {
        ok: true as const,
        milestoneId,
        reward: claim.reward,
        certificates,
        staminaPotions,
        cashItems,
        mission: growthLeapMissionView(claim.state, now),
      },
    };
  });

  if (result.status === 200 && result.body.ok) {
    const reward = result.body.reward;
    if (reward.masteryCertificates > 0) {
      recordEconomyEventSoon({
        userId,
        eventType: "reward.growth_leap.mastery_certificate",
        itemKind: "mastery_certificate",
        quantity: reward.masteryCertificates,
        detail: { milestoneId },
      });
    }
    if (reward.staminaPotions > 0) {
      recordEconomyEventSoon({
        userId,
        eventType: "reward.growth_leap.stamina_potion",
        itemKind: "stamina_potion",
        quantity: reward.staminaPotions,
        detail: { milestoneId, bound: true },
      });
    }
    if (reward.cosmeticExtensions > 0) {
      recordEconomyEventSoon({
        userId,
        eventType: "reward.growth_leap.cosmetic_extension",
        itemKind: "cash_item",
        itemId: "cosmetic_extension_30d",
        quantity: reward.cosmeticExtensions,
        detail: { milestoneId },
      });
    }
  }

  return Response.json(result.body, { status: result.status });
}
