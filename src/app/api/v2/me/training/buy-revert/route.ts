import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { revertPointPriceFor } from "@/adventure/character/GrowthShrineView";

// POST /api/v2/me/training/buy-revert — 골드로 되돌리기 포인트 구매.
//
// 본문: { qty: number } (양의 정수)
// 비용 = qty × revertPointPriceFor(level). character.v2 + training.v2 두 save lock 필요
// (정렬 순서: 키 알파벳 — character.v2 → training.v2).

type CharSave = {
  gold?: number;
  level?: number;
  [k: string]: unknown;
};
type TrainingSave = {
  revertPoints?: number;
  [k: string]: unknown;
};

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  let body: { qty?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (
    typeof body.qty !== "number" ||
    !Number.isFinite(body.qty) ||
    !Number.isInteger(body.qty) ||
    body.qty <= 0
  ) {
    return Response.json({ ok: false, error: "bad_qty" }, { status: 400 });
  }
  const qty = body.qty;

  const result = await db.transaction(async (tx) => {
    // 키 알파벳 순 — character.v2 → training.v2.
    const charSave = await lockSaveForUpdate<CharSave>(
      tx,
      userId,
      "character.v2",
      {},
    );
    const trainingSave = await lockSaveForUpdate<TrainingSave>(
      tx,
      userId,
      "training.v2",
      {},
    );
    const level = Math.max(1, charSave.level ?? 1);
    const price = revertPointPriceFor(level);
    const cost = price * qty;
    const curGold = Math.max(0, charSave.gold ?? 0);
    if (curGold < cost) {
      return {
        status: 400,
        body: {
          ok: false as const,
          error: "insufficient_gold" as const,
          required: cost,
          have: curGold,
        },
      };
    }
    const curRevert = Math.max(0, trainingSave.revertPoints ?? 0);
    await upsertSave(tx, userId, "character.v2", {
      ...charSave,
      gold: curGold - cost,
    });
    await upsertSave(tx, userId, "training.v2", {
      ...trainingSave,
      revertPoints: curRevert + qty,
    });
    return {
      status: 200,
      body: {
        ok: true as const,
        revertPoints: curRevert + qty,
        gold: curGold - cost,
        spent: cost,
      },
    };
  });

  return Response.json(result.body, { status: result.status });
}
