import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { V2_STAT_KEYS, type V2StatKey } from "@/adventure/data/v2/v2StatKeys";

// POST /api/v2/me/training/commit — 분배 일괄 적용 (양수만).
// 본문: { deltas: Record<V2StatKey, number> } — 모든 값 ≥ 0. 합산만큼 points 소모.
// 옛 음수 분배(= revertPoints 소모) 경로 폐기. 되돌리기는 /reset 으로 일괄.

const ZERO: Record<V2StatKey, number> = V2_STAT_KEYS.reduce(
  (acc, k) => {
    acc[k] = 0;
    return acc;
  },
  {} as Record<V2StatKey, number>,
);

type TrainingSave = {
  points?: number;
  allocated?: Partial<Record<V2StatKey, number>>;
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
  const deltas: Record<V2StatKey, number> = { ...ZERO };
  for (const k of V2_STAT_KEYS) {
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
  const total = V2_STAT_KEYS.reduce((s, k) => s + deltas[k], 0);
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
    const curAllocated: Record<V2StatKey, number> = { ...ZERO };
    // PR-2 마이그 — 폐기 키(레거시 spd 등)의 분배분은 points 로 환수해 재분배 가능(소실 방지).
    let legacyReclaim = 0;
    for (const [k, v] of Object.entries(training.allocated ?? {})) {
      if (typeof v !== "number" || !Number.isFinite(v) || v < 0) continue;
      if ((V2_STAT_KEYS as readonly string[]).includes(k)) {
        curAllocated[k as V2StatKey] = Math.floor(v);
      } else {
        legacyReclaim += Math.floor(v);
      }
    }
    const nextPoints = curPoints + legacyReclaim - total;
    if (nextPoints < 0) {
      return {
        status: 400,
        body: { ok: false as const, error: "insufficient_points" as const },
      };
    }
    const nextAllocated: Record<V2StatKey, number> = { ...curAllocated };
    for (const k of V2_STAT_KEYS) {
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
