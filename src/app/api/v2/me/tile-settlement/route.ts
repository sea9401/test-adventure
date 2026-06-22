import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { tileSettlements } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import {
  V2_CORE_LOOP_V2,
  V2_FREEFORM_TILES,
  spendGold,
} from "@/adventure/data/v2/coreLoopConfig";
import {
  TILE_BOARD_SIZE,
  TILE_OUTPOST_AT,
  tileKey,
  TILE_FOUND_COST,
  TILE_PROMOTE_COST,
  tileNextTier,
  isTileSettlementTier,
  tileSettlementName,
} from "@/adventure/data/v2/tileConfig";

// POST /api/v2/me/tile-settlement — 빈 땅 개척 정착지 건설/승격/철거. (자유 타일 지도 Phase 3)
//
// 본문: { action: "found" | "promote" | "demolish", col, row }
//  - found: 빈 칸(거점 아님·미정착)에 개척마을(frontier) 건설. TILE_FOUND_COST 골드.
//  - promote: 본인 정착지 한 단계 승격(frontier→village→city→metropolis). TILE_PROMOTE_COST.
//    개척마을→마을 승격이 영지를 얻는 가장 비싼 단계.
//  - demolish: 본인 정착지 철거(환불 없음).
//  - V2_FREEFORM_TILES off 면 404(플래그 게이트) — 라이브(flag off)는 이 테이블 무접촉.

type CharSave = { gold?: number; bankedGold?: number; [k: string]: unknown };

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// 골드 과금 — 코어루프 on 일 때만(은행 우선). 부족 시 ok:false. off 면 과금 없이 통과.
async function chargeGold(
  tx: Tx,
  userId: string,
  cost: number,
): Promise<{ ok: boolean; gold: number; bankedGold: number }> {
  const save = await lockSaveForUpdate<CharSave>(tx, userId, "character.v2", {});
  const gold =
    typeof save.gold === "number" && Number.isFinite(save.gold)
      ? Math.max(0, Math.floor(save.gold))
      : 0;
  const banked = Math.max(0, Math.floor(Number(save.bankedGold) || 0));
  if (!V2_CORE_LOOP_V2 || cost <= 0) {
    return { ok: true, gold, bankedGold: banked };
  }
  const spend = spendGold(gold, banked, cost);
  if (!spend.ok) return { ok: false, gold, bankedGold: banked };
  await upsertSave(tx, userId, "character.v2", {
    ...save,
    gold: spend.gold,
    bankedGold: spend.bankedGold,
  });
  return { ok: true, gold: spend.gold, bankedGold: spend.bankedGold };
}

export async function POST(req: Request) {
  if (!V2_FREEFORM_TILES) {
    return Response.json({ ok: false, error: "not_enabled" }, { status: 404 });
  }
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { action?: unknown; col?: unknown; row?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const action = body.action;
  const col = Number(body.col);
  const row = Number(body.row);
  const validTile =
    Number.isInteger(col) &&
    Number.isInteger(row) &&
    col >= 0 &&
    row >= 0 &&
    col < TILE_BOARD_SIZE &&
    row < TILE_BOARD_SIZE;
  if (
    !validTile ||
    (action !== "found" && action !== "promote" && action !== "demolish")
  ) {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  type Res =
    | { kind: "ok"; gold: number; bankedGold: number }
    | {
        kind: "err";
        status: number;
        error: string;
        gold?: number;
        required?: number;
      };

  const result: Res = await db.transaction(async (tx): Promise<Res> => {
    const existing = (
      await tx
        .select()
        .from(tileSettlements)
        .where(and(eq(tileSettlements.col, col), eq(tileSettlements.row, row)))
        .limit(1)
    )[0];

    if (action === "found") {
      if (TILE_OUTPOST_AT.has(tileKey(col, row))) {
        return { kind: "err", status: 400, error: "tile_is_outpost" };
      }
      if (existing) {
        return { kind: "err", status: 409, error: "already_settled" };
      }
      const charge = await chargeGold(tx, userId, TILE_FOUND_COST);
      if (!charge.ok) {
        return {
          kind: "err",
          status: 409,
          error: "out_of_gold",
          required: TILE_FOUND_COST,
          gold: charge.gold,
        };
      }
      await tx.insert(tileSettlements).values({
        col,
        row,
        userId,
        tier: "frontier",
        name: tileSettlementName(col, row),
      });
      return { kind: "ok", gold: charge.gold, bankedGold: charge.bankedGold };
    }

    // promote / demolish — 본인 정착지여야.
    if (!existing) return { kind: "err", status: 404, error: "not_found" };
    if (existing.userId !== userId) {
      return { kind: "err", status: 403, error: "not_owner" };
    }

    if (action === "demolish") {
      await tx
        .delete(tileSettlements)
        .where(and(eq(tileSettlements.col, col), eq(tileSettlements.row, row)));
      const cur = await chargeGold(tx, userId, 0); // 읽기용(과금 0).
      return { kind: "ok", gold: cur.gold, bankedGold: cur.bankedGold };
    }

    // promote
    const tier = isTileSettlementTier(existing.tier) ? existing.tier : "frontier";
    const next = tileNextTier(tier);
    if (!next) return { kind: "err", status: 409, error: "max_tier" };
    const cost = TILE_PROMOTE_COST[tier];
    const charge = await chargeGold(tx, userId, cost);
    if (!charge.ok) {
      return {
        kind: "err",
        status: 409,
        error: "out_of_gold",
        required: cost,
        gold: charge.gold,
      };
    }
    await tx
      .update(tileSettlements)
      .set({ tier: next })
      .where(and(eq(tileSettlements.col, col), eq(tileSettlements.row, row)));
    return { kind: "ok", gold: charge.gold, bankedGold: charge.bankedGold };
  });

  if (result.kind === "err") {
    return Response.json(
      {
        ok: false,
        error: result.error,
        ...(result.required != null ? { requiredGold: result.required } : {}),
        ...(result.gold != null ? { gold: result.gold } : {}),
      },
      { status: result.status },
    );
  }
  return Response.json({
    ok: true,
    ...(V2_CORE_LOOP_V2
      ? { gold: result.gold, bankedGold: result.bankedGold }
      : {}),
  });
}
