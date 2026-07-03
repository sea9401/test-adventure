import { eq } from "drizzle-orm";
import type { db as dbType } from "@/db";
import { outpostOccupations, outpostVillages } from "@/db/schema";
import { spendGold } from "@/adventure/data/v2/coreLoopConfig";
import {
  settlementBuildingIdOf,
  settlementBuildingLevelOf,
  type SettlementBuildingId,
} from "@/adventure/data/v2/settlement";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import {
  lockGuildResources,
  upsertGuildResources,
} from "@/lib/server/v2GuildResources";
import { getGuildId } from "@/lib/server/v2EnsureSoloGuild";

type Tx = Parameters<Parameters<typeof dbType.transaction>[0]>[0];

type AccessKind = "member" | "external";

export type SettlementBuildingAccess = {
  outpostId: string;
  guildId: number;
  buildingId: SettlementBuildingId;
  level: number;
  kind: AccessKind;
  taxRate: number;
  useFeeGold: number;
};

export const EXTERNAL_BUILDING_USE_BASE_GOLD: Partial<
  Record<SettlementBuildingId, number>
> = {
  guild_smithy: 100_000,
  training_ground: 50_000,
};

export function externalBuildingUseFeeGold(
  buildingId: SettlementBuildingId,
  level: number,
  taxRate: number,
): number {
  const base = EXTERNAL_BUILDING_USE_BASE_GOLD[buildingId] ?? 0;
  if (base <= 0 || level <= 0 || taxRate <= 0) return 0;
  return Math.max(1, Math.floor(base * Math.max(1, level) * taxRate));
}

export function outpostIdFromRequest(
  req: Request,
  bodyOutpostId?: unknown,
): string | null {
  if (typeof bodyOutpostId === "string" && bodyOutpostId.trim().length > 0) {
    return bodyOutpostId.trim();
  }
  const q = new URL(req.url).searchParams.get("outpostId");
  return q && q.trim().length > 0 ? q.trim() : null;
}

export function buildingLevelFromSlots(
  buildings: unknown,
  buildingId: SettlementBuildingId,
): number {
  if (buildings == null || typeof buildings !== "object" || Array.isArray(buildings)) {
    return 0;
  }
  let level = 0;
  for (const raw of Object.values(buildings as Record<string, unknown>)) {
    if (settlementBuildingIdOf(raw) === buildingId) {
      level = Math.max(level, settlementBuildingLevelOf(raw));
    }
  }
  return level;
}

export async function resolveOutpostBuildingAccess(
  tx: Tx,
  userId: string,
  outpostId: string,
  buildingId: SettlementBuildingId,
): Promise<
  | { ok: true; access: SettlementBuildingAccess }
  | { ok: false; status: number; error: string }
> {
  const [row] = await tx
    .select({
      guildId: outpostVillages.guildId,
      buildings: outpostVillages.buildings,
      occupiedByGuildId: outpostOccupations.occupiedByGuildId,
      policy: outpostOccupations.policy,
      taxRate: outpostOccupations.taxRate,
    })
    .from(outpostVillages)
    .innerJoin(
      outpostOccupations,
      eq(outpostOccupations.outpostId, outpostVillages.outpostId),
    )
    .where(eq(outpostVillages.outpostId, outpostId))
    .limit(1);

  if (!row || row.guildId == null || row.occupiedByGuildId == null) {
    return { ok: false, status: 404, error: "no_guild_settlement" };
  }
  if (row.guildId !== row.occupiedByGuildId) {
    return { ok: false, status: 409, error: "settlement_owner_mismatch" };
  }

  const level = buildingLevelFromSlots(row.buildings, buildingId);
  if (level <= 0) {
    return { ok: false, status: 403, error: "building_required" };
  }

  const viewerGuildId = await getGuildId(tx, userId);
  if (viewerGuildId === row.guildId) {
    return {
      ok: true,
      access: {
        outpostId,
        guildId: row.guildId,
        buildingId,
        level,
        kind: "member",
        taxRate: 0,
        useFeeGold: 0,
      },
    };
  }

  if (row.policy === "guild-only") {
    return { ok: false, status: 403, error: "policy_blocked" };
  }

  const taxRate = Math.max(0, Math.min(0.5, Number(row.taxRate) || 0));
  return {
    ok: true,
    access: {
      outpostId,
      guildId: row.guildId,
      buildingId,
      level,
      kind: "external",
      taxRate,
      useFeeGold: externalBuildingUseFeeGold(buildingId, level, taxRate),
    },
  };
}

export async function chargeExternalBuildingUseFee(
  tx: Tx,
  userId: string,
  access: SettlementBuildingAccess,
): Promise<
  | { ok: true; gold: number; bankedGold: number; feeGold: number }
  | { ok: false; status: number; error: string; requiredGold: number }
> {
  const feeGold = Math.max(0, Math.floor(access.useFeeGold));
  if (access.kind !== "external" || feeGold <= 0) {
    const charSave = await lockSaveForUpdate<Record<string, unknown>>(
      tx,
      userId,
      "character.v2",
      {},
    );
    return {
      ok: true,
      gold: Math.max(0, Math.floor(Number(charSave.gold) || 0)),
      bankedGold: Math.max(0, Math.floor(Number(charSave.bankedGold) || 0)),
      feeGold: 0,
    };
  }

  const charSave = await lockSaveForUpdate<Record<string, unknown>>(
    tx,
    userId,
    "character.v2",
    {},
  );
  const gold = Math.max(0, Math.floor(Number(charSave.gold) || 0));
  const bankedGold = Math.max(0, Math.floor(Number(charSave.bankedGold) || 0));
  const spent = spendGold(gold, bankedGold, feeGold);
  if (!spent.ok) {
    return {
      ok: false,
      status: 409,
      error: "insufficient_gold",
      requiredGold: feeGold,
    };
  }

  const guildResources = await lockGuildResources(tx, access.guildId);
  await upsertSave(tx, userId, "character.v2", {
    ...charSave,
    gold: spent.gold,
    bankedGold: spent.bankedGold,
  });
  await upsertGuildResources(tx, access.guildId, {
    gold: guildResources.gold + feeGold,
  });

  return {
    ok: true,
    gold: spent.gold,
    bankedGold: spent.bankedGold,
    feeGold,
  };
}

export async function applyExternalBuildingUseFeeToCharacter(
  tx: Tx,
  access: SettlementBuildingAccess,
  charSave: Record<string, unknown>,
): Promise<
  | {
      ok: true;
      charSave: Record<string, unknown>;
      gold: number;
      bankedGold: number;
      feeGold: number;
    }
  | { ok: false; status: number; error: string; requiredGold: number }
> {
  const feeGold = Math.max(0, Math.floor(access.useFeeGold));
  const gold = Math.max(0, Math.floor(Number(charSave.gold) || 0));
  const bankedGold = Math.max(0, Math.floor(Number(charSave.bankedGold) || 0));
  if (access.kind !== "external" || feeGold <= 0) {
    return { ok: true, charSave, gold, bankedGold, feeGold: 0 };
  }

  const spent = spendGold(gold, bankedGold, feeGold);
  if (!spent.ok) {
    return {
      ok: false,
      status: 409,
      error: "insufficient_gold",
      requiredGold: feeGold,
    };
  }
  const guildResources = await lockGuildResources(tx, access.guildId);
  await upsertGuildResources(tx, access.guildId, {
    gold: guildResources.gold + feeGold,
  });
  return {
    ok: true,
    charSave: {
      ...charSave,
      gold: spent.gold,
      bankedGold: spent.bankedGold,
    },
    gold: spent.gold,
    bankedGold: spent.bankedGold,
    feeGold,
  };
}

export async function outpostHasAccessibleGuildBuilding(
  tx: Tx,
  userId: string,
  outpostId: string,
  buildingIds: readonly SettlementBuildingId[],
): Promise<Record<SettlementBuildingId, boolean>> {
  const empty = Object.fromEntries(
    buildingIds.map((id) => [id, false]),
  ) as Record<SettlementBuildingId, boolean>;
  const [row] = await tx
    .select({
      guildId: outpostVillages.guildId,
      buildings: outpostVillages.buildings,
      occupiedByGuildId: outpostOccupations.occupiedByGuildId,
      policy: outpostOccupations.policy,
    })
    .from(outpostVillages)
    .innerJoin(
      outpostOccupations,
      eq(outpostOccupations.outpostId, outpostVillages.outpostId),
    )
    .where(eq(outpostVillages.outpostId, outpostId))
    .limit(1);
  if (!row || row.guildId == null || row.occupiedByGuildId !== row.guildId) {
    return empty;
  }
  const viewerGuildId = await getGuildId(tx, userId);
  if (viewerGuildId !== row.guildId && row.policy === "guild-only") {
    return empty;
  }
  return Object.fromEntries(
    buildingIds.map((id) => [id, buildingLevelFromSlots(row.buildings, id) > 0]),
  ) as Record<SettlementBuildingId, boolean>;
}
