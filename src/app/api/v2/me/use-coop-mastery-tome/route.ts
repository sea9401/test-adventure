import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import {
  COOP_MASTERY_TOME_GAIN,
  COOP_MASTERY_TOME_MATERIAL_ID,
} from "@/adventure/data/v2/coopRewards";
import {
  addCumLevel,
  addJobCumLevel,
  parseProficiencyForChar,
} from "@/adventure/data/v2/proficiency";
import { parseV2Class, tier1ClassOf } from "@/adventure/data/v2/classes";
import { jobIdFromLegacy } from "@/adventure/data/v2/v2JobCatalog";

type CharSave = {
  class?: unknown;
  specChoice?: unknown;
  materials?: unknown;
  [k: string]: unknown;
};

function parseMaterials(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (raw && typeof raw === "object") {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      const n = Math.floor(Number(v));
      if (Number.isFinite(n) && n > 0) out[k] = n;
    }
  }
  return out;
}

// POST /api/v2/me/use-coop-mastery-tome — 상급 숙련 교본 1개 사용.
// 거래 가능한 character.v2.materials 소모품을 현재 직업 숙련도(+직군 숙련도)에 즉시 반영한다.
export async function POST() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const result = await db.transaction(async (tx) => {
    const charSave = await lockSaveForUpdate<CharSave>(
      tx,
      userId,
      "character.v2",
      {},
    );
    const materials = parseMaterials(charSave.materials);
    const held = materials[COOP_MASTERY_TOME_MATERIAL_ID] ?? 0;
    if (held <= 0) {
      return { status: 400, body: { ok: false as const, error: "no_tome" } };
    }

    const playerClass = parseV2Class(charSave.class);
    const group = tier1ClassOf(playerClass);
    const jobId = jobIdFromLegacy(
      playerClass,
      typeof charSave.specChoice === "string" ? charSave.specChoice : null,
    );
    if (group === "none" || jobId === "none") {
      return {
        status: 400,
        body: { ok: false as const, error: "no_current_job" },
      };
    }

    const profRaw = await lockSaveForUpdate<unknown>(
      tx,
      userId,
      "proficiency.v2",
      {},
    );
    let prof = parseProficiencyForChar(profRaw, charSave);
    prof = addCumLevel(prof, group, COOP_MASTERY_TOME_GAIN);
    prof = addJobCumLevel(prof, jobId, COOP_MASTERY_TOME_GAIN);

    const nextMaterials = { ...materials };
    if (held - 1 <= 0) delete nextMaterials[COOP_MASTERY_TOME_MATERIAL_ID];
    else nextMaterials[COOP_MASTERY_TOME_MATERIAL_ID] = held - 1;

    await upsertSave(tx, userId, "character.v2", {
      ...charSave,
      materials: nextMaterials,
    });
    await upsertSave(tx, userId, "proficiency.v2", prof);

    return {
      status: 200,
      body: {
        ok: true as const,
        gained: COOP_MASTERY_TOME_GAIN,
        group,
        jobId,
        groupMastery: prof.groups[group]?.cumLevel ?? 0,
        jobMastery: prof.jobCumLevel?.[jobId] ?? 0,
        remaining: nextMaterials[COOP_MASTERY_TOME_MATERIAL_ID] ?? 0,
      },
    };
  });

  return Response.json(result.body, { status: result.status });
}
