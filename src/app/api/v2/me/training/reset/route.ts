import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { STAT_KEYS, type StatKey } from "@/adventure/data/stats";

// POST /api/v2/me/training/reset — 분배 전체 초기화.
// 모든 allocated 를 0 으로, 분배했던 합계를 points 로 환불. 비용 없음.
// 응답: { ok, unspentPoints, allocatedStats, refunded }

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

export async function POST() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const result = await db.transaction(async (tx) => {
    const training = await lockSaveForUpdate<TrainingSave>(
      tx,
      userId,
      "training.v2",
      {},
    );
    const curPoints = Math.max(0, training.points ?? 0);
    let refunded = 0;
    for (const k of STAT_KEYS) {
      const v = training.allocated?.[k];
      if (typeof v === "number" && Number.isFinite(v) && v >= 0) {
        refunded += Math.floor(v);
      }
    }
    if (refunded === 0) {
      return {
        status: 200,
        body: {
          ok: true as const,
          unspentPoints: curPoints,
          allocatedStats: { ...ZERO },
          refunded: 0,
        },
      };
    }
    const nextPoints = curPoints + refunded;
    await upsertSave(tx, userId, "training.v2", {
      ...training,
      points: nextPoints,
      allocated: { ...ZERO },
    });
    return {
      status: 200,
      body: {
        ok: true as const,
        unspentPoints: nextPoints,
        allocatedStats: { ...ZERO },
        refunded,
      },
    };
  });

  return Response.json(result.body, { status: result.status });
}
