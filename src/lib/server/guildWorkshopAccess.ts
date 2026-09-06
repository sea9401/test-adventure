import {
  ARTISAN_PROFESSION_NAME,
  artisanLevel,
  artisanXpForNextLevel,
  artisanXpIntoLevel,
  parseArtisanState,
} from "@/adventure/data/v2/artisan";
import {
  guildWorkshopBonusFromTotalCrafts,
  parseGuildWorkshopCraftRecords,
  parseGuildWorkshopStats,
  type GuildWorkshopBonus,
} from "@/adventure/data/v2/guildWorkshop";
import { db } from "@/db";
import { guildMembers, savesKv } from "@/db/schema";
import { associationFacilityLevel, canUseAdventurerAssociation } from "./adventurerAssociation";
import { readGuildSmithyLevel } from "./guildFacilities";
import {
  resolveOutpostBuildingAccess,
  type SettlementBuildingAccess,
} from "./settlementBuildingAccess";
import { getGuildIdByUser } from "./v2EnsureSoloGuild";
import { and, eq, inArray } from "drizzle-orm";

export type CharacterSaveWithMaterials = {
  materials?: unknown;
  gold?: unknown;
  bankedGold?: unknown;
  [key: string]: unknown;
};


export async function readGuildWorkshopBonus(
  guildId: number,
  extraCrafts = 0,
): Promise<GuildWorkshopBonus> {
  const members = await db
    .select({ userId: guildMembers.userId })
    .from(guildMembers)
    .where(eq(guildMembers.guildId, guildId));
  const memberIds = members.map((m) => m.userId);
  if (memberIds.length === 0) {
    return guildWorkshopBonusFromTotalCrafts(extraCrafts);
  }
  const rows = await db
    .select({ value: savesKv.value })
    .from(savesKv)
    .where(
      and(inArray(savesKv.userId, memberIds), eq(savesKv.key, "crafting.v2")),
    );
  const totalCrafts =
    rows.reduce((sum, row) => {
      const value = (row.value ?? null) as {
        workshopStats?: unknown;
      } | null;
      return sum + parseGuildWorkshopStats(value?.workshopStats).totalCrafts;
    }, 0) + extraCrafts;
  return guildWorkshopBonusFromTotalCrafts(totalCrafts);
}


export async function resolveWorkshopAccess(
  userId: string,
  outpostId: string | null,
  association: boolean,
): Promise<
  | { ok: true; access: SettlementBuildingAccess }
  | { ok: false; status: number; body: Record<string, unknown> }
> {
  if (association) {
    if (!(await canUseAdventurerAssociation(db, userId))) {
      return {
        ok: false,
        status: 403,
        body: { ok: false, error: "association_for_solo_only" },
      };
    }
    const level = await associationFacilityLevel(db, "guild_smithy");
    return {
      ok: true,
      access: {
        outpostId: "association",
        guildId: 0,
        buildingId: "guild_smithy",
        level,
        kind: "member",
        taxRate: 0,
        useFeeGold: 0,
      },
    };
  }
  if (outpostId) {
    const result = await db.transaction((tx) =>
      resolveOutpostBuildingAccess(tx, userId, outpostId, "guild_smithy"),
    );
    if (!result.ok) {
      return {
        ok: false,
        status: result.status,
        body: {
          ok: false,
          error:
            result.error === "building_required"
              ? "smithy_required"
              : result.error,
        },
      };
    }
    return { ok: true, access: result.access };
  }

  const guildId = await getGuildIdByUser(userId);
  if (guildId == null) {
    return {
      ok: false,
      status: 403,
      body: { ok: false, error: "no_guild" },
    };
  }
  const level = await readGuildSmithyLevel(db, guildId);
  return {
    ok: true,
    access: {
      outpostId: "",
      guildId,
      buildingId: "guild_smithy",
      level,
      kind: "member",
      taxRate: 0,
      useFeeGold: 0,
    },
  };
}


export function externalAccessView(access: SettlementBuildingAccess) {
  return access.kind === "external"
    ? {
        kind: access.kind,
        outpostId: access.outpostId,
        guildId: access.guildId,
        taxRate: access.taxRate,
        useFeeGold: access.useFeeGold,
      }
    : null;
}


export function artisanView(rawCrafting: unknown) {
  const craft =
    rawCrafting != null &&
    typeof rawCrafting === "object" &&
    !Array.isArray(rawCrafting)
      ? (rawCrafting as Record<string, unknown>)
      : {};
  const artisan = parseArtisanState(craft.artisan);
  const blacksmith = artisan.blacksmith ?? { xp: 0, crafts: 0 };
  return {
    blacksmith: {
      name: ARTISAN_PROFESSION_NAME.blacksmith,
      xp: blacksmith.xp,
      crafts: blacksmith.crafts,
      level: artisanLevel(blacksmith),
      xpIntoLevel: artisanXpIntoLevel(blacksmith),
      xpForNext: artisanXpForNextLevel(blacksmith),
    },
  };
}


export function workshopStatsView(rawCrafting: unknown) {
  const craft =
    rawCrafting != null &&
    typeof rawCrafting === "object" &&
    !Array.isArray(rawCrafting)
      ? (rawCrafting as Record<string, unknown>)
      : {};
  return parseGuildWorkshopStats(craft.workshopStats);
}


export function workshopRecordsView(rawCrafting: unknown) {
  const craft =
    rawCrafting != null &&
    typeof rawCrafting === "object" &&
    !Array.isArray(rawCrafting)
      ? (rawCrafting as Record<string, unknown>)
      : {};
  return parseGuildWorkshopCraftRecords(craft.workshopRecords);
}
