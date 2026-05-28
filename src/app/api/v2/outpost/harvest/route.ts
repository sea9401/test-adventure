import { eq } from "drizzle-orm";
import { db } from "@/db";
import { outpostOccupations } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { getGuildId } from "@/lib/server/v2EnsureSoloGuild";
import {
  lockGuildResources,
  upsertGuildResources,
} from "@/lib/server/v2GuildResources";
import { OUTPOSTS } from "@/adventure/data/v2/outposts";
import {
  computeScrollYield,
  computeStoneYield,
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
  if (
    outpost.type !== "mine" &&
    outpost.type !== "village" &&
    outpost.type !== "tower"
  ) {
    return Response.json(
      { ok: false, error: "not_harvestable" },
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
    // 점령자 길드의 멤버여야 harvest. 길드 점령만 지원(occupiedByGuildId 필수).
    // 무소속 점령은 더 이상 없으므로 occupiedByUserId fallback 도 제거.
    const occGuildId = occ.occupiedByGuildId;
    const viewerGuildId = await getGuildId(tx, userId);
    if (!occGuildId || viewerGuildId == null || occGuildId !== viewerGuildId) {
      return {
        status: 403,
        body: { ok: false as const, error: "not_owner" as const },
      };
    }

    const now = Date.now();
    // type 별 산출 — mine/village=stone, tower=scrolls.
    const stoneResult = computeStoneYield(
      outpost.tier,
      outpost.type,
      occ.lastHarvestedAt.getTime(),
      now,
    );
    const scrollResult = computeScrollYield(
      outpost.tier,
      outpost.type,
      occ.lastHarvestedAt.getTime(),
      now,
    );
    const gainedKind: "stone" | "scrolls" =
      outpost.type === "tower" ? "scrolls" : "stone";
    const gainedAmount =
      gainedKind === "stone" ? stoneResult.gained : scrollResult.gained;
    const effectiveHours =
      gainedKind === "stone"
        ? stoneResult.effectiveHours
        : scrollResult.effectiveHours;

    const resources = await lockGuildResources(tx, occGuildId);
    const newResources = {
      ...resources,
      stone: resources.stone + (gainedKind === "stone" ? gainedAmount : 0),
      scrolls:
        resources.scrolls + (gainedKind === "scrolls" ? gainedAmount : 0),
    };

    if (gainedAmount > 0) {
      await upsertGuildResources(tx, occGuildId, newResources);
      await tx
        .update(outpostOccupations)
        .set({ lastHarvestedAt: new Date(now) })
        .where(eq(outpostOccupations.outpostId, outpost.id));
    }

    return {
      status: 200,
      body: {
        ok: true as const,
        gained: gainedAmount,
        gainedKind,
        effectiveHours,
        resources: newResources,
      },
    };
  });

  return Response.json(result.body, { status: result.status });
}
