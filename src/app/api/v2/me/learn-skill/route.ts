import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import {
  parseV2Class,
  tier1ClassOf,
  elementalSkillsForClass,
} from "@/adventure/data/v2/classes";
import {
  parseProficiencyForChar,
  emptyProficiency,
  spendProficiency,
  usablePoints,
  type V2ProficiencyState,
} from "@/adventure/data/v2/proficiency";
import {
  parseV2SkillsState,
  emptyV2SkillsState,
  v2SkillLearnCost,
  type V2SkillsState,
  type V2SkillId,
} from "@/adventure/data/v2/v2Skills";
import { sanitizeLoadout } from "@/adventure/data/v2/v2Loadout";
import {
  V2_CORE_LOOP_V2,
  calcSpBudget,
} from "@/adventure/data/v2/coreLoopConfig";
import { spCapBonusFromRaw } from "@/adventure/data/v2/spFruit";
import { readCodexSpBonus } from "@/lib/server/codexSpBonus";

// POST /api/v2/me/learn-skill — 현재 직업 시그니처 1종 학습. 숙달 포인트 비용 지불.
// docs/v2-proficiency-redesign.md §6·§10. 자동부여 폐지 → 숙련도가 화폐. 골드/쿨다운 없음.
// 코어루프 on 에서는 학습 라이브러리에 보관하고 SP 예산 안에서만 자동 장착한다.
// lock 순서: character.v2 → skills.v2 → proficiency.v2 (hunt·advance 와 동일).
export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { skillId?: unknown };
  try {
    body = (await req.json()) as { skillId?: unknown };
  } catch {
    body = {};
  }
  const skillId = typeof body.skillId === "string" ? body.skillId : null;
  if (!skillId) {
    return Response.json(
      { ok: false, error: "missing_skill" },
      { status: 400 },
    );
  }

  const result = await db.transaction(async (tx) => {
    const charSave = await lockSaveForUpdate<{
      class?: unknown;
      specChoice?: unknown;
    }>(tx, userId, "character.v2", {});
    const cls = parseV2Class(charSave.class);
    // 모험가(무직)도 자기 킷(착용형 패시브 2종)은 학습 가능 — 풀 검사(elementalSkillsForClass)가
    //   none 킷만 통과시키므로 조기 게이트 제거. 타 직업 스킬은 not_in_chain 으로 여전히 차단.

    const skills = parseV2SkillsState(
      await lockSaveForUpdate<V2SkillsState>(
        tx,
        userId,
        "skills.v2",
        emptyV2SkillsState(),
      ),
    );
    // 락 순서(character→skills→proficiency) 유지 — 멱등 분기 응답에도 points 를 실어
    // 클라 계약(state.proficiency.current.points)과 일치시키려 여기서 미리 잠가 읽는다.
    const group = tier1ClassOf(cls);
    const prof = parseProficiencyForChar(
      await lockSaveForUpdate<V2ProficiencyState>(
        tx,
        userId,
        "proficiency.v2",
        emptyProficiency(),
      ),
      charSave,
    );
    // 학습 가능 = 현재 직업(jobIdFromLegacy(class,specChoice))의 시그니처 킷.
    const specChoice =
      typeof charSave.specChoice === "string" ? charSave.specChoice : null;
    const elementalPool = elementalSkillsForClass(cls, specChoice);
    if (!elementalPool.includes(skillId as V2SkillId)) {
      return {
        status: 400,
        body: { ok: false as const, error: "not_in_chain" as const },
      };
    }
    const sig = skillId as V2SkillId;

    // 이미 학습 → 멱등(소모 없이 현 상태 반환). usable 도 그대로 surface(변동 없음).
    if (skills.learned.includes(sig)) {
      return {
        status: 200,
        body: {
          ok: true as const,
          alreadyLearned: true as const,
          skillId,
          points: usablePoints(prof),
          learned: skills.learned,
          equipped: skills.equipped,
        },
      };
    }

    // 비용 — 스킬 티어/오버라이드 기준(v2SkillLearnCost).
    const cost = v2SkillLearnCost(sig);

    const spent = spendProficiency(prof, cost);
    if (!spent) {
      return {
        status: 400,
        body: {
          ok: false as const,
          error: "insufficient_proficiency" as const,
          required: cost,
          have: usablePoints(prof),
        },
      };
    }

    // equipped 갱신.
    //   flag off(레거시): 학습한 스킬은 현 체인 유효분 전부 자동 장착(상한 없음).
    //   코어루프: 기존 로드아웃(수동 선택) 보존 + 새로 배운 스킬을 뒤에 붙여 SP 예산까지
    //     sanitize(맞으면 자동 장착·예산 차면 learned 만·수동 교체는 로드아웃 화면에서). 강제 재산출 X.
    const nextLearned = [...skills.learned, sig];
    const codexBonus = V2_CORE_LOOP_V2
      ? await readCodexSpBonus(tx, userId)
      : null;
    const nextEquipped = V2_CORE_LOOP_V2
      ? sanitizeLoadout(
          [...skills.equipped, sig],
          nextLearned,
          calcSpBudget(
            spent.groups,
            spCapBonusFromRaw((charSave as { spFruitUsed?: unknown }).spFruitUsed),
            codexBonus?.total ?? 0,
          ),
        )
      : nextLearned.filter((s) => elementalPool.includes(s));
    const nextSkills: V2SkillsState = {
      ...skills, // pattern 보존(combat-pattern 라우트만 pattern 변경).
      learned: nextLearned,
      equipped: nextEquipped,
    };
    await upsertSave(tx, userId, "skills.v2", nextSkills);
    await upsertSave(tx, userId, "proficiency.v2", spent);

    return {
      status: 200,
      body: {
        ok: true as const,
        skillId,
        spent: cost,
        group,
        points: usablePoints(spent),
        learned: nextLearned,
        equipped: nextEquipped,
      },
    };
  });

  return Response.json(result.body, { status: result.status });
}
