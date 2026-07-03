import { db } from "@/db";
import { logAdminAction } from "@/lib/server/adminAudit";
import { recordEconomyEventSoon } from "@/lib/server/economyLog";
import { currentAdminEmail, requireAdmin } from "@/lib/server/isAdmin";
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

export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (gate) return gate;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const userId = typeof body?.userId === "string" ? body.userId.trim() : "";
  const itemKind = typeof body?.itemKind === "string" ? body.itemKind.trim() : "";
  const itemId = typeof body?.itemId === "string" ? body.itemId.trim() : "";
  const quantity = clampPositiveInt(body?.quantity, 1_000_000_000);
  const reason = typeof body?.reason === "string" ? body.reason.trim().slice(0, 500) : "";
  const sourceEventId = clampPositiveInt(body?.sourceEventId, 2_147_483_647, 0);

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

  const result = await db.transaction(async (tx) => {
    if (itemKind === "gold") {
      const char = await lockSaveForUpdate<Record<string, unknown>>(
        tx,
        userId,
        "character.v2",
        {},
      );
      const bankedGold = intValue(char.bankedGold) + quantity;
      await upsertSave(tx, userId, "character.v2", { ...char, bankedGold });
      return { balance: bankedGold };
    }
    if (itemKind === "fishing_coin") {
      const wallet = await lockSaveForUpdate(tx, userId, FISHING_WALLET_KEY, {});
      const coins = fishingCoins(wallet) + quantity;
      await upsertSave(tx, userId, FISHING_WALLET_KEY, fishingWalletWithCoins(wallet, coins));
      return { balance: coins };
    }
    if (itemKind === "treasure_coin") {
      const wallet = await lockSaveForUpdate<Record<string, unknown>>(
        tx,
        userId,
        TREASURE_WALLET_KEY,
        {},
      );
      const coins = treasureCoins(wallet) + quantity;
      await upsertSave(tx, userId, TREASURE_WALLET_KEY, { ...wallet, coins });
      return { balance: coins };
    }
    if (itemKind === "mastery_certificate") {
      const inv = await lockSaveForUpdate<Record<string, unknown>>(
        tx,
        userId,
        "inventory.v2",
        {},
      );
      const certificates = intValue(inv[MASTERY_CERTIFICATE_KEY]) + quantity;
      await upsertSave(tx, userId, "inventory.v2", {
        ...inv,
        [MASTERY_CERTIFICATE_KEY]: certificates,
      });
      return { balance: certificates };
    }
    if (itemKind === "stamina_potion") {
      const current = staminaPotionCount(
        await lockSaveForUpdate(tx, userId, STAMINA_POTIONS_KEY, { count: 0 }),
      );
      const count = current + quantity;
      await upsertSave(tx, userId, STAMINA_POTIONS_KEY, { count });
      return { balance: count };
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
    materials[itemId] = intValue(materials[itemId]) + quantity;
    await upsertSave(tx, userId, "character.v2", { ...char, materials });
    return { balance: materials[itemId] };
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
    detail: { reason, sourceEventId, balance: result.balance },
  });

  return Response.json({ ok: true, ...result });
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
