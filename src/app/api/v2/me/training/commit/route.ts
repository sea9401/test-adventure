import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { STAT_KEYS, type StatKey } from "@/adventure/data/stats";

// POST /api/v2/me/training/commit — 분배 일괄 적용 (양수만).
// 본문: { deltas: Record<StatKey, number> } — 모든 값 ≥ 0. 합산만큼 points 소모.
// 옛 음수 분배(= revertPoints 소모) 경로 폐기. 되돌리기는 /reset 으로 일괄.

const ZERO: Record<StatKey, number> = STAT_KEYS.reduce(
  (acc, k) => {
    acc[k] = 0;
    return acc;
  },
  {} as Record<StatKey, number>,
);

type TrainingSave = {
  points?: number;
  allocated?: Partial<Record<StatKey, number>>;
  [k: string]: unknown;
};

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  let body: { deltas?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (!body.deltas || typeof body.deltas !== "object") {
    return Response.json({ ok: false, error: "bad_intent" }, { status: 400 });
  }
  const rawDeltas = body.deltas as Record<string, unknown>;
  const deltas: Record<StatKey, number> = { ...ZERO };
  for (const k of STAT_KEYS) {
    const v = rawDeltas[k];
    if (v === undefined) continue;
    if (
      typeof v !== "number" ||
      !Number.isFinite(v) ||
      !Number.isInteger(v) ||
      v < 0
    ) {
      return Response.json(
        { ok: false, error: "bad_delta", stat: k },
        { status: 400 },
      );
    }
    deltas[k] = v;
  }
  const total = STAT_KEYS.reduce((s, k) => s + deltas[k], 0);
  if (total <= 0) {
    return Response.json({ ok: false, error: "empty_draft" }, { status: 400 });
  }

  const result = await db.transaction(async (tx) => {
    const training = await lockSaveForUpdate<TrainingSave>(
      tx,
      userId,
      "training.v2",
      {},
    );
    const curPoints = Math.max(0, training.points ?? 0);
    const curAllocated: Record<StatKey, number> = { ...ZERO };
    for (const k of STAT_KEYS) {
      const v = training.allocated?.[k];
      if (typeof v === "number" && Number.isFinite(v) && v >= 0) {
        curAllocated[k] = Math.floor(v);
      }
    }
    const nextPoints = curPoints - total;
    if (nextPoints < 0) {
      return {
        status: 400,
        body: { ok: false as const, error: "insufficient_points" as const },
      };
    }
    const nextAllocated: Record<StatKey, number> = { ...curAllocated };
    for (const k of STAT_KEYS) {
      nextAllocated[k] = curAllocated[k] + deltas[k];
    }
    await upsertSave(tx, userId, "training.v2", {
      ...training,
      points: nextPoints,
      allocated: nextAllocated,
    });
    return {
      status: 200,
      body: {
        ok: true as const,
        unspentPoints: nextPoints,
        allocatedStats: nextAllocated,
      },
    };
  });

  return Response.json(result.body, { status: result.status });
}
