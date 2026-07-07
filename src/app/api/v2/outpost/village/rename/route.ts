import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import {
  guildOwningOutpost,
  lockVillage,
  upsertVillage,
  normalizeVillageOwner,
} from "@/lib/server/v2Settlement";
import { isGuildMasterOrManager } from "@/lib/server/guildAdmin";
import { isValidVillageName } from "@/adventure/data/v2/settlement";
import { isTileOutpostId } from "@/adventure/data/v2/tileWarfare";

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

  // 개척마을(타일)은 개명 불가 — 이름은 개척(found) 때 한 번만 정한다(불변). 카탈로그 거점만 개명.
  if (isTileOutpostId(outpostId)) {
    return Response.json(
      { ok: false, error: "rename_disabled" },
      { status: 403 },
    );
  }

  const rawName = typeof body.name === "string" ? body.name : "";
  if (!outpostId || !isValidVillageName(rawName)) {
    return Response.json({ ok: false, error: "invalid_name" }, { status: 400 });
  }
  const name = rawName.trim();

  try {
    const result = await db.transaction(async (tx) => {
      const guildId = await guildOwningOutpost(tx, userId, outpostId);
      if (guildId == null) {
        return { status: 403, body: { ok: false as const, error: "not_owner" } };
      }
      // 이름 변경 = 마스터/관리자 전용(관리 탭).
      if (!(await isGuildMasterOrManager(tx, guildId, userId))) {
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
