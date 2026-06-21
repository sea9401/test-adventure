import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { savesKv } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { ownedTitleIdsOf } from "@/lib/server/grantTitle";
import { TITLES } from "@/adventure/data/titles";

// POST /api/v2/me/equip-title — 모험의 서 "칭호" 탭에서 칭호 장착/해제.
//
// body { titleId: string | null }
//   - null            → 해제 (character.v2.equippedTitleId = null).
//   - 보유한 titleId  → 장착.
//   - 미보유/미존재    → 거부 (채팅·접속자엔 resolveActor 가 보유검증으로 한 번 더 막지만,
//                       저장 단계에서 막아 변조 자체를 차단).
//
// 보유 출처 = adventure-log.v2.titles (낚시/유물/투기장 상점·수집 보상이 grant). 옛 V1
// 칭호는 v2 에서 grant 되지 않으므로 자연히 장착 불가.
//
// 보유 검증은 락 없이 읽는다 — titles 맵은 증가만 하므로 stale read 의 최악은 방금 받은
// 칭호를 못 끼우는 정도(재시도로 해소)이고, character.v2 와의 락 순서 얽힘을 피한다.
// 쓰기만 character.v2 를 잠가 동시 사냥 등의 write 와 직렬화.
export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { titleId?: unknown };
  try {
    body = (await req.json()) as { titleId?: unknown };
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const raw = body.titleId;
  if (raw !== null && typeof raw !== "string") {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }
  const titleId = raw as string | null;

  if (titleId !== null) {
    if (!TITLES[titleId]) {
      return Response.json(
        { ok: false, error: "unknown_title" },
        { status: 400 },
      );
    }
    const logRow = (
      await db
        .select({ value: savesKv.value })
        .from(savesKv)
        .where(
          and(eq(savesKv.userId, userId), eq(savesKv.key, "adventure-log.v2")),
        )
        .limit(1)
    )[0];
    if (!ownedTitleIdsOf(logRow?.value).includes(titleId)) {
      return Response.json({ ok: false, error: "not_owned" }, { status: 400 });
    }
  }

  await db.transaction(async (tx) => {
    const charSave = await lockSaveForUpdate<{ equippedTitleId?: unknown }>(
      tx,
      userId,
      "character.v2",
      {},
    );
    await upsertSave(tx, userId, "character.v2", {
      ...charSave,
      equippedTitleId: titleId,
    });
  });

  return Response.json({ ok: true, equippedTitleId: titleId });
}
