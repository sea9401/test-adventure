import { eq } from "drizzle-orm";
import type { db as dbType } from "@/db";
import { v2GuildResources } from "@/db/schema";
import { V2_MATERIALS } from "@/adventure/data/v2/dungeonDrops";

type Tx = Parameters<Parameters<typeof dbType.transaction>[0]>[0];
type QueryDb = Tx | typeof dbType;

export type GuildWarehouseInventory = Record<string, number>;

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

export function guildWarehouseUsed(
  inventory: GuildWarehouseInventory,
): number {
  return Object.values(inventory).reduce((sum, count) => sum + count, 0);
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
): Promise<GuildWarehouseInventory> {
  await ensureGuildResourceRow(tx, guildId);
  const row = (
    await tx
      .select({ warehouse: v2GuildResources.warehouse })
      .from(v2GuildResources)
      .where(eq(v2GuildResources.guildId, guildId))
      .for("update")
      .limit(1)
  )[0];
  return parseGuildWarehouseInventory(row?.warehouse);
}

export async function readGuildWarehouse(
  tx: QueryDb,
  guildId: number,
): Promise<GuildWarehouseInventory> {
  const row = (
    await tx
      .select({ warehouse: v2GuildResources.warehouse })
      .from(v2GuildResources)
      .where(eq(v2GuildResources.guildId, guildId))
      .limit(1)
  )[0];
  return parseGuildWarehouseInventory(row?.warehouse);
}

export async function upsertGuildWarehouse(
  tx: Tx,
  guildId: number,
  warehouse: GuildWarehouseInventory,
): Promise<void> {
  const safe = parseGuildWarehouseInventory(warehouse);
  await tx
    .insert(v2GuildResources)
    .values({ guildId, warehouse: safe, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: v2GuildResources.guildId,
      set: { warehouse: safe, updatedAt: new Date() },
    });
}
