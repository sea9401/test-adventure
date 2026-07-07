import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, readSave, upsertSave } from "@/lib/server/savesKv";
import {
  parseProficiencyForChar,
  emptyProficiency,
  type V2ProficiencyState,
} from "@/adventure/data/v2/proficiency";
import {
  parseV2SkillsState,
  emptyV2SkillsState,
  V2_SKILLS,
  type V2SkillsState,
  type V2SkillId,
} from "@/adventure/data/v2/v2Skills";
import { validateLoadout } from "@/adventure/data/v2/v2Loadout";
import {
  V2_CORE_LOOP_V2,
  calcSpBudget,
} from "@/adventure/data/v2/coreLoopConfig";
import { spCapBonusFromRaw } from "@/adventure/data/v2/spFruit";
import { jobUnlockSpBonus } from "@/adventure/data/v2/v2JobCatalog";
import { readCodexSpBonus } from "@/lib/server/codexSpBonus";

// POST /api/v2/me/loadout — 수동 SP 로드아웃 저장(코어루프). body: { equipped: string[] }(우선순위 순서).
//   배운 스킬 중 SP 예산 내여야 통과(validateLoadout). 통과 시 그대로 저장(순서 보존),
//   위반이면 400 + 위반 버킷(UI 안내). learned 불변. 갬빗 pattern 보존(spread).
//   lock 순서: character.v2 → skills.v2 → proficiency.v2 (다른 스킬 라우트와 동일).
//   flag off: SP 로드아웃 개념 없음 → disabled(클라가 호출 안 함).
export async function GET() {
  if (!V2_CORE_LOOP_V2) {
    return Response.json({ ok: false, error: "disabled" }, { status: 404 });
  }
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const skills = parseV2SkillsState(
    await readSave<V2SkillsState>(
      db,
      userId,
      "skills.v2",
      emptyV2SkillsState(),
    ),
  );
  return Response.json({
    ok: true,
    learned: skills.learned,
    equipped: skills.equipped,
  });
}

export async function POST(req: Request) {
  if (!V2_CORE_LOOP_V2) {
    return Response.json({ ok: false, error: "disabled" }, { status: 404 });
  }
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { equipped?: unknown };
  try {
    body = (await req.json()) as { equipped?: unknown };
  } catch {
    body = {};
  }
  // 요청 정규화 — 문자열·카탈로그에 있는 id 만, 중복 제거(순서=우선순위 보존).
  //   카탈로그 크기(중복 제거 후 상한)로 입력 길이를 캡해 비정상 거대 배열을 조기 차단.
  const MAX_REQUEST = Object.keys(V2_SKILLS).length;
  const rawList = (Array.isArray(body.equipped) ? body.equipped : []).slice(
    0,
    MAX_REQUEST,
  );
  const seen = new Set<string>();
  const requested: V2SkillId[] = [];
  for (const v of rawList) {
    if (typeof v !== "string" || seen.has(v)) continue;
    if (!(v in V2_SKILLS)) continue;
    seen.add(v);
    requested.push(v as V2SkillId);
  }

  const result = await db.transaction(async (tx) => {
    const charSave = await lockSaveForUpdate<{
      class?: unknown;
      specChoice?: unknown;
    }>(tx, userId, "character.v2", {});
    const skills = parseV2SkillsState(
      await lockSaveForUpdate<V2SkillsState>(
        tx,
        userId,
        "skills.v2",
        emptyV2SkillsState(),
      ),
    );
    const prof = parseProficiencyForChar(
      await lockSaveForUpdate<V2ProficiencyState>(
        tx,
        userId,
        "proficiency.v2",
        emptyProficiency(),
      ),
      charSave,
    );
    const spBudget = calcSpBudget(
      prof.groups,
      spCapBonusFromRaw((charSave as { spFruitUsed?: unknown }).spFruitUsed),
      (await readCodexSpBonus(tx, userId)).total,
      jobUnlockSpBonus(prof),
    );

    const check = validateLoadout(requested, skills.learned, spBudget);
    if (!check.ok) {
      return {
        status: 400 as const,
        body: {
          ok: false as const,
          error: "invalid_loadout" as const,
          spUsed: check.spUsed,
          spBudget: check.spBudget,
          overBudget: check.overBudget,
          notLearned: check.notLearned,
          unknown: check.unknown,
        },
      };
    }
    const next: V2SkillsState = { ...skills, equipped: requested };
    await upsertSave(tx, userId, "skills.v2", next);
    return {
      status: 200 as const,
      body: {
        ok: true as const,
        equipped: requested,
        spUsed: check.spUsed,
        spBudget: check.spBudget,
      },
    };
  });

  return Response.json(result.body, { status: result.status });
}
