import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  adminAuditLog,
  economyEvents,
  opsSettings,
  savesKv,
  userSanctions,
} from "@/db/schema";
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
const OPS_NOTE_KEY_PREFIX = "ops-user-notes.v1:";

export async function GET(req: Request) {
  const gate = await requireAdmin();
  if (gate) return gate;

  const userId = new URL(req.url).searchParams.get("userId")?.trim();
  if (!userId) {
    return Response.json({ ok: false, error: "missing_user" }, { status: 400 });
  }

  const [saveRows, eventRows, auditRows, sanctionRows, noteRow] = await Promise.all([
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
    db
      .select({
        id: adminAuditLog.id,
        adminEmail: adminAuditLog.adminEmail,
        action: adminAuditLog.action,
        detail: adminAuditLog.detail,
        createdAt: adminAuditLog.createdAt,
      })
      .from(adminAuditLog)
      .where(eq(adminAuditLog.targetUserId, userId))
      .orderBy(desc(adminAuditLog.id))
      .limit(80),
    db
      .select({
        id: userSanctions.id,
        type: userSanctions.type,
        reason: userSanctions.reason,
        expiresAt: userSanctions.expiresAt,
        createdByEmail: userSanctions.createdByEmail,
        createdAt: userSanctions.createdAt,
        liftedAt: userSanctions.liftedAt,
        liftedByEmail: userSanctions.liftedByEmail,
      })
      .from(userSanctions)
      .where(eq(userSanctions.userId, userId))
      .orderBy(desc(userSanctions.id))
      .limit(50),
    db
      .select({ value: opsSettings.value })
      .from(opsSettings)
      .where(eq(opsSettings.key, `${OPS_NOTE_KEY_PREFIX}${userId}`))
      .limit(1),
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
  const economySnapshot = buildEconomySnapshot(eventRows, Date.now());
  const timeline = buildTimeline({
    eventRows,
    auditRows,
    sanctionRows,
    notes: parseOpsNotes(noteRow[0]?.value),
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
    economySnapshot,
    timeline,
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

type OpsNote = {
  id: string;
  text: string;
  status: "open" | "resolved";
  createdByEmail: string;
  createdAt: string;
  updatedByEmail: string | null;
  updatedAt: string | null;
};

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

function buildEconomySnapshot(
  eventRows: Array<{
    eventType: string;
    goldDelta: number;
    itemKind: string | null;
    quantity: number | null;
    createdAt: Date;
  }>,
  now: number,
) {
  const dayRows = eventRows.filter((row) => now - row.createdAt.getTime() <= DAY_MS);
  const goldIn = dayRows.reduce((sum, row) => sum + Math.max(0, row.goldDelta), 0);
  const goldOut = dayRows.reduce((sum, row) => sum + Math.max(0, -row.goldDelta), 0);
  const itemIn = dayRows.reduce(
    (sum, row) => sum + (row.goldDelta === 0 ? Math.max(0, row.quantity ?? 0) : 0),
    0,
  );
  const byEvent = topCounts(dayRows.map((row) => row.eventType), 8);
  const byItem = topCounts(dayRows.flatMap((row) => (row.itemKind ? [row.itemKind] : [])), 8);
  return {
    goldIn24h: goldIn,
    goldOut24h: goldOut,
    goldNet24h: goldIn - goldOut,
    itemIn24h: itemIn,
    compensationCount24h: dayRows.filter((row) => row.eventType === "admin.reward.compensate")
      .length,
    rewardFailureCount24h: dayRows.filter((row) => row.eventType.startsWith("reward.failure."))
      .length,
    topEvents24h: byEvent,
    topItems24h: byItem,
  };
}

function buildTimeline({
  eventRows,
  auditRows,
  sanctionRows,
  notes,
}: {
  eventRows: Array<{
    id: number;
    eventType: string;
    goldDelta: number;
    itemKind: string | null;
    itemId: string | null;
    quantity: number | null;
    createdAt: Date;
  }>;
  auditRows: Array<{
    id: number;
    adminEmail: string;
    action: string;
    detail: unknown;
    createdAt: Date;
  }>;
  sanctionRows: Array<{
    id: number;
    type: string;
    reason: string;
    expiresAt: Date | null;
    createdByEmail: string;
    createdAt: Date;
    liftedAt: Date | null;
    liftedByEmail: string | null;
  }>;
  notes: OpsNote[];
}) {
  const noteItems = notes.map((note) => ({
    id: `note:${note.id}`,
    type: "note" as const,
    tone: note.status === "open" ? ("warning" as const) : ("info" as const),
    title: note.status === "open" ? "열린 운영 메모" : "처리된 운영 메모",
    summary: note.text,
    actor: note.createdByEmail,
    createdAt: note.createdAt,
  }));
  const auditItems = auditRows.map((row) => ({
    id: `audit:${row.id}`,
    type: "audit" as const,
    tone: row.action.startsWith("reward.") ? ("warning" as const) : ("info" as const),
    title: row.action,
    summary: summarizeAuditDetail(row.detail),
    actor: row.adminEmail,
    createdAt: row.createdAt.toISOString(),
  }));
  const sanctionItems = sanctionRows.flatMap((row) => {
    const created = {
      id: `sanction:${row.id}`,
      type: "sanction" as const,
      tone: "danger" as const,
      title: `제재 ${row.type}`,
      summary: [
        row.reason,
        row.expiresAt ? `만료 ${row.expiresAt.toISOString()}` : null,
      ].filter(Boolean).join(" · "),
      actor: row.createdByEmail,
      createdAt: row.createdAt.toISOString(),
    };
    if (!row.liftedAt) return [created];
    return [
      created,
      {
        id: `sanction-lift:${row.id}`,
        type: "sanction" as const,
        tone: "info" as const,
        title: `제재 해제 ${row.type}`,
        summary: row.reason,
        actor: row.liftedByEmail ?? "unknown",
        createdAt: row.liftedAt.toISOString(),
      },
    ];
  });
  const economyItems = eventRows
    .filter(
      (row) =>
        row.eventType.startsWith("reward.") ||
        row.eventType === "admin.reward.compensate" ||
        Math.abs(row.goldDelta) >= 50_000 ||
        (row.quantity ?? 0) >= 1_000,
    )
    .slice(0, 80)
    .map((row) => ({
      id: `economy:${row.id}`,
      type: "economy" as const,
      tone: row.eventType.startsWith("reward.failure.")
        ? ("danger" as const)
        : row.eventType === "admin.reward.compensate"
          ? ("warning" as const)
          : ("info" as const),
      title: row.eventType,
      summary: summarizeEconomyRow(row),
      actor: null,
      createdAt: row.createdAt.toISOString(),
    }));
  return [...noteItems, ...auditItems, ...sanctionItems, ...economyItems]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 80);
}

function parseOpsNotes(raw: unknown): OpsNote[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((row): OpsNote[] => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return [];
    const value = row as Partial<OpsNote>;
    if (typeof value.id !== "string" || typeof value.text !== "string") return [];
    return [
      {
        id: value.id,
        text: value.text.slice(0, 1_000),
        status: value.status === "resolved" ? "resolved" : "open",
        createdByEmail:
          typeof value.createdByEmail === "string" ? value.createdByEmail : "unknown",
        createdAt:
          typeof value.createdAt === "string" ? value.createdAt : new Date(0).toISOString(),
        updatedByEmail:
          typeof value.updatedByEmail === "string" ? value.updatedByEmail : null,
        updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : null,
      },
    ];
  });
}

function summarizeAuditDetail(raw: unknown) {
  const detail = objectValue(raw);
  const parts = [
    textValue(detail.itemKind),
    intValue(detail.quantity) > 0 ? intValue(detail.quantity).toLocaleString() : null,
    textValue(detail.reason),
    textValue(detail.adminMemo),
  ].filter(Boolean);
  return parts.join(" · ");
}

function summarizeEconomyRow(row: {
  goldDelta: number;
  itemKind: string | null;
  itemId: string | null;
  quantity: number | null;
}) {
  if (row.goldDelta !== 0) {
    return `골드 ${row.goldDelta > 0 ? "+" : ""}${row.goldDelta.toLocaleString()}`;
  }
  return [
    row.itemKind,
    row.itemId,
    row.quantity != null ? row.quantity.toLocaleString() : null,
  ].filter(Boolean).join(" · ");
}

function topCounts(values: string[], limit: number) {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
    .slice(0, limit);
}

function textValue(raw: unknown) {
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}
