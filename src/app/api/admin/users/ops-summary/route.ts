import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { economyEvents, savesKv } from "@/db/schema";
import { requireAdmin } from "@/lib/server/isAdmin";
import {
  FISHING_WALLET_KEY,
  fishingCatchCoinProgress,
  walletCoins as fishingCoins,
} from "@/lib/server/fishing/coins";
import { TREASURE_WALLET_KEY, walletCoins as treasureCoins } from "@/lib/server/treasure/coins";
import { MASTERY_CERTIFICATE_KEY } from "@/adventure/data/v2/masteryTower";
import { STAMINA_POTIONS_KEY, staminaPotionCount } from "@/adventure/v2/staminaPotions";
import { kstDailyKey } from "@/adventure/data/v2/v2RepeatQuests";

const SUMMARY_KEYS = [
  "character.v2",
  FISHING_WALLET_KEY,
  TREASURE_WALLET_KEY,
  "inventory.v2",
  "equipment.v2",
  STAMINA_POTIONS_KEY,
] as const;

export async function GET(req: Request) {
  const gate = await requireAdmin();
  if (gate) return gate;

  const userId = new URL(req.url).searchParams.get("userId")?.trim();
  if (!userId) {
    return Response.json({ ok: false, error: "missing_user" }, { status: 400 });
  }

  const [saveRows, eventRows] = await Promise.all([
    db
      .select({ key: savesKv.key, value: savesKv.value, updatedAt: savesKv.updatedAt })
      .from(savesKv)
      .where(and(eq(savesKv.userId, userId)))
      .limit(200),
    db
      .select({
        id: economyEvents.id,
        eventType: economyEvents.eventType,
        goldDelta: economyEvents.goldDelta,
        itemKind: economyEvents.itemKind,
        itemId: economyEvents.itemId,
        quantity: economyEvents.quantity,
        detail: economyEvents.detail,
        createdAt: economyEvents.createdAt,
      })
      .from(economyEvents)
      .where(eq(economyEvents.userId, userId))
      .orderBy(desc(economyEvents.id))
      .limit(300),
  ]);

  const saves = new Map(saveRows.map((row) => [row.key, row.value]));
  const character = objectValue(saves.get("character.v2"));
  const inventory = objectValue(saves.get("inventory.v2"));
  const equipment = objectValue(saves.get("equipment.v2"));

  const summary = {
    gold: intValue(character.gold),
    bankedGold: intValue(character.bankedGold),
    fishingCoins: fishingCoins(saves.get(FISHING_WALLET_KEY)),
    treasureCoins: treasureCoins(saves.get(TREASURE_WALLET_KEY)),
    masteryCertificates: intValue(inventory[MASTERY_CERTIFICATE_KEY]),
    staminaPotions: staminaPotionCount(saves.get(STAMINA_POTIONS_KEY)),
  };
  const fishingCatchCoins = fishingCatchCoinProgress(
    saves.get(FISHING_WALLET_KEY),
    kstDailyKey(new Date()),
  );
  const inventorySummary = summarizeInventory({ character, inventory, equipment });

  const rewardHistory = eventRows
    .filter((row) => row.eventType.startsWith("reward."))
    .slice(0, 50);
  const proficiencyHistory = eventRows
    .filter(
      (row) =>
        row.itemKind === "proficiency" ||
        row.itemKind === "mastery" ||
        row.itemKind === "mastery_certificate" ||
        row.eventType.includes("training") ||
        row.eventType.includes("mastery"),
    )
    .slice(0, 50);

  return Response.json({
    ok: true,
    userId,
    summary,
    fishingCatchCoins,
    inventorySummary,
    trackedKeys: saveRows
      .filter((row) => SUMMARY_KEYS.includes(row.key as (typeof SUMMARY_KEYS)[number]))
      .map((row) => ({
        key: row.key,
        updatedAt: row.updatedAt.toISOString(),
      })),
    rewardHistory,
    recentCompensations: eventRows
      .filter((row) => row.eventType === "admin.reward.compensate")
      .slice(0, 20),
    proficiencyHistory,
    recentEconomy: eventRows.slice(0, 50),
  });
}

function objectValue(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
}

function intValue(raw: unknown): number {
  const value = Number(raw ?? 0);
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function summarizeInventory({
  character,
  inventory,
  equipment,
}: {
  character: Record<string, unknown>;
  inventory: Record<string, unknown>;
  equipment: Record<string, unknown>;
}) {
  const materials = objectValue(character.materials);
  const rareMaps = Array.isArray(character.rareMaps) ? character.rareMaps.length : 0;
  const owned = Array.isArray(equipment.owned) ? equipment.owned : [];
  const entries = Object.entries(inventory)
    .map(([key, value]) => [key, intValue(value)] as const)
    .filter(([, value]) => value > 0);
  const coopBoxes = entries.filter(([key]) => key.includes("coop") && key.includes("box"));
  const coopMasteryTomes = entries.filter(
    ([key]) => key.includes("coop") && key.includes("mastery"),
  );
  const spFruits = entries.filter(
    ([key]) => key.includes("sp") && (key.includes("fruit") || key.includes("열매")),
  );
  return {
    equipmentCount: owned.length,
    materialTop: Object.entries(materials)
      .map(([key, value]) => ({ key, quantity: intValue(value) }))
      .filter((row) => row.quantity > 0)
      .sort((a, b) => b.quantity - a.quantity || a.key.localeCompare(b.key))
      .slice(0, 8),
    rareMapCount: rareMaps,
    coopBoxes: coopBoxes.map(([key, quantity]) => ({ key, quantity })),
    coopMasteryTomes: coopMasteryTomes.map(([key, quantity]) => ({
      key,
      quantity,
    })),
    spFruits: spFruits.map(([key, quantity]) => ({ key, quantity })),
  };
}
