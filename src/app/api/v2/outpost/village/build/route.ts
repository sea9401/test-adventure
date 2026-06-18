import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import {
  guildOwningOutpost,
  lockVillage,
  upsertVillage,
  normalizeVillageOwner,
  type VillageRow,
} from "@/lib/server/v2Settlement";
import { isValidVillageName } from "@/adventure/data/v2/settlement";

// POST /api/v2/outpost/village/build — body { outpostId, name }
// 점령한 빈 공터에 마을을 세우고 이름을 짓는다. 건설(name 부여) 후에야 생산이 열린다(produce 게이트).
//   - 마을 없음 → 새로 건설(village 단계).
//   - 마을 있고 이름 없음(PR-2/3 lazy 생성분) → 이름만 부여(소급 건설).
//   - 이미 이름 있는 마을(건설됨/점령 승계) → 409 already_built (개명은 후속).
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

  try {
    const result = await db.transaction(async (tx) => {
      const guildId = await guildOwningOutpost(tx, userId, outpostId);
      if (guildId == null) {
        return { status: 403, body: { ok: false as const, error: "not_owner" } };
      }
      let village = await lockVillage(tx, outpostId);
      if (village) {
        village = normalizeVillageOwner(village, guildId);
        if (village.name != null) {
          return {
            status: 409,
            body: { ok: false as const, error: "already_built" },
          };
        }
        village = { ...village, name };
      } else {
        village = {
          outpostId,
          guildId,
          tier: "village",
          name,
          jobs: {},
        } satisfies VillageRow;
      }
      await upsertVillage(tx, village);
      return {
        status: 200,
        body: { ok: true as const, name, tier: village.tier },
      };
    });
    return Response.json(result.body, { status: result.status });
  } catch {
    return Response.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
