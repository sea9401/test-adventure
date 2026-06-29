import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import {
  emptyV2SkillsState,
  normalizeSkillOrder,
  parseV2SkillsState,
  type V2SkillsState,
} from "@/adventure/data/v2/v2Skills";

// POST /api/v2/me/skill-order — 학습 스킬 라이브러리 표시 순서 저장.
//   전투 우선순위(equipped)와 분리된 순수 UI 정렬값. 손상/미학습 id 는 서버에서 제거한다.
export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { order?: unknown };
  try {
    body = (await req.json()) as { order?: unknown };
  } catch {
    body = {};
  }

  const result = await db.transaction(async (tx) => {
    const skills = parseV2SkillsState(
      await lockSaveForUpdate<V2SkillsState>(
        tx,
        userId,
        "skills.v2",
        emptyV2SkillsState(),
      ),
    );
    const skillOrder = normalizeSkillOrder(body.order, skills.learned);
    const next: V2SkillsState =
      skillOrder.length > 0
        ? { ...skills, skillOrder }
        : { ...skills, skillOrder: undefined };
    await upsertSave(tx, userId, "skills.v2", next);
    return { ok: true as const, skillOrder };
  });

  return Response.json(result);
}
