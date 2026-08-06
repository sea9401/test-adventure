import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { guildActivityLog, guildMembers, savesKv } from "@/db/schema";
import { V2_MATERIALS } from "@/adventure/data/v2/dungeonDrops";
import { guildWarehouseUpgradeForLevel } from "@/adventure/data/v2/settlement";
import { ensureUser } from "@/lib/server/ensureUser";
import { isGuildAdmin } from "@/lib/server/guildAdmin";
import { logGuildActivity } from "@/lib/server/guildActivityLog";
import { readGuildFacilityLevel } from "@/lib/server/guildFacilities";
import {
  guildWarehouseUsed,
  isGuildWarehouseMaterialId,
  lockGuildWarehouse,
  readGuildWarehouse,
  upsertGuildWarehouse,
} from "@/lib/server/guildWarehouse";
import { lockSaveForUpdate, readSave, upsertSave } from "@/lib/server/savesKv";
import { getGuildId } from "@/lib/server/v2EnsureSoloGuild";
import { lockGuildSettlementBuilding } from "@/lib/server/v2Settlement";

type CharacterSave = {
  materials?: Record<string, number>;
  [key: string]: unknown;
};

type WarehouseAction = "deposit" | "withdraw";

function parsePersonalMaterials(value: unknown): Record<string, number> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }
  const materials: Record<string, number> = {};
  for (const [materialId, rawCount] of Object.entries(value)) {
    if (!isGuildWarehouseMaterialId(materialId)) continue;
    const count = Math.floor(Number(rawCount));
    if (Number.isSafeInteger(count) && count > 0) materials[materialId] = count;
  }
  return materials;
}

function personalMaterialRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

function personalMaterialCount(
  materials: Record<string, unknown>,
  materialId: string,
): number {
  const count = Math.floor(Number(materials[materialId]));
  return Number.isSafeInteger(count) && count > 0 ? count : 0;
}

export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const member = (
    await db
      .select({ guildId: guildMembers.guildId })
      .from(guildMembers)
      .where(eq(guildMembers.userId, userId))
      .limit(1)
  )[0];
  if (!member) {
    return Response.json({ ok: false, error: "no_guild" }, { status: 403 });
  }

  const guildId = member.guildId;
  const level = await readGuildFacilityLevel(db, guildId, "guild_warehouse");
  if (level <= 0) {
    return Response.json(
      { ok: false, error: "warehouse_required" },
      { status: 409 },
    );
  }

  const [character, warehouse, canWithdraw, activityRows] = await Promise.all([
    readSave<CharacterSave>(db, userId, "character.v2", {}),
    readGuildWarehouse(db, guildId),
    isGuildAdmin(db, guildId, userId),
    db
      .select({
        id: guildActivityLog.id,
        type: guildActivityLog.type,
        actorUserId: guildActivityLog.actorUserId,
        meta: guildActivityLog.meta,
        createdAt: guildActivityLog.createdAt,
      })
      .from(guildActivityLog)
      .where(
        and(
          eq(guildActivityLog.guildId, guildId),
          inArray(guildActivityLog.type, [
            "warehouse_deposit",
            "warehouse_withdraw",
          ]),
        ),
      )
      .orderBy(desc(guildActivityLog.createdAt))
      .limit(20),
  ]);

  const actorIds = Array.from(
    new Set(
      activityRows
        .map((row) => row.actorUserId)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  );
  const profileRows =
    actorIds.length === 0
      ? []
      : await db
          .select({ userId: savesKv.userId, value: savesKv.value })
          .from(savesKv)
          .where(
            and(
              inArray(savesKv.userId, actorIds),
              eq(savesKv.key, "character-profile.v2"),
            ),
          );
  const actorNames = new Map(
    profileRows.map((row) => {
      const profile = row.value as { name?: unknown } | null;
      const name =
        typeof profile?.name === "string" && profile.name.trim().length > 0
          ? profile.name.trim()
          : "모험가";
      return [row.userId, name] as const;
    }),
  );
  const capacity = guildWarehouseUpgradeForLevel(level).capacity;

  return Response.json({
    ok: true,
    level,
    capacity,
    used: guildWarehouseUsed(warehouse),
    canWithdraw,
    personalMaterials: parsePersonalMaterials(character.materials),
    warehouse,
    activity: activityRows.map((row) => ({
      id: row.id,
      action: row.type === "warehouse_withdraw" ? "withdraw" : "deposit",
      actorName: row.actorUserId
        ? (actorNames.get(row.actorUserId) ?? "모험가")
        : "모험가",
      meta: row.meta,
      createdAt: row.createdAt,
    })),
  });
}

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { action?: unknown; materialId?: unknown; quantity?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const action = body.action;
  const materialId = body.materialId;
  const quantity = Number(body.quantity);
  if (
    (action !== "deposit" && action !== "withdraw") ||
    !isGuildWarehouseMaterialId(materialId) ||
    !Number.isSafeInteger(quantity) ||
    quantity <= 0
  ) {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  try {
    const result = await db.transaction(async (tx) => {
      const guildId = await getGuildId(tx, userId);
      if (guildId == null) {
        return { status: 403, body: { ok: false as const, error: "no_guild" } };
      }
      const location = await lockGuildSettlementBuilding(
        tx,
        guildId,
        "guild_warehouse",
      );
      if (!location) {
        return {
          status: 409,
          body: { ok: false as const, error: "warehouse_required" },
        };
      }
      if (action === "withdraw" && !(await isGuildAdmin(tx, guildId, userId))) {
        return {
          status: 403,
          body: { ok: false as const, error: "not_authorized" },
        };
      }

      const level = Math.max(
        1,
        Math.floor(Number(location.village.buildings[location.slot]?.level) || 1),
      );
      const capacity = guildWarehouseUpgradeForLevel(level).capacity;
      const character = await lockSaveForUpdate<CharacterSave>(
        tx,
        userId,
        "character.v2",
        {},
      );
      const personalMaterials = personalMaterialRecord(character.materials);
      const warehouse = await lockGuildWarehouse(tx, guildId);

      if (action === "deposit") {
        const owned = personalMaterialCount(personalMaterials, materialId);
        if (owned < quantity) {
          return {
            status: 409,
            body: { ok: false as const, error: "insufficient_material", owned },
          };
        }
        const used = guildWarehouseUsed(warehouse);
        if (used + quantity > capacity) {
          return {
            status: 409,
            body: {
              ok: false as const,
              error: "capacity_exceeded",
              capacity,
              available: Math.max(0, capacity - used),
            },
          };
        }
        personalMaterials[materialId] = owned - quantity;
        if (Number(personalMaterials[materialId]) <= 0) {
          delete personalMaterials[materialId];
        }
        warehouse[materialId] = (warehouse[materialId] ?? 0) + quantity;
      } else {
        const stored = warehouse[materialId] ?? 0;
        if (stored < quantity) {
          return {
            status: 409,
            body: { ok: false as const, error: "insufficient_stock", stored },
          };
        }
        warehouse[materialId] = stored - quantity;
        if (warehouse[materialId] <= 0) delete warehouse[materialId];
        const owned = personalMaterialCount(personalMaterials, materialId);
        if (!Number.isSafeInteger(owned + quantity)) {
          return {
            status: 409,
            body: { ok: false as const, error: "inventory_overflow" },
          };
        }
        personalMaterials[materialId] = owned + quantity;
      }

      await upsertSave(tx, userId, "character.v2", {
        ...character,
        materials: personalMaterials,
      });
      await upsertGuildWarehouse(tx, guildId, warehouse);
      await logGuildActivity(tx, {
        guildId,
        type: action === "deposit" ? "warehouse_deposit" : "warehouse_withdraw",
        actorUserId: userId,
        meta: {
          materialId,
          itemName: V2_MATERIALS[materialId].name,
          quantity,
        },
      });

      return {
        status: 200,
        body: {
          ok: true as const,
          action: action as WarehouseAction,
          level,
          capacity,
          used: guildWarehouseUsed(warehouse),
          personalMaterials: parsePersonalMaterials(personalMaterials),
          warehouse,
        },
      };
    });
    return Response.json(result.body, { status: result.status });
  } catch (error) {
    console.error("[guild.warehouse] failed", error);
    return Response.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
