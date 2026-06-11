import { eq } from "drizzle-orm";
import { db } from "@/db";
import { outpostClaimAttempts, outpostOccupations } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { getGuildId } from "@/lib/server/v2EnsureSoloGuild";

// GET /api/v2/outpost/attacks/replay?attemptId=...
//
// 공격 기록 한 건의 전투 리플레이(StoredReplayEnvelope) — 공격 기록 패널
// "전투 보기" 가 단건 lazy 조회. outpostId 는 attempt 행에서 파생하고,
// 게이트는 attacks GET 과 동일(그 거점의 점령자 본인 or 점령 길드 멤버).
//
//   - attempt 없음 / replay 없음(트림됨·토너먼트) → 404
//   - 권한 없음 → 403

export async function GET(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const attemptId = Number(url.searchParams.get("attemptId"));
  if (!Number.isInteger(attemptId) || attemptId <= 0) {
    return Response.json({ ok: false, error: "bad_attempt" }, { status: 400 });
  }

  const attempt = (
    await db
      .select({
        outpostId: outpostClaimAttempts.outpostId,
        replay: outpostClaimAttempts.replay,
      })
      .from(outpostClaimAttempts)
      .where(eq(outpostClaimAttempts.id, attemptId))
      .limit(1)
  )[0];
  if (!attempt || attempt.replay == null) {
    return Response.json({ ok: false, error: "no_replay" }, { status: 404 });
  }

  // 권한 — attempt 의 거점 기준 (attacks GET 과 동일 게이트, tx 로 stale race 방지).
  const gate = await db.transaction(async (tx) => {
    const occ = (
      await tx
        .select({
          ownerUserId: outpostOccupations.occupiedByUserId,
          guildId: outpostOccupations.occupiedByGuildId,
        })
        .from(outpostOccupations)
        .where(eq(outpostOccupations.outpostId, attempt.outpostId))
        .limit(1)
    )[0];
    if (!occ || occ.ownerUserId == null) {
      return { error: "not_occupied" as const };
    }
    if (occ.ownerUserId === userId) return { ok: true as const };
    const viewerGuildId = await getGuildId(tx, userId);
    if (occ.guildId != null && viewerGuildId === occ.guildId) {
      return { ok: true as const };
    }
    return { error: "not_owner_guild" as const };
  });
  if ("error" in gate) {
    return Response.json({ ok: false, error: gate.error }, { status: 403 });
  }

  return Response.json({ ok: true, replay: attempt.replay });
}
