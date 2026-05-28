import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";

// POST /api/v2/me/training/start — 12시간 훈련 타이머 시작.
// 이미 진행 중이면 409. 끝난 직후엔 claim 먼저.
// 응답: { ok: true, endsAt }

export const TRAINING_DURATION_MS = 12 * 60 * 60 * 1000;

type TrainingSave = {
  endsAt?: number | null;
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
    const cur = typeof save.endsAt === "number" ? save.endsAt : null;
    if (cur && cur > now) {
      return {
        status: 409,
        body: { ok: false as const, error: "already_training" as const, endsAt: cur },
      };
    }
    if (cur && cur <= now) {
      // 완료 후 미수령 — 먼저 claim 강제.
      return {
        status: 409,
        body: { ok: false as const, error: "claim_first" as const, endsAt: cur },
      };
    }
    const endsAt = now + TRAINING_DURATION_MS;
    await upsertSave(tx, userId, "training.v2", { ...save, endsAt });
    return { status: 200, body: { ok: true as const, endsAt } };
  });

  return Response.json(result.body, { status: result.status });
}
