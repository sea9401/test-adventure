import { eq } from "drizzle-orm";
import { db } from "@/db";
import { outpostOccupations } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { OUTPOSTS } from "@/adventure/data/v2/outposts";
import {
  computeStoneYield,
  parseResources,
} from "@/adventure/data/v2/resources";

// POST /api/v2/outpost/harvest — 광산 거점에서 자원 수확.
//
// body: { outpostId: string }
// 조건:
//   - outpost.type === "mine"
//   - 점령자(occupiedByUserId === userId) 만
//   - 시간 차 × tier 산출률 (HARVEST_OFFLINE_CAP_HOURS 적용)
//   - lastHarvestedAt 갱신 + v2-resources 의 stone 누적

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { outpostId?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (typeof body.outpostId !== "string" || body.outpostId.length === 0) {
    return Response.json({ ok: false, error: "bad_intent" }, { status: 400 });
  }
  const outpost = OUTPOSTS.find((o) => o.id === body.outpostId);
  if (!outpost) {
    return Response.json(
      { ok: false, error: "no_such_outpost" },
      { status: 400 },
    );
  }
  if (outpost.type !== "mine") {
    return Response.json(
      { ok: false, error: "not_a_mine" },
      { status: 400 },
    );
  }

  const result = await db.transaction(async (tx) => {
    const occ = (
      await tx
        .select()
        .from(outpostOccupations)
        .where(eq(outpostOccupations.outpostId, outpost.id))
        .for("update")
        .limit(1)
    )[0];
    if (!occ) {
      return {
        status: 400,
        body: { ok: false as const, error: "not_occupied" as const },
      };
    }
    if (occ.occupiedByUserId !== userId) {
      return {
        status: 403,
        body: { ok: false as const, error: "not_owner" as const },
      };
    }

    const now = Date.now();
    const yieldResult = computeStoneYield(
      outpost.tier,
      occ.lastHarvestedAt.getTime(),
      now,
    );

    // 현재 v2-resources 잠금. gained=0 이어도 read 해서 응답에 포함.
    const resSave = await lockSaveForUpdate<unknown>(
      tx,
      userId,
      "v2-resources",
      {},
    );
    const resources = parseResources(resSave);
    const newResources = {
      stone: resources.stone + yieldResult.gained,
    };

    if (yieldResult.gained > 0) {
      await upsertSave(tx, userId, "v2-resources", newResources);
      await tx
        .update(outpostOccupations)
        .set({ lastHarvestedAt: new Date(now) })
        .where(eq(outpostOccupations.outpostId, outpost.id));
    }

    return {
      status: 200,
      body: {
        ok: true as const,
        gained: yieldResult.gained,
        effectiveHours: yieldResult.effectiveHours,
        resources: newResources,
      },
    };
  });

  return Response.json(result.body, { status: result.status });
}
