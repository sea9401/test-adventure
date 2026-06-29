import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import {
  guildOwningOutpost,
  lockVillage,
  normalizeVillageToOwner,
  normalizeVillageOwner,
  resolveTileVillageManageOwner,
  upsertVillage,
  type SettlementOwner,
} from "@/lib/server/v2Settlement";
import { isGuildMasterOrVice } from "@/lib/server/guildAdmin";
import {
  canPlaceSettlementBuilding,
  isSettlementBuildingId,
  MAX_SLOTS_BY_TIER,
  settlementBuildingSlot,
} from "@/adventure/data/v2/settlement";
import { V2_TILE_PRODUCTION } from "@/adventure/data/v2/settlementWarfareConfig";
import {
  isTileOutpostId,
  parseTileOutpostId,
} from "@/adventure/data/v2/tileWarfare";

// POST /api/v2/outpost/village/building/place — body { outpostId, slot, buildingId }
// 해금된 건축물 슬롯에 영지 건물을 배치한다. 현재는 길드 대장간만 배치 가능하고 효과는 후속 연결.
//   마스터/부마스터 전용. 교체/철거는 아직 없음(이미 배치된 슬롯은 already_occupied).
export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  let body: { outpostId?: unknown; slot?: unknown; buildingId?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const outpostId = typeof body.outpostId === "string" ? body.outpostId : "";
  const slot = typeof body.slot === "number" ? body.slot : Number(body.slot);
  const buildingId = body.buildingId;
  if (
    !outpostId ||
    !Number.isInteger(slot) ||
    slot < 0 ||
    !isSettlementBuildingId(buildingId)
  ) {
    return Response.json({ ok: false, error: "invalid" }, { status: 400 });
  }
  if (!canPlaceSettlementBuilding(buildingId)) {
    return Response.json(
      { ok: false, error: "building_unavailable" },
      { status: 409 },
    );
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
      if (village.buildings[slot] != null) {
        return {
          status: 409,
          body: { ok: false as const, error: "already_occupied" },
        };
      }

      village.buildings = {
        ...village.buildings,
        [slot]: settlementBuildingSlot(buildingId, 1),
      };
      await upsertVillage(tx, village);
      return {
        status: 200,
        body: {
          ok: true as const,
          slot,
          buildingId,
          buildings: village.buildings,
        },
      };
    });
    return Response.json(result.body, { status: result.status });
  } catch {
    return Response.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
