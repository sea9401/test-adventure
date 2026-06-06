import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import {
  parseV2SkillsState,
  emptyV2SkillsState,
  type V2SkillsState,
} from "@/adventure/data/v2/v2Skills";
import { parseCombatPattern } from "@/adventure/v2/combat/combatPattern";

// POST /api/v2/me/combat-pattern — 전투 패턴(갬빗) 저장. body: { blocks: [{condition, action}, ...] }.
// skills.v2.pattern 에 검증 파싱(블록 단위 drop)해 저장. learned/equipped 는 불변. 다른 스킬
// 라우트(learn/equip)는 pattern 을 보존(spread). 패턴 = 우선순위 {조건→행동} 리스트(C2).
export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { blocks?: unknown };
  try {
    body = (await req.json()) as { blocks?: unknown };
  } catch {
    body = {};
  }
  // 들어온 raw 를 검증 파싱 — 손상/구버전/잘못된 블록은 drop(통째 거부 아님).
  const pattern = parseCombatPattern(body);

  const saved = await db.transaction(async (tx) => {
    const skills = parseV2SkillsState(
      await lockSaveForUpdate<V2SkillsState>(
        tx,
        userId,
        "skills.v2",
        emptyV2SkillsState(),
      ),
    );
    const next: V2SkillsState = { ...skills, pattern };
    await upsertSave(tx, userId, "skills.v2", next);
    return pattern;
  });

  return Response.json({ ok: true, pattern: saved });
}
