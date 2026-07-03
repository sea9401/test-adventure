import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { economyEvents } from "@/db/schema";
import { logAdminAction } from "@/lib/server/adminAudit";
import { recordEconomyEventSoon } from "@/lib/server/economyLog";
import { currentAdminEmail, requireAdminRole } from "@/lib/server/isAdmin";
import {
  readRewardFailureStatuses,
  writeRewardFailureStatuses,
} from "@/lib/server/opsSettings";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { FISHING_WALLET_KEY, fishingWalletWithCoins, walletCoins as fishingCoins } from "@/lib/server/fishing/coins";
import { TREASURE_WALLET_KEY, walletCoins as treasureCoins } from "@/lib/server/treasure/coins";
import { MASTERY_CERTIFICATE_KEY } from "@/adventure/data/v2/masteryTower";
import { STAMINA_POTIONS_KEY, staminaPotionCount } from "@/adventure/v2/staminaPotions";

const ITEM_KINDS = [
  "gold",
  "fishing_coin",
  "treasure_coin",
  "mastery_certificate",
  "stamina_potion",
  "material",
] as const;
type ItemKind = (typeof ITEM_KINDS)[number];
const DAY_MS = 24 * 60 * 60 * 1000;

export async function POST(req: Request) {
  const gate = await requireAdminRole("reward");
  if (gate) return gate;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const userId = typeof body?.userId === "string" ? body.userId.trim() : "";
  const itemKind = typeof body?.itemKind === "string" ? body.itemKind.trim() : "";
  const itemId = typeof body?.itemId === "string" ? body.itemId.trim() : "";
  const quantity = clampPositiveInt(body?.quantity, 1_000_000_000);
  const reason = typeof body?.reason === "string" ? body.reason.trim().slice(0, 500) : "";
  const sourceEventId = clampPositiveInt(body?.sourceEventId, 2_147_483_647, 0);
  const confirmLarge = body?.confirmLarge === true;
  const confirmDuplicate = body?.confirmDuplicate === true;

  if (!userId || !isItemKind(itemKind) || quantity <= 0) {
    return Response.json(
      { ok: false, error: "userId_itemKind_quantity_required" },
      { status: 400 },
    );
  }
  if (itemKind === "material" && !itemId) {
    return Response.json(
      { ok: false, error: "material_requires_itemId" },
      { status: 400 },
    );
  }
  if (isLargeCompensation(itemKind, quantity) && !confirmLarge) {
    return Response.json(
      {
        ok: false,
        error: "large_compensation_requires_confirm",
        threshold: largeThreshold(itemKind),
      },
      { status: 409 },
    );
  }
  if (sourceEventId > 0) {
    const existing = (await readRewardFailureStatuses()).find(
      (entry) => entry.eventId === sourceEventId,
    );
    if (existing?.status === "compensated" && !confirmDuplicate) {
      return Response.json(
        {
          ok: false,
          error: "duplicate_source_event",
          sourceEventId,
          updatedAt: existing.updatedAt,
        },
        { status: 409 },
      );
    }
  }
  const similar = (
    await db
      .select({
        id: economyEvents.id,
        createdAt: economyEvents.createdAt,
      })
      .from(economyEvents)
      .where(
        and(
          eq(economyEvents.userId, userId),
          eq(economyEvents.eventType, "admin.reward.compensate"),
          eq(economyEvents.itemKind, itemKind),
          eq(economyEvents.itemId, itemId || itemKind),
          eq(economyEvents.quantity, quantity),
          gte(economyEvents.createdAt, new Date(Date.now() - DAY_MS)),
        ),
      )
      .orderBy(desc(economyEvents.id))
      .limit(1)
  )[0];
  if (similar && !confirmDuplicate) {
    return Response.json(
      {
        ok: false,
        error: "similar_compensation_exists",
        eventId: similar.id,
        createdAt: similar.createdAt.toISOString(),
      },
      { status: 409 },
    );
  }

  const result = await db.transaction(async (tx) => {
    if (itemKind === "gold") {
      const char = await lockSaveForUpdate<Record<string, unknown>>(
        tx,
        userId,
        "character.v2",
        {},
      );
      const beforeBalance = intValue(char.bankedGold);
      const bankedGold = beforeBalance + quantity;
      await upsertSave(tx, userId, "character.v2", { ...char, bankedGold });
      return { beforeBalance, balance: bankedGold };
    }
    if (itemKind === "fishing_coin") {
      const wallet = await lockSaveForUpdate(tx, userId, FISHING_WALLET_KEY, {});
      const beforeBalance = fishingCoins(wallet);
      const coins = beforeBalance + quantity;
      await upsertSave(tx, userId, FISHING_WALLET_KEY, fishingWalletWithCoins(wallet, coins));
      return { beforeBalance, balance: coins };
    }
    if (itemKind === "treasure_coin") {
      const wallet = await lockSaveForUpdate<Record<string, unknown>>(
        tx,
        userId,
        TREASURE_WALLET_KEY,
        {},
      );
      const beforeBalance = treasureCoins(wallet);
      const coins = beforeBalance + quantity;
      await upsertSave(tx, userId, TREASURE_WALLET_KEY, { ...wallet, coins });
      return { beforeBalance, balance: coins };
    }
    if (itemKind === "mastery_certificate") {
      const inv = await lockSaveForUpdate<Record<string, unknown>>(
        tx,
        userId,
        "inventory.v2",
        {},
      );
      const beforeBalance = intValue(inv[MASTERY_CERTIFICATE_KEY]);
      const certificates = beforeBalance + quantity;
      await upsertSave(tx, userId, "inventory.v2", {
        ...inv,
        [MASTERY_CERTIFICATE_KEY]: certificates,
      });
      return { beforeBalance, balance: certificates };
    }
    if (itemKind === "stamina_potion") {
      const current = staminaPotionCount(
        await lockSaveForUpdate(tx, userId, STAMINA_POTIONS_KEY, { count: 0 }),
      );
      const count = current + quantity;
      await upsertSave(tx, userId, STAMINA_POTIONS_KEY, { count });
      return { beforeBalance: current, balance: count };
    }

    const char = await lockSaveForUpdate<Record<string, unknown>>(
      tx,
      userId,
      "character.v2",
      {},
    );
    const materials =
      char.materials && typeof char.materials === "object" && !Array.isArray(char.materials)
        ? { ...(char.materials as Record<string, number>) }
        : {};
    const beforeBalance = intValue(materials[itemId]);
    materials[itemId] = beforeBalance + quantity;
    await upsertSave(tx, userId, "character.v2", { ...char, materials });
    return { beforeBalance, balance: materials[itemId] };
  });

  const adminEmail = await currentAdminEmail();
  await logAdminAction({
    adminEmail,
    action: "reward.compensate",
    targetUserId: userId,
    detail: { itemKind, itemId, quantity, reason, sourceEventId },
  });
  recordEconomyEventSoon({
    userId,
    eventType: "admin.reward.compensate",
    goldDelta: itemKind === "gold" ? quantity : 0,
    itemKind,
    itemId: itemId || itemKind,
    quantity,
    detail: {
      reason,
      sourceEventId,
      beforeBalance: result.beforeBalance,
      balance: result.balance,
    },
  });
  if (sourceEventId > 0) {
    try {
      const now = new Date();
      const previous = await readRewardFailureStatuses();
      const nextById = new Map(previous.map((entry) => [entry.eventId, entry]));
      nextById.set(sourceEventId, {
        eventId: sourceEventId,
        status: "compensated",
        note: reason,
        adminEmail,
        updatedAt: now.toISOString(),
      });
      await writeRewardFailureStatuses(
        [...nextById.values()].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)),
        adminEmail,
        now,
      );
    } catch (e) {
      console.error("[reward-compensate] reward failure status update failed", e);
    }
  }

  return Response.json({ ok: true, ...result });
}

function largeThreshold(itemKind: ItemKind) {
  return itemKind === "gold" ? 100_000 : itemKind === "material" ? 5_000 : 1_000;
}

function isLargeCompensation(itemKind: ItemKind, quantity: number) {
  return quantity >= largeThreshold(itemKind);
}

function isItemKind(value: string): value is ItemKind {
  return (ITEM_KINDS as readonly string[]).includes(value);
}

function clampPositiveInt(raw: unknown, max: number, fallback = 0) {
  const value = Number(raw ?? fallback);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(max, Math.floor(value)));
}

function intValue(raw: unknown): number {
  const value = Number(raw ?? 0);
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}
