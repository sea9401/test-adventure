import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { MASTERY_CERTIFICATE_KEY } from "@/adventure/data/v2/masteryTower";
import {
  LEGACY_CLASS_SPEC_BY_JOB,
  V2_JOB_CATALOG,
  isJobUnlocked,
  isRootJobSelectable,
} from "@/adventure/data/v2/v2JobCatalog";
import {
  addCumLevel,
  addJobCumLevel,
  parseProficiencyForChar,
} from "@/adventure/data/v2/proficiency";

type Body = {
  jobId?: unknown;
  amount?: unknown;
};

function parseAmount(value: unknown, held: number): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return held;
  return Math.max(0, Math.min(held, n));
}

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as Body;
  const jobId = typeof body.jobId === "string" ? body.jobId : "";

  const result = await db.transaction(async (tx) => {
    const charSave = await lockSaveForUpdate<Record<string, unknown>>(
      tx,
      userId,
      "character.v2",
      {},
    );
    const inventory = await lockSaveForUpdate<Record<string, unknown>>(
      tx,
      userId,
      "inventory.v2",
      {},
    );
    const held = Math.max(
      0,
      Math.floor(Number(inventory[MASTERY_CERTIFICATE_KEY]) || 0),
    );
    const amount = parseAmount(body.amount, held);
    if (held <= 0 || amount <= 0) {
      return {
        status: 400,
        body: { ok: false as const, error: "no_certificate" },
      };
    }

    const job = V2_JOB_CATALOG[jobId];
    if (!job || job.id === "none" || !isRootJobSelectable(job)) {
      return { status: 400, body: { ok: false as const, error: "bad_job" } };
    }

    const profRaw = await lockSaveForUpdate<unknown>(
      tx,
      userId,
      "proficiency.v2",
      {},
    );
    let prof = parseProficiencyForChar(profRaw, charSave);
    if (!isJobUnlocked(job, prof)) {
      return { status: 400, body: { ok: false as const, error: "job_locked" } };
    }

    const group = LEGACY_CLASS_SPEC_BY_JOB[job.id]?.class ?? job.id;
    prof = addCumLevel(prof, group, amount);
    prof = addJobCumLevel(prof, job.id, amount);
    const remaining = held - amount;

    await upsertSave(tx, userId, "proficiency.v2", prof);
    await upsertSave(tx, userId, "inventory.v2", {
      ...inventory,
      [MASTERY_CERTIFICATE_KEY]: remaining,
    });

    return {
      status: 200,
      body: {
        ok: true as const,
        jobId: job.id,
        jobName: job.name,
        group,
        used: amount,
        remaining,
        groupMastery: prof.groups[group]?.cumLevel ?? 0,
        jobMastery:
          job.tier <= 1
            ? (prof.groups[job.id]?.cumLevel ?? 0)
            : (prof.jobCumLevel?.[job.id] ?? 0),
      },
    };
  });

  return Response.json(result.body, { status: result.status });
}
