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
import { MAX_STAMINA, parseStaminaFromSave } from "@/adventure/v2/stamina";
import { kstDailyKey } from "@/adventure/data/v2/v2RepeatQuests";

const SUMMARY_KEYS = [
  "character.v2",
  "character-profile.v2",
  FISHING_WALLET_KEY,
  TREASURE_WALLET_KEY,
  "inventory.v2",
  "equipment.v2",
  "proficiency.v2",
  "v2-skills.v1",
  STAMINA_POTIONS_KEY,
] as const;
const DAY_MS = 24 * 60 * 60 * 1000;

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
  const profile = objectValue(saves.get("character-profile.v2"));
  const inventory = objectValue(saves.get("inventory.v2"));
  const equipment = objectValue(saves.get("equipment.v2"));
  const proficiency = objectValue(saves.get("proficiency.v2"));
  const skills = objectValue(saves.get("v2-skills.v1"));

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
  const snapshot = buildSnapshot({ character, profile, equipment, proficiency, skills });
  const dailyLimits = buildDailyLimits({
    fishingCatchCoins,
    eventRows,
    now: Date.now(),
  });

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
    snapshot,
    fishingCatchCoins,
    dailyLimits,
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

function buildSnapshot({
  character,
  profile,
  equipment,
  proficiency,
  skills,
}: {
  character: Record<string, unknown>;
  profile: Record<string, unknown>;
  equipment: Record<string, unknown>;
  proficiency: Record<string, unknown>;
  skills: Record<string, unknown>;
}) {
  const stamina = parseStaminaFromSave(character.stamina);
  const owned = Array.isArray(equipment.owned) ? equipment.owned : [];
  const equipped = objectValue(character.equipped);
  const equippedSlots = Object.entries(equipped)
    .flatMap(([slot, item]) => {
      const value = objectValue(item);
      const itemId = typeof value.itemId === "string" ? value.itemId : null;
      return itemId ? [{ slot, itemId }] : [];
    })
    .slice(0, 6);
  const learnedSkills = Array.isArray(skills.learned)
    ? skills.learned.filter((row): row is string => typeof row === "string")
    : [];
  const equippedSkills = Array.isArray(skills.equipped)
    ? skills.equipped.filter((row): row is string => typeof row === "string")
    : Array.isArray(character.equippedSkills)
      ? character.equippedSkills.filter((row): row is string => typeof row === "string")
      : [];
  return {
    name: typeof profile.name === "string" ? profile.name : null,
    level: intValue(character.level),
    exp: intValue(character.exp),
    hp: intValue(character.hp),
    classId: textValue(character.class) ?? textValue(character.currentClass) ?? null,
    specChoice: textValue(character.specChoice),
    guild: textValue(character.affiliation) ?? "무소속",
    stamina: {
      current: stamina.current,
      max: MAX_STAMINA,
      lastUpdatedAt: stamina.lastUpdatedAt,
    },
    equipmentCount: owned.length,
    equippedSlots,
    learnedSkillCount: learnedSkills.length,
    equippedSkills: equippedSkills.slice(0, 8),
    proficiencyTop: Object.entries(proficiency)
      .map(([key, value]) => ({ key, quantity: intValue(value) }))
      .filter((row) => row.quantity > 0)
      .sort((a, b) => b.quantity - a.quantity || a.key.localeCompare(b.key))
      .slice(0, 6),
  };
}

function buildDailyLimits({
  fishingCatchCoins,
  eventRows,
  now,
}: {
  fishingCatchCoins: { earned: number; cap: number };
  eventRows: Array<{
    eventType: string;
    itemKind: string | null;
    quantity: number | null;
    createdAt: Date;
  }>;
  now: number;
}) {
  const dayRows = eventRows.filter((row) => now - row.createdAt.getTime() <= DAY_MS);
  const compensations = dayRows.filter((row) => row.eventType === "admin.reward.compensate");
  return [
    {
      key: "fishing_catch_coin",
      label: "낚시 챔질 코인",
      earned: fishingCatchCoins.earned,
      cap: fishingCatchCoins.cap,
      remaining: Math.max(0, fishingCatchCoins.cap - fishingCatchCoins.earned),
      status:
        fishingCatchCoins.earned >= fishingCatchCoins.cap
          ? ("capped" as const)
          : fishingCatchCoins.earned >= fishingCatchCoins.cap * 0.8
            ? ("near" as const)
            : ("ok" as const),
    },
    {
      key: "admin_compensation",
      label: "24시간 보정 지급",
      earned: compensations.length,
      cap: 3,
      remaining: Math.max(0, 3 - compensations.length),
      status:
        compensations.length >= 3
          ? ("capped" as const)
          : compensations.length >= 2
            ? ("near" as const)
            : ("ok" as const),
    },
    {
      key: "reward_failures",
      label: "24시간 보상 실패",
      earned: dayRows.filter((row) => row.eventType.startsWith("reward.failure.")).length,
      cap: 1,
      remaining: 0,
      status: dayRows.some((row) => row.eventType.startsWith("reward.failure."))
        ? ("near" as const)
        : ("ok" as const),
    },
  ];
}

function textValue(raw: unknown) {
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}
