import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import {
  guildOwningOutpost,
  lockVillage,
  upsertVillage,
  normalizeVillageOwner,
} from "@/lib/server/v2Settlement";
import { isGuildMasterOrVice } from "@/lib/server/guildAdmin";
import { isValidVillageName } from "@/adventure/data/v2/settlement";
import { V2_TILE_PRODUCTION } from "@/adventure/data/v2/settlementWarfareConfig";
import { isTileOutpostId } from "@/adventure/data/v2/tileWarfare";
import { tileRename } from "@/lib/server/tileVillageRoutes";

// POST /api/v2/outpost/village/rename — body { outpostId, name }
// 건설된 마을의 이름을 바꾼다. 점령 길드만(점령 승계로 받은 남의 마을도 새로 명명 가능).
//   미건설(마을 없음/이름 없음)은 거부 → 먼저 /build 로. 락: 점령행→마을(build 와 동일).
export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  let body: { outpostId?: unknown; name?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const outpostId = typeof body.outpostId === "string" ? body.outpostId : "";
  const rawName = typeof body.name === "string" ? body.name : "";
  if (!outpostId || !isValidVillageName(rawName)) {
    return Response.json({ ok: false, error: "invalid_name" }, { status: 400 });
  }
  const name = rawName.trim();

  if (V2_TILE_PRODUCTION && isTileOutpostId(outpostId)) {
    return tileRename(userId, outpostId, name);
  }

  try {
    const result = await db.transaction(async (tx) => {
      const guildId = await guildOwningOutpost(tx, userId, outpostId);
      if (guildId == null) {
        return { status: 403, body: { ok: false as const, error: "not_owner" } };
      }
      // 이름 변경 = 마스터/부마스터 전용(관리 탭).
      if (!(await isGuildMasterOrVice(tx, guildId, userId))) {
        return {
          status: 403,
          body: { ok: false as const, error: "not_authorized" },
        };
      }
      let village = await lockVillage(tx, outpostId);
      if (!village) {
        return { status: 409, body: { ok: false as const, error: "not_built" } };
      }
      village = normalizeVillageOwner(village, guildId);
      if (village.name == null) {
        return { status: 409, body: { ok: false as const, error: "not_built" } };
      }
      village = { ...village, name };
      await upsertVillage(tx, village);
      return { status: 200, body: { ok: true as const, name } };
    });
    return Response.json(result.body, { status: result.status });
  } catch {
    return Response.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
