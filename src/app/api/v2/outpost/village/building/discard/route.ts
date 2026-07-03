import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { isGuildMasterOrVice } from "@/lib/server/guildAdmin";
import {
  guildOwningOutpost,
  lockVillage,
  normalizeVillageOwner,
  normalizeVillageToOwner,
  rememberGuildSettlementBuildingLevel,
  resolveTileVillageManageOwner,
  upsertVillage,
  type SettlementOwner,
} from "@/lib/server/v2Settlement";
import {
  MAX_SLOTS_BY_TIER,
  settlementBuildingIdOf,
  settlementBuildingLevelOf,
} from "@/adventure/data/v2/settlement";
import { V2_TILE_PRODUCTION } from "@/adventure/data/v2/settlementWarfareConfig";
import {
  isTileOutpostId,
  parseTileOutpostId,
} from "@/adventure/data/v2/tileWarfare";

// POST /api/v2/outpost/village/building/discard — body { outpostId, slot }
// 건축물 슬롯을 비운다. 길드 소유 마을은 폐기 전 건물 레벨을 길드 단위로 보관한다.
export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  let body: { outpostId?: unknown; slot?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const outpostId = typeof body.outpostId === "string" ? body.outpostId : "";
  const slot = typeof body.slot === "number" ? body.slot : Number(body.slot);
  if (!outpostId || !Number.isInteger(slot) || slot < 0) {
    return Response.json({ ok: false, error: "invalid" }, { status: 400 });
  }

  try {
    const result = await db.transaction(async (tx) => {
      let guildId: number | null = null;
      let owner: SettlementOwner | null = null;
      if (V2_TILE_PRODUCTION && isTileOutpostId(outpostId)) {
        const pos = parseTileOutpostId(outpostId);
        if (!pos) {
          return { status: 400, body: { ok: false as const, error: "invalid" } };
        }
        const ctx = await resolveTileVillageManageOwner(
          tx,
          userId,
          pos.col,
          pos.row,
          true,
        );
        if (!ctx.ok) {
          return { status: ctx.status, body: { ok: false as const, error: ctx.error } };
        }
        owner = ctx.owner;
        guildId = ctx.owner.kind === "guild" ? ctx.owner.guildId : null;
      } else {
        guildId = await guildOwningOutpost(tx, userId, outpostId);
        if (guildId == null) {
          return { status: 403, body: { ok: false as const, error: "not_owner" } };
        }
        if (!(await isGuildMasterOrVice(tx, guildId, userId))) {
          return {
            status: 403,
            body: { ok: false as const, error: "not_authorized" },
          };
        }
      }

      const loaded = await lockVillage(tx, outpostId);
      if (!loaded || loaded.name == null) {
        return { status: 409, body: { ok: false as const, error: "not_built" } };
      }
      const village =
        owner != null
          ? normalizeVillageToOwner(loaded, owner)
          : normalizeVillageOwner(loaded, guildId!);
      if (slot >= village.unlockedSlots || slot >= MAX_SLOTS_BY_TIER[village.tier]) {
        return { status: 409, body: { ok: false as const, error: "slot_locked" } };
      }

      const rawBuilding = village.buildings[slot];
      const buildingId = settlementBuildingIdOf(rawBuilding);
      if (!buildingId) {
        return {
          status: 409,
          body: { ok: false as const, error: "building_required" },
        };
      }
      const level = settlementBuildingLevelOf(rawBuilding);
      if (guildId != null) {
        await rememberGuildSettlementBuildingLevel(tx, guildId, buildingId, level);
      }

      const buildings = { ...village.buildings };
      delete buildings[slot];
      village.buildings = buildings;
      await upsertVillage(tx, village);
      return {
        status: 200,
        body: {
          ok: true as const,
          slot,
          building: { id: buildingId, level },
          buildings: village.buildings,
        },
      };
    });
    return Response.json(result.body, { status: result.status });
  } catch {
    return Response.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
