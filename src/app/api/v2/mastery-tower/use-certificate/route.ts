import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { recordCodexMasteryGameplayBatch } from "@/lib/server/codexMasteryGameplay";
import {
  recordEconomyEventSoon,
  recordRewardFailureSoon,
} from "@/lib/server/economyLog";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { MASTERY_CERTIFICATE_KEY } from "@/adventure/data/v2/masteryTower";
import {
  LEGACY_CLASS_SPEC_BY_JOB,
  V2_JOB_CATALOG,
  cumLevelForJob,
  isFarmingJobId,
  isFishingJobId,
  isJobContentUnlocked,
  isRootJobSelectable,
} from "@/adventure/data/v2/v2JobCatalog";
import {
  addCumLevel,
  addJobCumLevel,
  addPoints,
  parseProficiencyForChar,
} from "@/adventure/data/v2/proficiency";
import { parseV2Class, tier1ClassOf } from "@/adventure/data/v2/classes";

type Body = {
  jobId?: unknown;
  amount?: unknown;
  mode?: unknown;
};

type CertificateUseMode = "mastery" | "proficiency";

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
  const mode: CertificateUseMode | null =
    body.mode == null
      ? "mastery"
      : body.mode === "mastery" || body.mode === "proficiency"
        ? body.mode
        : null;

  if (!mode) {
    return Response.json({ ok: false, error: "bad_mode" }, { status: 400 });
  }

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

    const profRaw = await lockSaveForUpdate<unknown>(
      tx,
      userId,
      "proficiency.v2",
      {},
    );
    let prof = parseProficiencyForChar(profRaw, charSave);

    if (mode === "proficiency") {
      const group = tier1ClassOf(parseV2Class(charSave.class));
      prof = addPoints(prof, group, amount);
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
          mode: "proficiency" as const,
          used: amount,
          remaining,
          proficiencyAfter: prof.points,
        },
      };
    }

    const job = V2_JOB_CATALOG[jobId];
    if (!job || job.id === "none" || !isRootJobSelectable(job)) {
      return { status: 400, body: { ok: false as const, error: "bad_job" } };
    }
    if (isFishingJobId(job.id)) {
      return {
        status: 400,
        body: { ok: false as const, error: "fishing_job" },
      };
    }
    if (isFarmingJobId(job.id)) {
      return {
        status: 400,
        body: { ok: false as const, error: "farming_job" },
      };
    }
    if (!isJobContentUnlocked(job, prof)) {
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
    await recordCodexMasteryGameplayBatch(
      tx,
      userId,
      [{
        category: "job",
        entryId: job.id,
        amount,
        source: "job.consumable",
      }],
      new Date(),
    );

    return {
      status: 200,
      body: {
        ok: true as const,
        mode: "mastery" as const,
        jobId: job.id,
        jobName: job.name,
        group,
        used: amount,
        remaining,
        groupMastery: prof.groups[group]?.cumLevel ?? 0,
        jobMastery: cumLevelForJob(prof, job),
      },
    };
  });

  if (result.status === 200 && result.body.ok) {
    recordEconomyEventSoon({
      userId,
      eventType: "proficiency.certificate.use",
      itemKind: "mastery_certificate",
      itemId: MASTERY_CERTIFICATE_KEY,
      quantity: -result.body.used,
      detail: {
        mode: result.body.mode,
        ...(result.body.mode === "mastery"
          ? {
              jobId: result.body.jobId,
              jobName: result.body.jobName,
              group: result.body.group,
              jobMastery: result.body.jobMastery,
              groupMastery: result.body.groupMastery,
            }
          : { proficiencyAfter: result.body.proficiencyAfter }),
      },
    });
    if (result.body.mode === "mastery") {
      recordEconomyEventSoon({
        userId,
        eventType: "proficiency.certificate.gain",
        itemKind: "mastery",
        itemId: result.body.jobId,
        quantity: result.body.used,
        detail: {
          jobName: result.body.jobName,
          group: result.body.group,
        },
      });
    } else {
      recordEconomyEventSoon({
        userId,
        eventType: "proficiency.certificate.points",
        itemKind: "proficiency",
        itemId: "proficiency",
        quantity: result.body.used,
        detail: { proficiencyAfter: result.body.proficiencyAfter },
      });
    }
  } else if (result.status !== 200 && !result.body.ok) {
    recordRewardFailureSoon({
      userId,
      source: "mastery_certificate",
      error: result.body.error,
      detail: { mode, jobId, status: result.status },
    });
  }

  return Response.json(result.body, { status: result.status });
}
