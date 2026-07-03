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
  isSkillRitualFocusEligible,
  isSkillRitualPowerEligible,
  nextSkillRitualStep,
  skillRitualFocusBonusPct,
  skillRitualPowerBonusPct,
  skillRitualRefund,
  skillRitualState,
  type SkillRitualMode,
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

function addGold(gold: number, amount: number): number {
  return Math.max(0, Math.floor(Number(gold) || 0)) + Math.max(0, amount);
}

function parseMode(raw: unknown): SkillRitualMode | null {
  return raw === "power" || raw === "focus" ? raw : null;
}

// POST /api/v2/me/skill-ritual — 배운 스킬 1개를 골드+숙달 포인트로 강화/초기화한다.
// lock 순서: character.v2 → skills.v2 → proficiency.v2 (learn/loadout 계열과 동일).
export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { skillId?: unknown; mode?: unknown; action?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    body = {};
  }
  const skillId = typeof body.skillId === "string" ? body.skillId : null;
  const action = body.action === "reset" ? "reset" : "enhance";
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
    const current = skillRitualState(skills.enhancements, sid);
    const currentLevel = current?.level ?? 0;
    if (action === "reset") {
      if (!current) {
        return {
          status: 400,
          body: { ok: false as const, error: "not_enhanced" as const },
        };
      }
      const refund = skillRitualRefund(current.level);
      const nextEnhancements = { ...(skills.enhancements ?? {}) };
      delete nextEnhancements[sid];
      const { enhancements: _enhancements, ...skillsWithoutEnhancements } =
        skills;
      const nextSkills: V2SkillsState =
        Object.keys(nextEnhancements).length > 0
          ? { ...skills, enhancements: nextEnhancements }
          : skillsWithoutEnhancements;
      const nextProf: V2ProficiencyState = {
        ...prof,
        points: usablePoints(prof) + refund.proficiency,
      };
      const nextChar: CharSave = {
        ...charSave,
        gold: addGold(Number(charSave.gold) || 0, refund.gold),
      };
      await upsertSave(tx, userId, "character.v2", nextChar);
      await upsertSave(tx, userId, "skills.v2", nextSkills);
      await upsertSave(tx, userId, "proficiency.v2", nextProf);

      return {
        status: 200,
        body: {
          ok: true as const,
          action: "reset" as const,
          skillId: sid,
          mode: current.mode,
          refundedGold: refund.gold,
          refundedProficiency: refund.proficiency,
          gold: nextChar.gold,
          bankedGold: Math.max(0, Math.floor(Number(charSave.bankedGold) || 0)),
          points: usablePoints(nextProf),
          enhancements: nextSkills.enhancements ?? {},
        },
      };
    }

    const requestedMode = parseMode(body.mode) ?? current?.mode ?? "power";
    if (current && current.mode !== requestedMode) {
      return {
        status: 400,
        body: {
          ok: false as const,
          error: "mode_locked" as const,
          mode: current.mode,
        },
      };
    }
    if (requestedMode === "power" && !isSkillRitualPowerEligible(def)) {
      return {
        status: 400,
        body: { ok: false as const, error: "not_eligible" as const },
      };
    }
    if (requestedMode === "focus" && !isSkillRitualFocusEligible(def)) {
      return {
        status: 400,
        body: { ok: false as const, error: "not_focus_eligible" as const },
      };
    }

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
        [sid]: { mode: requestedMode, level: nextLevel },
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
        action: "enhance" as const,
        skillId: sid,
        mode: requestedMode,
        level: nextLevel,
        bonusPct:
          requestedMode === "focus"
            ? skillRitualFocusBonusPct(nextLevel)
            : skillRitualPowerBonusPct(nextLevel),
        powerBonusPct:
          requestedMode === "power" ? skillRitualPowerBonusPct(nextLevel) : 0,
        focusBonusPct:
          requestedMode === "focus" ? skillRitualFocusBonusPct(nextLevel) : 0,
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
