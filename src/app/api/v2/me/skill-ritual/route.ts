import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { spendGold } from "@/adventure/data/v2/coreLoopConfig";
import { parseV2Class } from "@/adventure/data/v2/classes";
import {
  emptyProficiency,
  parseProficiencyForChar,
  spendProficiency,
  usablePoints,
  type V2ProficiencyState,
} from "@/adventure/data/v2/proficiency";
import {
  V2_JOB_CATALOG,
  V2_JOB_LIST,
  cumLevelForJob,
  jobIdFromLegacy,
} from "@/adventure/data/v2/v2JobCatalog";
import { skillsForJob } from "@/adventure/data/v2/v2SkillsByJob";
import {
  V2_SKILLS,
  emptyV2SkillsState,
  parseV2SkillsState,
  type V2SkillId,
  type V2SkillsState,
} from "@/adventure/data/v2/v2Skills";
import {
  isSkillRitualEligible,
  nextSkillRitualStep,
  skillRitualBonusPct,
  skillRitualLevel,
} from "@/adventure/data/v2/skillRitual";

type CharSave = {
  class?: unknown;
  specChoice?: unknown;
  gold?: number;
  bankedGold?: number;
  [key: string]: unknown;
};

function ownerJobForSkill(skillId: V2SkillId, fallbackJobId: string) {
  for (const job of V2_JOB_LIST) {
    if (skillsForJob(job.id).includes(skillId)) return job;
  }
  return V2_JOB_CATALOG[fallbackJobId] ?? null;
}

// POST /api/v2/me/skill-ritual — 배운 스킬 1개를 골드+숙달 포인트로 +1 강화한다.
// lock 순서: character.v2 → skills.v2 → proficiency.v2 (learn/loadout 계열과 동일).
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
    const charSave = await lockSaveForUpdate<CharSave>(
      tx,
      userId,
      "character.v2",
      {},
    );
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

    const def = V2_SKILLS[skillId as V2SkillId];
    if (!def) {
      return {
        status: 400,
        body: { ok: false as const, error: "unknown_skill" as const },
      };
    }
    const sid = skillId as V2SkillId;
    if (!skills.learned.includes(sid)) {
      return {
        status: 400,
        body: { ok: false as const, error: "not_learned" as const },
      };
    }
    if (!isSkillRitualEligible(def)) {
      return {
        status: 400,
        body: { ok: false as const, error: "not_eligible" as const },
      };
    }

    const currentLevel = skillRitualLevel(skills.enhancements, sid);
    const step = nextSkillRitualStep(currentLevel);
    if (!step) {
      return {
        status: 400,
        body: { ok: false as const, error: "max_level" as const },
      };
    }

    const cls = parseV2Class(charSave.class);
    const specChoice =
      typeof charSave.specChoice === "string" ? charSave.specChoice : null;
    const currentJobId = jobIdFromLegacy(cls, specChoice);
    const ownerJob = ownerJobForSkill(sid, currentJobId);
    const currentMastery = ownerJob ? cumLevelForJob(prof, ownerJob) : 0;
    if (currentMastery < step.requiredJobCumLevel) {
      return {
        status: 400,
        body: {
          ok: false as const,
          error: "insufficient_mastery" as const,
          requiredJobCumLevel: step.requiredJobCumLevel,
          haveJobCumLevel: currentMastery,
          jobName: ownerJob?.name ?? null,
        },
      };
    }

    const haveGold = Math.max(0, Math.floor(Number(charSave.gold) || 0));
    const bankedGold = Math.max(0, Math.floor(Number(charSave.bankedGold) || 0));
    const goldSpend = spendGold(haveGold, bankedGold, step.goldCost);
    if (!goldSpend.ok) {
      return {
        status: 400,
        body: {
          ok: false as const,
          error: "insufficient_gold" as const,
          goldCost: step.goldCost,
        },
      };
    }
    const spentProf = spendProficiency(prof, step.proficiencyCost);
    if (!spentProf) {
      return {
        status: 400,
        body: {
          ok: false as const,
          error: "insufficient_proficiency" as const,
          required: step.proficiencyCost,
          have: usablePoints(prof),
        },
      };
    }

    const nextLevel = step.level;
    const nextSkills: V2SkillsState = {
      ...skills,
      enhancements: {
        ...(skills.enhancements ?? {}),
        [sid]: nextLevel,
      },
    };
    const nextChar: CharSave = {
      ...charSave,
      gold: goldSpend.gold,
      bankedGold: goldSpend.bankedGold,
    };
    await upsertSave(tx, userId, "character.v2", nextChar);
    await upsertSave(tx, userId, "skills.v2", nextSkills);
    await upsertSave(tx, userId, "proficiency.v2", spentProf);

    return {
      status: 200,
      body: {
        ok: true as const,
        skillId: sid,
        level: nextLevel,
        bonusPct: skillRitualBonusPct(nextLevel),
        spentGold: step.goldCost,
        spentProficiency: step.proficiencyCost,
        gold: goldSpend.gold,
        bankedGold: goldSpend.bankedGold,
        points: usablePoints(spentProf),
        enhancements: nextSkills.enhancements,
      },
    };
  });

  return Response.json(result.body, { status: result.status });
}
