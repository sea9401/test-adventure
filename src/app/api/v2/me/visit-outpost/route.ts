import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { OUTPOSTS } from "@/adventure/data/v2/outposts";
import { canMoveToOutpost } from "@/adventure/data/v2/outpostGraph";

// POST /api/v2/me/visit-outpost — 현재 머무는 거점 갱신.
//
// 본문: { outpostId: string }
// character.v2.lastVisitedOutpost = { outpostId, at }. V2TopBar 좌측 표시용.
// idempotent — 같은 outpostId 라도 at 만 갱신.
//
// 이동은 인접 거점으로만 — 현재 거점과 인접하지 않은 곳은 거부(not_adjacent). 현재 거점
// 기록이 없으면 시작 거점(START_OUTPOST_ID)을 기준으로 본다(부트스트랩). 클라(ContinentMap)도
// 같은 규칙으로 게이트하므로, 이 검증은 권위/치트 방지용 2차 방어다.

type CharSave = {
  lastVisitedOutpost?: { outpostId?: string; at?: number };
  [k: string]: unknown;
};

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { outpostId?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (
    typeof body.outpostId !== "string" ||
    !OUTPOSTS.some((o) => o.id === body.outpostId)
  ) {
    return Response.json({ ok: false, error: "bad_outpost" }, { status: 400 });
  }
  const outpostId = body.outpostId;

  let notAdjacent = false;
  await db.transaction(async (tx) => {
    const charSave = await lockSaveForUpdate<CharSave>(
      tx,
      userId,
      "character.v2",
      {},
    );
    // 이동 게이트(권위) — 저장된 현재 거점(없거나 미지값이면 시작 거점)에서 인접한 곳,
    // 또는 같은 거점 재진입만 허용. 규칙은 outpostGraph.canMoveToOutpost 로 일원화(테스트됨).
    const savedId = charSave.lastVisitedOutpost?.outpostId;
    if (!canMoveToOutpost(savedId, outpostId)) {
      notAdjacent = true;
      return; // 쓰기 없이 종료 — 위치 변경 안 함.
    }
    await upsertSave(tx, userId, "character.v2", {
      ...charSave,
      lastVisitedOutpost: { outpostId, at: Date.now() },
    });
  });

  if (notAdjacent) {
    return Response.json(
      { ok: false, error: "not_adjacent" },
      { status: 400 },
    );
  }

  return Response.json({ ok: true, outpostId });
}
