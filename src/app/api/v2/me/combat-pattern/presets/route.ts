import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import {
  parseV2SkillsState,
  emptyV2SkillsState,
  type V2SkillsState,
} from "@/adventure/data/v2/v2Skills";
import { parseCombatPresets } from "@/adventure/v2/combat/combatPattern";

// POST /api/v2/me/combat-pattern/presets — 전투 패턴 프리셋 라이브러리 저장(C4).
// body: { presets: [{ name, pattern: { blocks } }, ...] }. 클라가 라이브러리 전체를 보내면
// 검증 파싱(항목·블록 단위 drop, 이름 trim·길이/개수 상한)해 skills.v2.presets 에 덮어쓴다.
// learned/equipped/활성 pattern 은 불변(spread 보존) — 활성 패턴 적용은 combat-pattern 라우트.
export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { presets?: unknown };
  try {
    body = (await req.json()) as { presets?: unknown };
  } catch {
    body = {};
  }
  // 들어온 raw 를 검증 파싱 — 손상/잘못된 항목·블록은 drop(통째 거부 아님).
  const presets = parseCombatPresets(body.presets);

  const saved = await db.transaction(async (tx) => {
    const skills = parseV2SkillsState(
      await lockSaveForUpdate<V2SkillsState>(
        tx,
        userId,
        "skills.v2",
        emptyV2SkillsState(),
      ),
    );
    const next: V2SkillsState = { ...skills, presets };
    await upsertSave(tx, userId, "skills.v2", next);
    return presets;
  });

  return Response.json({ ok: true, presets: saved });
}
