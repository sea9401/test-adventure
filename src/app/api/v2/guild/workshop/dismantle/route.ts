import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, readSave, upsertSave } from "@/lib/server/savesKv";
import { getGuildIdByUser } from "@/lib/server/v2EnsureSoloGuild";
import { guildSmithyUpgradeForLevel } from "@/adventure/data/v2/settlement";
import { readGuildSmithyLevel } from "@/lib/server/guildFacilities";
import {
  addGuildWorkshopMaterials,
  guildWorkshopDismantlePlan,
  parseGuildWorkshopMaterialInventory,
} from "@/adventure/data/v2/guildWorkshop";
import {
  ARTISAN_PROFESSION_NAME,
  BLACKSMITH_DISMANTLE_LEVEL,
  addArtisanXpOnly,
  artisanLevel,
  artisanXpForNextLevel,
  artisanXpIntoLevel,
  parseArtisanState,
} from "@/adventure/data/v2/artisan";
import {
  V2_EQUIPMENT,
  parseEquipmentSave,
  type V2EquipInstance,
} from "@/adventure/data/v2/v2Equipment";
import { associationFacilityLevel } from "@/lib/server/adventurerAssociation";
import { boundEquipmentDisposalView } from "@/lib/server/boundEquipmentDisposal";

type CharacterSaveWithMaterials = {
  materials?: unknown;
  [key: string]: unknown;
};

function artisanView(rawCrafting: unknown) {
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

function candidateView(
  inst: V2EquipInstance,
  equippedIids: ReadonlySet<string>,
  blacksmithLevel: number,
) {
  const item = V2_EQUIPMENT[inst.id];
  const plan = guildWorkshopDismantlePlan(item, inst, blacksmithLevel);
  const equipped = equippedIids.has(inst.iid);
  const locked = inst.locked === true;
  const blockedReason = equipped
    ? "equipped"
    : locked
      ? "locked"
      : plan.blockedReason;
  return {
    iid: inst.iid,
    itemId: inst.id,
    itemName: item.name,
    slot: item.slot,
    tier: item.tier,
    craftOnly: item.craftOnly === true,
    enhanceLevel: inst.enhance?.level ?? 0,
    craftQualityLevel: inst.craftQuality?.level ?? 0,
    masterwork: inst.craftedBy?.masterwork === true,
    locked,
    bound: inst.bound === true,
    ...(inst.liberation ? { liberation: inst.liberation } : {}),
    equipped,
    rewards: plan.materials,
    artisanXp: plan.artisanXp,
    canDismantle: !blockedReason && Object.keys(plan.materials).length > 0,
    ...(blockedReason ? { blockedReason } : {}),
  };
}

function bad(error: string, status = 400) {
  return Response.json({ ok: false, error }, { status });
}

export async function GET(req: Request) {
  const userId = await ensureUser();
  if (!userId) return bad("unauthorized", 401);

  const association = new URL(req.url).searchParams.get("scope") === "association";
  const memberGuildId = await getGuildIdByUser(userId);
  if (association && memberGuildId != null) {
    return bad("association_for_solo_only", 403);
  }
  const guildId = association ? 0 : memberGuildId;
  if (!association && guildId == null) return bad("no_guild", 403);
  const smithyLevel = association
    ? await associationFacilityLevel(db, "guild_smithy")
    : await readGuildSmithyLevel(db, guildId!);
  if (smithyLevel <= 0) return bad("smithy_required", 403);
  const smithyBonus = guildSmithyUpgradeForLevel(Math.max(1, smithyLevel));

  const [charRaw, equipRaw, craftingRaw] = await Promise.all([
    readSave<CharacterSaveWithMaterials>(db, userId, "character.v2", {}),
    readSave<Record<string, unknown>>(db, userId, "equipment.v2", {}),
    readSave<Record<string, unknown>>(db, userId, "crafting.v2", {}),
  ]);
  const { owned, equipped } = parseEquipmentSave(equipRaw);
  const artisan = artisanView(craftingRaw);
  const blacksmithLevel = artisan.blacksmith.level;
  const equippedIids = new Set(Object.values(equipped).filter(Boolean));
  const candidates = owned
    .map((inst) => candidateView(inst, equippedIids, blacksmithLevel))
    .sort(
      (a, b) =>
        Number(b.canDismantle) - Number(a.canDismantle) ||
        b.tier - a.tier ||
        a.itemName.localeCompare(b.itemName, "ko"),
    );

  return Response.json({
    ok: true,
    smithyLevel,
    smithyBonus,
    artisan,
    materials: parseGuildWorkshopMaterialInventory(charRaw.materials),
    requiredBlacksmithLevel: BLACKSMITH_DISMANTLE_LEVEL,
    candidates,
  });
}

/** 일괄 해체 한 번에 받을 최대 장비 수(#840). */
const GUILD_WORKSHOP_BULK_DISMANTLE_MAX = 200;

function parseBulkIids(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  if (raw.length === 0 || raw.length > GUILD_WORKSHOP_BULK_DISMANTLE_MAX) {
    return null;
  }
  if (!raw.every((value) => typeof value === "string" && value.length > 0)) {
    return null;
  }
  return [...new Set(raw as string[])];
}

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) return bad("unauthorized", 401);

  let body: { iid?: unknown; iids?: unknown; confirmBound?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return bad("invalid_json");
  }
  const bulk = body.iids !== undefined;
  const bulkIids = bulk ? parseBulkIids(body.iids) : null;
  if (bulk && !bulkIids) return bad("invalid_iids");
  const iid =
    typeof body.iid === "string" && body.iid.length > 0 ? body.iid : null;
  if (!bulk && !iid) return bad("invalid_iid");
  const requestedIids = bulkIids ?? [iid!];

  const association = new URL(req.url).searchParams.get("scope") === "association";
  const memberGuildId = await getGuildIdByUser(userId);
  if (association && memberGuildId != null) {
    return bad("association_for_solo_only", 403);
  }
  const guildId = association ? 0 : memberGuildId;
  if (!association && guildId == null) return bad("no_guild", 403);
  const smithyLevel = association
    ? await associationFacilityLevel(db, "guild_smithy")
    : await readGuildSmithyLevel(db, guildId!);
  if (smithyLevel <= 0) return bad("smithy_required", 403);

  const result = await db.transaction(async (tx) => {
    const charRaw = await lockSaveForUpdate<CharacterSaveWithMaterials>(
      tx,
      userId,
      "character.v2",
      {},
    );
    const equipRaw = await lockSaveForUpdate<Record<string, unknown>>(
      tx,
      userId,
      "equipment.v2",
      {},
    );
    const craftingRaw = await lockSaveForUpdate<Record<string, unknown>>(
      tx,
      userId,
      "crafting.v2",
      {},
    );
    const parsed = parseEquipmentSave(equipRaw);
    const currentArtisan = parseArtisanState(craftingRaw.artisan);
    const blacksmithLevel = artisanLevel(currentArtisan.blacksmith);
    if (blacksmithLevel < BLACKSMITH_DISMANTLE_LEVEL) {
      return {
        status: 403,
        body: {
          ok: false as const,
          error: "insufficient_artisan_level" as const,
          requiredBlacksmithLevel: BLACKSMITH_DISMANTLE_LEVEL,
          artisan: artisanView(craftingRaw),
        },
      };
    }

    // 요청한 장비마다 해체 가능 여부를 판정한다. 단건 요청은 첫 실패를 그대로
    // 돌려주고(기존 동작), 일괄 요청은 실패한 장비만 건너뛴다.
    const accepted: {
      inst: V2EquipInstance;
      plan: ReturnType<typeof guildWorkshopDismantlePlan>;
    }[] = [];
    let skippedCount = 0;
    for (const targetIid of requestedIids) {
      const inst = parsed.owned.find((entry) => entry.iid === targetIid);
      const item = inst ? V2_EQUIPMENT[inst.id] : undefined;
      const plan =
        inst && item
          ? guildWorkshopDismantlePlan(item, inst, blacksmithLevel)
          : null;
      const error = !inst || !item || !plan
        ? "not_owned"
        : parsed.equipped[item.slot] === targetIid
          ? "equipped"
          : inst.locked
            ? "locked"
            : plan.blockedReason ??
              (Object.keys(plan.materials).length === 0 ? "no_material" : null);
      if (error) {
        if (!bulk) {
          return { status: 400, body: { ok: false as const, error } };
        }
        skippedCount += 1;
        continue;
      }
      accepted.push({ inst: inst!, plan: plan! });
    }
    if (accepted.length === 0) {
      return {
        status: 400,
        body: { ok: false as const, error: "nothing_to_dismantle" as const },
      };
    }

    const boundItems = accepted.filter(({ inst }) => inst.bound);
    if (boundItems.length > 0 && body.confirmBound !== true) {
      const items = boundItems.map(({ inst }) => boundEquipmentDisposalView(inst));
      return {
        status: 409,
        body: bulk
          ? {
              ok: false as const,
              error: "bound_confirmation_required" as const,
              items,
            }
          : {
              ok: false as const,
              error: "bound_confirmation_required" as const,
              item: items[0],
            },
      };
    }

    let nextMaterials = parseGuildWorkshopMaterialInventory(charRaw.materials);
    let totalRewards: Record<string, number> = {};
    let totalArtisanXp = 0;
    for (const { plan } of accepted) {
      nextMaterials = addGuildWorkshopMaterials(nextMaterials, plan.materials);
      totalRewards = addGuildWorkshopMaterials(totalRewards, plan.materials);
      totalArtisanXp += plan.artisanXp;
    }
    const nextArtisan = addArtisanXpOnly(
      currentArtisan,
      "blacksmith",
      totalArtisanXp,
    );
    const removeIids = new Set(accepted.map(({ inst }) => inst.iid));
    const nextOwned = parsed.owned.filter((entry) => !removeIids.has(entry.iid));
    await upsertSave(tx, userId, "character.v2", {
      ...charRaw,
      materials: nextMaterials,
    });
    await upsertSave(tx, userId, "equipment.v2", {
      owned: nextOwned,
      equipped: parsed.equipped,
    });
    await upsertSave(tx, userId, "crafting.v2", {
      ...craftingRaw,
      artisan: nextArtisan,
    });

    const equippedIids = new Set(Object.values(parsed.equipped).filter(Boolean));
    const dismantledItems = accepted.map(({ inst }) =>
      candidateView(inst, equippedIids, blacksmithLevel),
    );
    const shared = {
      materials: nextMaterials,
      artisan: artisanView({ ...craftingRaw, artisan: nextArtisan }),
      owned: nextOwned,
      equipped: parsed.equipped,
    };
    return {
      status: 200,
      body: bulk
        ? {
            ok: true as const,
            dismantledItems,
            dismantledCount: dismantledItems.length,
            skippedCount,
            rewards: totalRewards,
            artisanXp: totalArtisanXp,
            ...shared,
          }
        : {
            ok: true as const,
            dismantled: dismantledItems[0],
            ...shared,
          },
    };
  });

  return Response.json(result.body, { status: result.status });
}
