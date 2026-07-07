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
  removeInstance,
  type V2EquipInstance,
} from "@/adventure/data/v2/v2Equipment";

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

export async function GET() {
  const userId = await ensureUser();
  if (!userId) return bad("unauthorized", 401);

  const guildId = await getGuildIdByUser(userId);
  if (guildId == null) return bad("no_guild", 403);
  const smithyLevel = await readGuildSmithyLevel(db, guildId);
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

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) return bad("unauthorized", 401);

  let body: { iid?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return bad("invalid_json");
  }
  const iid =
    typeof body.iid === "string" && body.iid.length > 0 ? body.iid : null;
  if (!iid) return bad("invalid_iid");

  const guildId = await getGuildIdByUser(userId);
  if (guildId == null) return bad("no_guild", 403);
  const smithyLevel = await readGuildSmithyLevel(db, guildId);
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

    const inst = parsed.owned.find((entry) => entry.iid === iid);
    if (!inst) {
      return { status: 400, body: { ok: false as const, error: "not_owned" } };
    }
    const item = V2_EQUIPMENT[inst.id];
    if (parsed.equipped[item.slot] === iid) {
      return { status: 400, body: { ok: false as const, error: "equipped" } };
    }
    if (inst.locked) {
      return { status: 400, body: { ok: false as const, error: "locked" } };
    }
    const plan = guildWorkshopDismantlePlan(item, inst, blacksmithLevel);
    if (plan.blockedReason || Object.keys(plan.materials).length === 0) {
      return {
        status: 400,
        body: {
          ok: false as const,
          error: plan.blockedReason ?? "no_material",
        },
      };
    }

    const nextMaterials = addGuildWorkshopMaterials(
      parseGuildWorkshopMaterialInventory(charRaw.materials),
      plan.materials,
    );
    const nextArtisan = addArtisanXpOnly(
      currentArtisan,
      "blacksmith",
      plan.artisanXp,
    );
    const { owned: nextOwned } = removeInstance(parsed.owned, iid);
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

    return {
      status: 200,
      body: {
        ok: true as const,
        dismantled: candidateView(
          inst,
          new Set(Object.values(parsed.equipped).filter(Boolean)),
          blacksmithLevel,
        ),
        materials: nextMaterials,
        artisan: artisanView({ ...craftingRaw, artisan: nextArtisan }),
        owned: nextOwned,
        equipped: parsed.equipped,
      },
    };
  });

  return Response.json(result.body, { status: result.status });
}
