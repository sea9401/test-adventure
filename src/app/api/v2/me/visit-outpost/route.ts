import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { OUTPOSTS } from "@/adventure/data/v2/outposts";

// POST /api/v2/me/visit-outpost — 현재 머무는 거점 갱신.
//
// 본문: { outpostId: string }
// character.v2.lastVisitedOutpost = { outpostId, at }. V2TopBar 좌측 표시용.
// idempotent — 같은 outpostId 라도 at 만 갱신.

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

  await db.transaction(async (tx) => {
    const charSave = await lockSaveForUpdate<CharSave>(
      tx,
      userId,
      "character.v2",
      {},
    );
    await upsertSave(tx, userId, "character.v2", {
      ...charSave,
      lastVisitedOutpost: { outpostId, at: Date.now() },
    });
  });

  return Response.json({ ok: true, outpostId });
}
