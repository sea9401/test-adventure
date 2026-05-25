import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { STAT_KEYS, type StatKey } from "@/adventure/data/stats";

// POST /api/v2/me/training/commit — 분배 드래프트 일괄 적용.
//
// 본문: { deltas: Record<StatKey, number> }
// 양수 deltas 는 unspentPoints 소모, 음수는 revertPoints 소모 + unspentPoints 환불.
// 한 번에 검증·적용 — 잔여 부족이면 거부, allocated 가 음수로 떨어지면 거부.

const ZERO: Record<StatKey, number> = STAT_KEYS.reduce(
  (acc, k) => {
    acc[k] = 0;
    return acc;
  },
  {} as Record<StatKey, number>,
);

type TrainingSave = {
  points?: number;
  revertPoints?: number;
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
    if (typeof v !== "number" || !Number.isFinite(v) || !Number.isInteger(v)) {
      return Response.json(
        { ok: false, error: "bad_delta", stat: k },
        { status: 400 },
      );
    }
    deltas[k] = v;
  }
  const plus = STAT_KEYS.reduce((s, k) => s + Math.max(0, deltas[k]), 0);
  const minus = STAT_KEYS.reduce((s, k) => s + Math.max(0, -deltas[k]), 0);
  if (plus === 0 && minus === 0) {
    return Response.json(
      { ok: false, error: "empty_draft" },
      { status: 400 },
    );
  }

  const result = await db.transaction(async (tx) => {
    const training = await lockSaveForUpdate<TrainingSave>(
      tx,
      userId,
      "training.v2",
      {},
    );
    const curPoints = Math.max(0, training.points ?? 0);
    const curRevert = Math.max(0, training.revertPoints ?? 0);
    const curAllocated: Record<StatKey, number> = { ...ZERO };
    for (const k of STAT_KEYS) {
      const v = training.allocated?.[k];
      if (typeof v === "number" && Number.isFinite(v) && v >= 0) {
        curAllocated[k] = Math.floor(v);
      }
    }
    // 양수 = points 소모, 음수 = revertPoints 소모 + points 환불.
    const nextPoints = curPoints - plus + minus;
    const nextRevert = curRevert - minus;
    if (nextPoints < 0) {
      return {
        status: 400,
        body: { ok: false as const, error: "insufficient_points" as const },
      };
    }
    if (nextRevert < 0) {
      return {
        status: 400,
        body: { ok: false as const, error: "insufficient_revert" as const },
      };
    }
    const nextAllocated: Record<StatKey, number> = { ...curAllocated };
    for (const k of STAT_KEYS) {
      const v = curAllocated[k] + deltas[k];
      if (v < 0) {
        return {
          status: 400,
          body: {
            ok: false as const,
            error: "negative_allocated" as const,
            stat: k,
          },
        };
      }
      nextAllocated[k] = v;
    }
    await upsertSave(tx, userId, "training.v2", {
      ...training,
      points: nextPoints,
      revertPoints: nextRevert,
      allocated: nextAllocated,
    });
    return {
      status: 200,
      body: {
        ok: true as const,
        unspentPoints: nextPoints,
        revertPoints: nextRevert,
        allocatedStats: nextAllocated,
      },
    };
  });

  return Response.json(result.body, { status: result.status });
}
