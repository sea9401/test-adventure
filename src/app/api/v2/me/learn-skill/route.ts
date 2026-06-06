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
  groupUsable,
  type V2ProficiencyState,
} from "@/adventure/data/v2/proficiency";
import {
  parseV2SkillsState,
  emptyV2SkillsState,
  V2_ELEMENTAL_LEARN_COST,
  type V2SkillsState,
  type V2SkillId,
} from "@/adventure/data/v2/v2Skills";

// POST /api/v2/me/learn-skill — 시그니처 1종 학습. 그 차수 도달 + 숙달 포인트 비용 지불.
// docs/v2-proficiency-redesign.md §6·§10. 자동부여 폐지 → 숙련도가 화폐. 골드/쿨다운 없음.
// equipped = 학습한 시그니처 ∩ 현 직업 체인(자동 장착, 슬롯 선택 없음 — #270 유지).
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
    if (cls === "none") {
      return { status: 400, body: { ok: false as const, error: "no_class" as const } };
    }

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
    const tier = prof.groups[group]?.tier ?? 1;
    // 학습 가능 = 공용(직군) + 선택 계파(전직)의 차수 해금분(차수당 1개)만. 계파 미선택이면 공용만.
    const specChoice =
      typeof charSave.specChoice === "string" ? charSave.specChoice : null;
    const elementalPool = elementalSkillsForClass(cls, specChoice, tier);
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
          points: groupUsable(prof, group),
          learned: skills.learned,
          equipped: skills.equipped,
        },
      };
    }

    // 비용 — 속성 스킬 고정(V2_ELEMENTAL_LEARN_COST). 시그니처 학습 경로는 P4 에서 폐지.
    const cost = V2_ELEMENTAL_LEARN_COST;

    const spent = spendProficiency(prof, group, cost);
    if (!spent) {
      return {
        status: 400,
        body: {
          ok: false as const,
          error: "insufficient_proficiency" as const,
          required: cost,
          have: groupUsable(prof, group),
        },
      };
    }

    // learned += sig 만. 장착은 수동(equip-skill) — 학습이 자동장착하지 않는다(자동장착 폐지).
    const nextLearned = [...skills.learned, sig];
    const nextSkills: V2SkillsState = {
      learned: nextLearned,
      equipped: skills.equipped, // 불변
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
        points: groupUsable(spent, group),
        learned: nextLearned,
        equipped: skills.equipped,
      },
    };
  });

  return Response.json(result.body, { status: result.status });
}
