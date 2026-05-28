import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";

// POST /api/v2/me/training/claim — 훈련 완료 시점 도달 시 보상 적립.
// 보상: points +2, completedCount +1, endsAt null.
// 아직 진행 중이면 409. 안 시작했으면 400.

export const TRAINING_REWARD_POINTS = 2;

type TrainingSave = {
  endsAt?: number | null;
  points?: number;
  completedCount?: number;
  [k: string]: unknown;
};

export async function POST() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const result = await db.transaction(async (tx) => {
    const save = await lockSaveForUpdate<TrainingSave>(
      tx,
      userId,
      "training.v2",
      {},
    );
    const now = Date.now();
    const endsAt = typeof save.endsAt === "number" ? save.endsAt : null;
    if (!endsAt) {
      return {
        status: 400,
        body: { ok: false as const, error: "not_training" as const },
      };
    }
    if (endsAt > now) {
      return {
        status: 409,
        body: {
          ok: false as const,
          error: "still_training" as const,
          endsAt,
        },
      };
    }
    const points = Math.max(0, save.points ?? 0) + TRAINING_REWARD_POINTS;
    const completedCount = Math.max(0, save.completedCount ?? 0) + 1;
    await upsertSave(tx, userId, "training.v2", {
      ...save,
      endsAt: null,
      points,
      completedCount,
    });
    return {
      status: 200,
      body: {
        ok: true as const,
        points,
        completedCount,
        reward: TRAINING_REWARD_POINTS,
      },
    };
  });

  return Response.json(result.body, { status: result.status });
}
