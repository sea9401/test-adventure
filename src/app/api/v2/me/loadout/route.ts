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
  includeLearnedLifestyleSkills,
  isLifestyleSkill,
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
import { readJobUnlockContext } from "@/lib/server/jobUnlockContext";

function isStrictOrderPreservingSubset(
  next: readonly V2SkillId[],
  current: readonly V2SkillId[],
): boolean {
  if (next.length >= current.length) return false;
  let currentIndex = 0;
  for (const skillId of next) {
    while (
      currentIndex < current.length &&
      current[currentIndex] !== skillId
    ) {
      currentIndex += 1;
    }
    if (currentIndex >= current.length) return false;
    currentIndex += 1;
  }
  return true;
}

// POST /api/v2/me/loadout — 수동 SP 로드아웃 저장(코어루프). body: { equipped: string[] }(우선순위 순서).
//   배운 스킬 중 SP 예산 내여야 통과(validateLoadout). 생활 패시브를 항상 합친 뒤 저장(순서 보존).
//   직업 SP 조정 유예 중인 초과 구성은 기존 순서를 보존한 순수 해제만 예외로 허용한다.
//   그 밖의 위반은 400 + 위반 버킷(UI 안내). learned 불변. 갬빗 pattern 보존(spread).
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
    const charSave = await lockSaveForUpdate<
      Record<string, unknown> & {
        class?: unknown;
        specChoice?: unknown;
      }
    >(tx, userId, "character.v2", {});
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
    const jobUnlockCtx = await readJobUnlockContext(tx, userId);
    const spBudget = calcSpBudget(
      prof.groups,
      spCapBonusFromRaw((charSave as { spFruitUsed?: unknown }).spFruitUsed),
      (await readCodexSpBonus(tx, userId)).total,
      jobUnlockSpBonus(prof, jobUnlockCtx),
    );

    const nextEquipped = includeLearnedLifestyleSkills(
      requested,
      skills.learned,
    );
    const check = validateLoadout(nextEquipped, skills.learned, spBudget);
    const combatIds = (ids: readonly V2SkillId[]) =>
      ids.filter((skillId) => !isLifestyleSkill(V2_SKILLS[skillId]));
    const currentEquipped = includeLearnedLifestyleSkills(
      skills.equipped,
      skills.learned,
    );
    const currentCheck = validateLoadout(
      currentEquipped,
      skills.learned,
      spBudget,
    );
    // 유예 중 초과 구성은 한 번에 전부 비우지 않아도 되도록 SP가 줄어드는 순수 해제를 허용한다.
    const graceUnequipAllowed =
      jobUnlockCtx.jobSpRebalance?.active === true &&
      check.overBudget &&
      check.notLearned.length === 0 &&
      check.unknown.length === 0 &&
      check.exclusiveConflicts.length === 0 &&
      check.spUsed < currentCheck.spUsed &&
      isStrictOrderPreservingSubset(
        combatIds(nextEquipped),
        combatIds(currentEquipped),
      );
    if (!check.ok && !graceUnequipAllowed) {
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
          exclusiveConflicts: check.exclusiveConflicts,
        },
      };
    }
    const next: V2SkillsState = { ...skills, equipped: nextEquipped };
    await upsertSave(tx, userId, "skills.v2", next);
    if (requested.length > 0 && charSave.hasEditedSkillLoadout !== true) {
      await upsertSave(tx, userId, "character.v2", {
        ...charSave,
        hasEditedSkillLoadout: true,
      });
    }
    return {
      status: 200 as const,
      body: {
        ok: true as const,
        equipped: nextEquipped,
        spUsed: check.spUsed,
        spBudget: check.spBudget,
      },
    };
  });

  return Response.json(result.body, { status: result.status });
}
