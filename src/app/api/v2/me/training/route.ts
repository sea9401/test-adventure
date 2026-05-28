import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { savesKv } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { V2_BASE_STATS } from "@/lib/server/derivePlayerCombatV2";
import { STAT_KEYS, type StatKey } from "@/adventure/data/stats";

// GET /api/v2/me/training — V2GrowthShrineView 의 자체 fetch.
// training.v2 + baseStats + character.v2.gold/level 한 번에.

const ZERO: Record<StatKey, number> = STAT_KEYS.reduce(
  (acc, k) => {
    acc[k] = 0;
    return acc;
  },
  {} as Record<StatKey, number>,
);

export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const [trainingRow, charRow] = await Promise.all([
    db
      .select({ value: savesKv.value })
      .from(savesKv)
      .where(and(eq(savesKv.userId, userId), eq(savesKv.key, "training.v2")))
      .limit(1)
      .then((rows) => rows[0]),
    db
      .select({ value: savesKv.value })
      .from(savesKv)
      .where(and(eq(savesKv.userId, userId), eq(savesKv.key, "character.v2")))
      .limit(1)
      .then((rows) => rows[0]),
  ]);

  const training = (trainingRow?.value ?? {}) as {
    points?: number;
    allocated?: Partial<Record<StatKey, number>>;
    endsAt?: number | null;
    completedCount?: number;
  };
  const charSave = (charRow?.value ?? {}) as {
    gold?: number;
    level?: number;
  };

  const allocated: Record<StatKey, number> = { ...ZERO };
  for (const k of STAT_KEYS) {
    const v = training.allocated?.[k];
    if (typeof v === "number" && Number.isFinite(v) && v >= 0) {
      allocated[k] = Math.floor(v);
    }
  }

  return Response.json({
    ok: true,
    unspentPoints: Math.max(0, training.points ?? 0),
    allocatedStats: allocated,
    baseStats: V2_BASE_STATS,
    gold: Math.max(0, charSave.gold ?? 0),
    level: Math.max(1, charSave.level ?? 1),
    // 훈련 진행 상태 (V2TrainingView 용).
    endsAt: typeof training.endsAt === "number" ? training.endsAt : null,
    completedCount: Math.max(0, training.completedCount ?? 0),
  });
}
