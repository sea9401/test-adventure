import { eq } from "drizzle-orm";
import { db } from "@/db";
import { outpostOccupations } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { OUTPOSTS } from "@/adventure/data/v2/outposts";

// POST /api/v2/outpost/policy — 점령자가 정책/세율 설정.
//
// body: { outpostId, policy?, taxRate? } — 둘 중 하나는 있어야.
// 점령자(occupiedByUserId === userId) 만 가능.
//
// policy: "open" | "alliance" | "guild-only"
//   - alliance / guild-only 는 데이터 저장만, 효과(입장 거부 등)는 후속 PR.
// taxRate: 0 ~ 0.5 (50% cap, 점령자 abuse 방지).

const VALID_POLICIES = ["open", "alliance", "guild-only"] as const;
const TAX_RATE_MAX = 0.5;

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { outpostId?: unknown; policy?: unknown; taxRate?: unknown };
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

  const updates: { policy?: string; taxRate?: string } = {};
  if (body.policy !== undefined) {
    if (
      typeof body.policy !== "string" ||
      !(VALID_POLICIES as readonly string[]).includes(body.policy)
    ) {
      return Response.json({ ok: false, error: "bad_policy" }, { status: 400 });
    }
    updates.policy = body.policy;
  }
  if (body.taxRate !== undefined) {
    if (
      typeof body.taxRate !== "number" ||
      !Number.isFinite(body.taxRate) ||
      body.taxRate < 0 ||
      body.taxRate > TAX_RATE_MAX
    ) {
      return Response.json(
        { ok: false, error: "bad_tax_rate", max: TAX_RATE_MAX },
        { status: 400 },
      );
    }
    updates.taxRate = body.taxRate.toFixed(3);
  }
  if (Object.keys(updates).length === 0) {
    return Response.json(
      { ok: false, error: "nothing_to_update" },
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
    await tx
      .update(outpostOccupations)
      .set(updates)
      .where(eq(outpostOccupations.outpostId, outpost.id));
    return {
      status: 200,
      body: {
        ok: true as const,
        policy: updates.policy ?? occ.policy,
        taxRate: updates.taxRate ?? occ.taxRate,
      },
    };
  });

  return Response.json(result.body, { status: result.status });
}
