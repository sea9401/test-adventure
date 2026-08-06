import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { guildActivityLog, guildMembers, savesKv } from "@/db/schema";
import { V2_MATERIALS } from "@/adventure/data/v2/dungeonDrops";
import { guildWarehouseUpgradeForLevel } from "@/adventure/data/v2/settlement";
import {
  V2_EQUIPMENT,
  genEquipIid,
  parseEquipmentSave,
  type EquipmentSave,
  type V2EquipInstance,
} from "@/adventure/data/v2/v2Equipment";
import { ensureUser } from "@/lib/server/ensureUser";
import { isGuildAdmin } from "@/lib/server/guildAdmin";
import { logGuildActivity } from "@/lib/server/guildActivityLog";
import { readGuildFacilityLevel } from "@/lib/server/guildFacilities";
import {
  guildWarehouseUsedSlots,
  hasGuildWarehousePermission,
  isGuildWarehouseMaterialId,
  lockGuildWarehouse,
  readGuildWarehouse,
  readGuildWarehousePermissionUserIds,
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
type WarehouseKind = "material" | "equipment";

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

async function canTransferWarehouse(
  tx: typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0],
  guildId: number,
  userId: string,
): Promise<{ canTransfer: boolean; canManagePermissions: boolean }> {
  const canManagePermissions = await isGuildAdmin(tx, guildId, userId);
  return {
    canManagePermissions,
    canTransfer:
      canManagePermissions ||
      (await hasGuildWarehousePermission(tx, guildId, userId)),
  };
}

function uniqueEquipmentIid(
  equipment: V2EquipInstance,
  usedIids: ReadonlySet<string>,
): V2EquipInstance {
  if (!usedIids.has(equipment.iid)) return equipment;
  let iid = genEquipIid();
  while (usedIids.has(iid)) iid = genEquipIid();
  return { ...equipment, iid };
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

  const [
    character,
    equipmentSave,
    warehouse,
    access,
    permissionUserIds,
    memberRows,
    activityRows,
  ] = await Promise.all([
    readSave<CharacterSave>(db, userId, "character.v2", {}),
    readSave<EquipmentSave>(db, userId, "equipment.v2", {}),
    readGuildWarehouse(db, guildId),
    canTransferWarehouse(db, guildId, userId),
    readGuildWarehousePermissionUserIds(db, guildId),
    db
      .select({ userId: guildMembers.userId, role: guildMembers.role })
      .from(guildMembers)
      .where(eq(guildMembers.guildId, guildId)),
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

  const profileUserIds = Array.from(
    new Set([
      ...memberRows.map((row) => row.userId),
      ...activityRows
        .map((row) => row.actorUserId)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ]),
  );
  const profileRows =
    profileUserIds.length === 0
      ? []
      : await db
          .select({ userId: savesKv.userId, value: savesKv.value })
          .from(savesKv)
          .where(
            and(
              inArray(savesKv.userId, profileUserIds),
              eq(savesKv.key, "character-profile.v2"),
            ),
          );
  const names = new Map(
    profileRows.map((row) => {
      const profile = row.value as { name?: unknown } | null;
      const name =
        typeof profile?.name === "string" && profile.name.trim().length > 0
          ? profile.name.trim()
          : "모험가";
      return [row.userId, name] as const;
    }),
  );
  const personalEquipment = parseEquipmentSave(equipmentSave);
  const permissionSet = new Set(permissionUserIds);
  const capacity = guildWarehouseUpgradeForLevel(level).capacity;

  return Response.json({
    ok: true,
    level,
    capacity,
    used: guildWarehouseUsedSlots(warehouse),
    ...access,
    personalMaterials: parsePersonalMaterials(character.materials),
    personalEquipment: personalEquipment.owned,
    equippedIids: Object.values(personalEquipment.equipped),
    warehouse: warehouse.materials,
    equipment: warehouse.equipment,
    members: memberRows.map((row) => ({
      userId: row.userId,
      name: names.get(row.userId) ?? "모험가",
      role: row.role,
      allowed: permissionSet.has(row.userId),
    })),
    activity: activityRows.map((row) => ({
      id: row.id,
      action: row.type === "warehouse_withdraw" ? "withdraw" : "deposit",
      actorName: row.actorUserId
        ? (names.get(row.actorUserId) ?? "모험가")
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

  let body: {
    action?: unknown;
    kind?: unknown;
    materialId?: unknown;
    quantity?: unknown;
    iid?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const action = body.action;
  const kind = body.kind ?? "material";
  if (
    (action !== "deposit" && action !== "withdraw") ||
    (kind !== "material" && kind !== "equipment")
  ) {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }
  const materialId = body.materialId;
  const quantity = Number(body.quantity);
  const iid = body.iid;
  if (
    (kind === "material" &&
      (!isGuildWarehouseMaterialId(materialId) ||
        !Number.isSafeInteger(quantity) ||
        quantity <= 0)) ||
    (kind === "equipment" &&
      (typeof iid !== "string" || iid.length <= 0))
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
      const access = await canTransferWarehouse(tx, guildId, userId);
      if (!access.canTransfer) {
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

      if (kind === "material") {
        const character = await lockSaveForUpdate<CharacterSave>(
          tx,
          userId,
          "character.v2",
          {},
        );
        const personalMaterials = personalMaterialRecord(character.materials);
        const warehouse = await lockGuildWarehouse(tx, guildId);
        const safeMaterialId = materialId as string;

        if (action === "deposit") {
          const owned = personalMaterialCount(personalMaterials, safeMaterialId);
          if (owned < quantity) {
            return {
              status: 409,
              body: { ok: false as const, error: "insufficient_material", owned },
            };
          }
          const used = guildWarehouseUsedSlots(warehouse);
          const usesNewSlot = (warehouse.materials[safeMaterialId] ?? 0) <= 0;
          if (usesNewSlot && used >= capacity) {
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
          personalMaterials[safeMaterialId] = owned - quantity;
          if (Number(personalMaterials[safeMaterialId]) <= 0) {
            delete personalMaterials[safeMaterialId];
          }
          warehouse.materials[safeMaterialId] =
            (warehouse.materials[safeMaterialId] ?? 0) + quantity;
        } else {
          const stored = warehouse.materials[safeMaterialId] ?? 0;
          if (stored < quantity) {
            return {
              status: 409,
              body: { ok: false as const, error: "insufficient_stock", stored },
            };
          }
          warehouse.materials[safeMaterialId] = stored - quantity;
          if (warehouse.materials[safeMaterialId] <= 0) {
            delete warehouse.materials[safeMaterialId];
          }
          const owned = personalMaterialCount(personalMaterials, safeMaterialId);
          if (!Number.isSafeInteger(owned + quantity)) {
            return {
              status: 409,
              body: { ok: false as const, error: "inventory_overflow" },
            };
          }
          personalMaterials[safeMaterialId] = owned + quantity;
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
            itemKind: "material",
            materialId: safeMaterialId,
            itemName: V2_MATERIALS[safeMaterialId].name,
            quantity,
          },
        });
        return {
          status: 200,
          body: {
            ok: true as const,
            action: action as WarehouseAction,
            kind: kind as WarehouseKind,
            level,
            capacity,
            used: guildWarehouseUsedSlots(warehouse),
            personalMaterials: parsePersonalMaterials(personalMaterials),
            warehouse: warehouse.materials,
            equipment: warehouse.equipment,
          },
        };
      }

      const equipmentSave = await lockSaveForUpdate<EquipmentSave>(
        tx,
        userId,
        "equipment.v2",
        {},
      );
      const personalEquipment = parseEquipmentSave(equipmentSave);
      const warehouse = await lockGuildWarehouse(tx, guildId);
      let moved: V2EquipInstance;

      if (action === "deposit") {
        const found = personalEquipment.owned.find((item) => item.iid === iid);
        if (!found) {
          return {
            status: 409,
            body: { ok: false as const, error: "equipment_not_owned" },
          };
        }
        if (Object.values(personalEquipment.equipped).includes(found.iid)) {
          return {
            status: 409,
            body: { ok: false as const, error: "equipment_equipped" },
          };
        }
        const used = guildWarehouseUsedSlots(warehouse);
        if (used >= capacity) {
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
        moved = uniqueEquipmentIid(
          found,
          new Set(warehouse.equipment.map((item) => item.iid)),
        );
        personalEquipment.owned = personalEquipment.owned.filter(
          (item) => item.iid !== found.iid,
        );
        warehouse.equipment.push(moved);
      } else {
        const found = warehouse.equipment.find((item) => item.iid === iid);
        if (!found) {
          return {
            status: 409,
            body: { ok: false as const, error: "equipment_not_stored" },
          };
        }
        moved = uniqueEquipmentIid(
          found,
          new Set(personalEquipment.owned.map((item) => item.iid)),
        );
        warehouse.equipment = warehouse.equipment.filter(
          (item) => item.iid !== found.iid,
        );
        personalEquipment.owned.push(moved);
      }

      await upsertSave(tx, userId, "equipment.v2", personalEquipment);
      await upsertGuildWarehouse(tx, guildId, warehouse);
      await logGuildActivity(tx, {
        guildId,
        type: action === "deposit" ? "warehouse_deposit" : "warehouse_withdraw",
        actorUserId: userId,
        meta: {
          itemKind: "equipment",
          equipmentIid: moved.iid,
          itemName: V2_EQUIPMENT[moved.id].name,
          quantity: 1,
        },
      });
      return {
        status: 200,
        body: {
          ok: true as const,
          action: action as WarehouseAction,
          kind: kind as WarehouseKind,
          level,
          capacity,
          used: guildWarehouseUsedSlots(warehouse),
          personalEquipment: personalEquipment.owned,
          equippedIids: Object.values(personalEquipment.equipped),
          warehouse: warehouse.materials,
          equipment: warehouse.equipment,
        },
      };
    });
    return Response.json(result.body, { status: result.status });
  } catch (error) {
    console.error("[guild.warehouse] failed", error);
    return Response.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
