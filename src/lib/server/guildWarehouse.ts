import { and, eq } from "drizzle-orm";
import type { db as dbType } from "@/db";
import {
  guildWarehousePermissions,
  v2GuildResources,
} from "@/db/schema";
import { V2_MATERIALS } from "@/adventure/data/v2/dungeonDrops";
import {
  parseEquipmentSave,
  type V2EquipInstance,
} from "@/adventure/data/v2/v2Equipment";

type Tx = Parameters<Parameters<typeof dbType.transaction>[0]>[0];
type QueryDb = Tx | typeof dbType;

export type GuildWarehouseInventory = Record<string, number>;
export type GuildWarehouseState = {
  materials: GuildWarehouseInventory;
  equipment: V2EquipInstance[];
};

export function isGuildWarehouseMaterialId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(V2_MATERIALS, value)
  );
}

export function parseGuildWarehouseInventory(
  value: unknown,
): GuildWarehouseInventory {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }
  const inventory: GuildWarehouseInventory = {};
  for (const [materialId, rawCount] of Object.entries(value)) {
    if (!isGuildWarehouseMaterialId(materialId)) continue;
    const count = Math.floor(Number(rawCount));
    if (Number.isSafeInteger(count) && count > 0) {
      inventory[materialId] = count;
    }
  }
  return inventory;
}

export function parseGuildWarehouseState(value: unknown): GuildWarehouseState {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { materials: {}, equipment: [] };
  }
  const raw = value as Record<string, unknown>;
  // 0146 최초 버전의 flat 재료 맵도 비파괴로 읽는다.
  const materials = Object.prototype.hasOwnProperty.call(raw, "materials")
    ? parseGuildWarehouseInventory(raw.materials)
    : parseGuildWarehouseInventory(raw);
  const equipment = parseEquipmentSave({ owned: raw.equipment }).owned;
  return { materials, equipment };
}

export function guildWarehouseUsedSlots(
  warehouse: GuildWarehouseState,
): number {
  return Object.keys(warehouse.materials).length + warehouse.equipment.length;
}

async function ensureGuildResourceRow(
  tx: Tx,
  guildId: number,
): Promise<void> {
  await tx
    .insert(v2GuildResources)
    .values({ guildId })
    .onConflictDoNothing();
}

export async function lockGuildWarehouse(
  tx: Tx,
  guildId: number,
): Promise<GuildWarehouseState> {
  await ensureGuildResourceRow(tx, guildId);
  const row = (
    await tx
      .select({ warehouse: v2GuildResources.warehouse })
      .from(v2GuildResources)
      .where(eq(v2GuildResources.guildId, guildId))
      .for("update")
      .limit(1)
  )[0];
  return parseGuildWarehouseState(row?.warehouse);
}

export async function readGuildWarehouse(
  tx: QueryDb,
  guildId: number,
): Promise<GuildWarehouseState> {
  const row = (
    await tx
      .select({ warehouse: v2GuildResources.warehouse })
      .from(v2GuildResources)
      .where(eq(v2GuildResources.guildId, guildId))
      .limit(1)
  )[0];
  return parseGuildWarehouseState(row?.warehouse);
}

export async function upsertGuildWarehouse(
  tx: Tx,
  guildId: number,
  warehouse: GuildWarehouseState,
): Promise<void> {
  const safe = parseGuildWarehouseState(warehouse);
  await tx
    .insert(v2GuildResources)
    .values({ guildId, warehouse: safe, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: v2GuildResources.guildId,
      set: { warehouse: safe, updatedAt: new Date() },
    });
}

export async function hasGuildWarehousePermission(
  tx: QueryDb,
  guildId: number,
  userId: string,
): Promise<boolean> {
  const row = (
    await tx
      .select({ userId: guildWarehousePermissions.userId })
      .from(guildWarehousePermissions)
      .where(
        and(
          eq(guildWarehousePermissions.guildId, guildId),
          eq(guildWarehousePermissions.userId, userId),
        ),
      )
      .limit(1)
  )[0];
  return row != null;
}

export async function readGuildWarehousePermissionUserIds(
  tx: QueryDb,
  guildId: number,
): Promise<string[]> {
  const rows = await tx
    .select({ userId: guildWarehousePermissions.userId })
    .from(guildWarehousePermissions)
    .where(eq(guildWarehousePermissions.guildId, guildId));
  return rows.map((row) => row.userId);
}

export async function setGuildWarehousePermission(
  tx: Tx,
  entry: {
    guildId: number;
    userId: string;
    grantedBy: string;
    allowed: boolean;
  },
): Promise<void> {
  if (!entry.allowed) {
    await tx
      .delete(guildWarehousePermissions)
      .where(
        and(
          eq(guildWarehousePermissions.guildId, entry.guildId),
          eq(guildWarehousePermissions.userId, entry.userId),
        ),
      );
    return;
  }
  await tx
    .insert(guildWarehousePermissions)
    .values({
      guildId: entry.guildId,
      userId: entry.userId,
      grantedBy: entry.grantedBy,
      grantedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [
        guildWarehousePermissions.guildId,
        guildWarehousePermissions.userId,
      ],
      set: { grantedBy: entry.grantedBy, grantedAt: new Date() },
    });
}
