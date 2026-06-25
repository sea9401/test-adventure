import { eq } from "drizzle-orm";
import { db } from "@/db";
import { outpostClaimAttempts } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";

// GET /api/v2/outpost/attacks/replay?attemptId=...
//
// 공격 기록 한 건의 전투 리플레이(StoredReplayEnvelope) — 공격 기록 패널
// "전투 보기" 가 단건 lazy 조회. 게이트는 attacks GET 과 동일(인증된 누구나·정찰).
//
//   - attempt 없음 / replay 없음(트림됨·토너먼트) → 404
//   - 미인증 → 401

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
      .select({ replay: outpostClaimAttempts.replay })
      .from(outpostClaimAttempts)
      .where(eq(outpostClaimAttempts.id, attemptId))
      .limit(1)
  )[0];
  if (!attempt || attempt.replay == null) {
    return Response.json({ ok: false, error: "no_replay" }, { status: 404 });
  }

  // 공격 기록 리플레이는 정찰 정보 — 인증된 누구나 읽기 가능(소유권 게이트 없음).

  return Response.json({ ok: true, replay: attempt.replay });
}
