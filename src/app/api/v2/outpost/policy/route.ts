import { eq } from "drizzle-orm";
import { db } from "@/db";
import { outpostOccupations } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { isGuildAdmin } from "@/lib/server/guildAdmin";
import { resolveOutpostMeta, isTileOutpostId } from "@/adventure/data/v2/tileWarfare";
import { V2_TILE_WARFARE } from "@/adventure/data/v2/settlementWarfareConfig";

// POST /api/v2/outpost/policy — 점령자가 정책/세율 설정.
//
// body: { outpostId, policy?, taxRate? } — 둘 중 하나는 있어야.
// 점령자(occupiedByUserId === userId) 또는 점령 길드의 마스터/관리자(길드 관리탭).
//
// policy: "open" | "guild-only"
//   - open: 누구나 입장 가능, taxRate 만큼 점령자에게 세금
//   - guild-only: 점령 길드 멤버만 입장 가능 (그 외 차단)
// taxRate: 0 ~ 0.5 (50% cap, 점령자 abuse 방지).

const VALID_POLICIES = ["open", "guild-only"] as const;
// 골드 세율 하한 10%·상한 50%. 점령 거점은 최소 10% 징수(2026-06-22, 오너) — 0% 무징수 차단.
//   claim 기본값도 0.100. ⚠️ OutpostPolicyEditor 의 동명 상수와 동기화 유지.
const TAX_RATE_MIN = 0.1;
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
  const outpostId = body.outpostId;
  // 타일 전쟁 — tile id 는 카탈로그 메타가 없으므로 점령행 기준으로 정책 설정(실제 존재는
  //   아래 occupation 조회가 판정·미점령이면 not_occupied). flag off → tile id 는 미지로 거부.
  const known =
    resolveOutpostMeta(outpostId) != null ||
    (V2_TILE_WARFARE && isTileOutpostId(outpostId));
  if (!known) {
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
      body.taxRate < TAX_RATE_MIN ||
      body.taxRate > TAX_RATE_MAX
    ) {
      return Response.json(
        { ok: false, error: "bad_tax_rate", min: TAX_RATE_MIN, max: TAX_RATE_MAX },
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
        .where(eq(outpostOccupations.outpostId, outpostId))
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
      // 길드 점령 거점이면 길드 마스터/관리자도 설정 가능 (길드 관리탭).
      const adminOk =
        occ.occupiedByGuildId != null &&
        (await isGuildAdmin(tx, occ.occupiedByGuildId, userId));
      if (!adminOk) {
        return {
          status: 403,
          body: { ok: false as const, error: "not_owner" as const },
        };
      }
    }
    await tx
      .update(outpostOccupations)
      .set(updates)
      .where(eq(outpostOccupations.outpostId, outpostId));
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
