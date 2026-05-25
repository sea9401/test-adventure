import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { parseResources } from "@/adventure/data/v2/resources";
import {
  SOLDIER_COST_STONE,
  SOLDIER_MAX_TOTAL,
} from "@/adventure/data/v2/soldiers";

// POST /api/v2/soldiers/recruit — 병사 모집.
//
// body: { count: number } — 모집할 병사 수 (1~상한 N)
// 비용: count × SOLDIER_COST_STONE (현재 10 stone/명)
// stone 부족 → 409. count 잘못 → 400.
//
// v2-resources 의 stone 차감 + soldiers 증가, 같은 tx.

const MAX_PER_REQUEST = 1000;

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { count?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (
    typeof body.count !== "number" ||
    !Number.isFinite(body.count) ||
    !Number.isInteger(body.count) ||
    body.count <= 0 ||
    body.count > MAX_PER_REQUEST
  ) {
    return Response.json(
      { ok: false, error: "bad_count", max: MAX_PER_REQUEST },
      { status: 400 },
    );
  }
  const count = body.count;
  const cost = count * SOLDIER_COST_STONE;

  const result = await db.transaction(async (tx) => {
    const resSave = await lockSaveForUpdate<unknown>(
      tx,
      userId,
      "v2-resources",
      {},
    );
    const resources = parseResources(resSave);
    if (resources.stone < cost) {
      return {
        status: 409,
        body: {
          ok: false as const,
          error: "not_enough_stone" as const,
          have: resources.stone,
          need: cost,
        },
      };
    }
    if (resources.soldiers + count > SOLDIER_MAX_TOTAL) {
      return {
        status: 409,
        body: {
          ok: false as const,
          error: "soldier_cap" as const,
          have: resources.soldiers,
          max: SOLDIER_MAX_TOTAL,
        },
      };
    }
    const next = {
      stone: resources.stone - cost,
      soldiers: resources.soldiers + count,
    };
    await upsertSave(tx, userId, "v2-resources", next);
    return {
      status: 200,
      body: { ok: true as const, recruited: count, cost, resources: next },
    };
  });

  return Response.json(result.body, { status: result.status });
}
