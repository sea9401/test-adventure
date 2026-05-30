import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { V2_STAT_KEYS, type V2StatKey } from "@/adventure/data/v2/v2StatKeys";

// POST /api/v2/me/training/reset — 분배 전체 초기화.
// 모든 allocated 를 0 으로, 분배했던 합계를 points 로 환불. 비용 없음.
// 응답: { ok, unspentPoints, allocatedStats, refunded }

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
    // PR-2 — 저장된 allocated 의 모든 값을 환급(레거시 spd 등 폐기 키 포인트도 보존).
    let refunded = 0;
    for (const v of Object.values(training.allocated ?? {})) {
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
