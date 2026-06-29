import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import {
  emptyV2SkillsState,
  normalizeFavoriteSkills,
  normalizeSkillOrder,
  parseV2SkillsState,
  type V2SkillsState,
} from "@/adventure/data/v2/v2Skills";

// POST /api/v2/me/skill-order — 학습 스킬 라이브러리 표시 순서/즐겨찾기 저장.
//   전투 우선순위(equipped)와 분리된 순수 UI 정렬값. 손상/미학습 id 는 서버에서 제거한다.
export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { order?: unknown; favorites?: unknown };
  try {
    body = (await req.json()) as { order?: unknown; favorites?: unknown };
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
    const skillOrder =
      body.order == null
        ? (skills.skillOrder ?? [])
        : normalizeSkillOrder(body.order, skills.learned);
    const favoriteSkills =
      body.favorites == null
        ? (skills.favoriteSkills ?? [])
        : normalizeFavoriteSkills(body.favorites, skills.learned);
    const next: V2SkillsState = {
      ...skills,
      skillOrder: skillOrder.length > 0 ? skillOrder : undefined,
      favoriteSkills:
        favoriteSkills.length > 0 ? favoriteSkills : undefined,
    };
    await upsertSave(tx, userId, "skills.v2", next);
    return { ok: true as const, skillOrder, favoriteSkills };
  });

  return Response.json(result);
}
