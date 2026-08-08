import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { battleReplays } from "@/db/schema";
import type { ReplayPayload } from "@/adventure/data/v2/replayPayload";
import { ensureUser } from "@/lib/server/ensureUser";

type Ctx = {
  params: Promise<{ replayId: string }>;
};

function parseStoredReplay(value: unknown): ReplayPayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const replay = value as Partial<ReplayPayload>;
  if (!replay.enemy || typeof replay.enemy !== "object") return null;
  if (!Number.isFinite(replay.playerMaxHp)) return null;
  if (!Number.isFinite(replay.playerMaxMp)) return null;
  if (!Array.isArray(replay.log) || replay.log.length === 0) return null;
  return replay as ReplayPayload;
}

// 묶음 결과의 전체 전투 로그 단건 조회. replayId는 추측하기 어려운 UUID지만 소유자 조건도
// 함께 걸어 다른 사용자의 아레나·사냥 기록을 직접 조회할 수 없게 한다.
export async function GET(_req: Request, { params }: Ctx) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const { replayId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(replayId)) {
    return Response.json({ ok: false, error: "no_replay" }, { status: 404 });
  }

  const [row] = await db
    .select({ payload: battleReplays.payload })
    .from(battleReplays)
    .where(
      and(
        eq(battleReplays.id, replayId),
        eq(battleReplays.userId, userId),
        gt(battleReplays.expiresAt, new Date()),
      ),
    )
    .limit(1);
  const replay = parseStoredReplay(row?.payload);
  if (!replay) {
    return Response.json({ ok: false, error: "no_replay" }, { status: 404 });
  }

  return Response.json(
    { ok: true, replay },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
