import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import {
  parseV2Class,
  tier1ClassOf,
  signaturesForClass,
  signatureClassOf,
  V2_CLASS_DEFS,
} from "@/adventure/data/v2/classes";
import {
  parseProficiency,
  emptyProficiency,
  spendProficiency,
  signatureLearnCost,
  groupUsable,
  type V2ProficiencyState,
} from "@/adventure/data/v2/proficiency";
import {
  parseV2SkillsState,
  emptyV2SkillsState,
  type V2SkillsState,
  type V2SkillId,
} from "@/adventure/data/v2/v2Skills";

// POST /api/v2/me/learn-skill — 시그니처 1종 학습. 그 차수 도달 + 사용가능 숙련도 비용 지불.
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
    const charSave = await lockSaveForUpdate<{ class?: unknown }>(
      tx,
      userId,
      "character.v2",
      {},
    );
    const cls = parseV2Class(charSave.class);
    if (cls === "none") {
      return { status: 400, body: { ok: false as const, error: "no_class" as const } };
    }

    // 학습 가능 = 현 직업 체인의 시그니처(그 차수 도달분)뿐.
    const chain = signaturesForClass(cls);
    if (!chain.includes(skillId as V2SkillId)) {
      return {
        status: 400,
        body: { ok: false as const, error: "not_in_chain" as const },
      };
    }
    // chain.includes 통과 = 유효 시그니처 → V2SkillId 로 확정.
    const sig = skillId as V2SkillId;

    const skills = parseV2SkillsState(
      await lockSaveForUpdate<V2SkillsState>(
        tx,
        userId,
        "skills.v2",
        emptyV2SkillsState(),
      ),
    );
    // 이미 학습 → 멱등(소모 없이 현 상태 반환).
    if (skills.learned.includes(sig)) {
      return {
        status: 200,
        body: {
          ok: true as const,
          alreadyLearned: true as const,
          skillId,
          learned: skills.learned,
          equipped: skills.equipped,
        },
      };
    }

    // 비용 = 시그니처 보유 직업의 차수.
    const sigClass = signatureClassOf(skillId) ?? cls;
    const tier = V2_CLASS_DEFS[sigClass].tier;
    const cost = signatureLearnCost(tier);
    const group = tier1ClassOf(cls);

    const profSave = await lockSaveForUpdate<V2ProficiencyState>(
      tx,
      userId,
      "proficiency.v2",
      emptyProficiency(),
    );
    const prof = parseProficiency(profSave);
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

    // learned += sig; equipped = 학습분 ∩ 현 체인 (체인 순서 = 발동 우선순위).
    const nextLearned = [...skills.learned, sig];
    const learnedSet = new Set<string>(nextLearned);
    const nextEquipped = chain.filter((s) => learnedSet.has(s));
    const nextSkills: V2SkillsState = {
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
        tier,
        spent: cost,
        group,
        usable: groupUsable(spent, group),
        learned: nextLearned,
        equipped: nextEquipped,
      },
    };
  });

  return Response.json(result.body, { status: result.status });
}
