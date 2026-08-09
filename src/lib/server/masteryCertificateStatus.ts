import {
  LEGACY_CLASS_SPEC_BY_JOB,
  V2_JOB_LIST,
  isJobUnlocked,
  isLifestyleMasteryJobId,
  isRootJobSelectable,
} from "@/adventure/data/v2/v2JobCatalog";
import { MASTERY_CERTIFICATE_KEY } from "@/adventure/data/v2/masteryTower";
import { parseProficiencyForChar } from "@/adventure/data/v2/proficiency";
import { readSave, type DbExecutor } from "./savesKv";

export type MasteryCertificateJob = {
  id: string;
  name: string;
  tier: number;
  group: string;
  mastery: number;
};

export type MasteryCertificateStatus = {
  certificates: number;
  jobs: MasteryCertificateJob[];
};

function objectSave(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
}

export function masteryCertificateStatusFromSaves(
  characterRaw: unknown,
  proficiencyRaw: unknown,
  inventoryRaw: unknown,
): MasteryCertificateStatus {
  const character = objectSave(characterRaw);
  const inventory = objectSave(inventoryRaw);
  const proficiency = parseProficiencyForChar(proficiencyRaw, character);
  const certificates = Math.max(
    0,
    Math.floor(Number(inventory[MASTERY_CERTIFICATE_KEY]) || 0),
  );
  const jobs = V2_JOB_LIST.filter(
    (job) =>
      job.id !== "none" &&
      !isLifestyleMasteryJobId(job.id) &&
      isRootJobSelectable(job) &&
      isJobUnlocked(job, proficiency),
  ).map((job) => {
    const group = LEGACY_CLASS_SPEC_BY_JOB[job.id]?.class ?? job.id;
    return {
      id: job.id,
      name: job.name,
      tier: job.tier,
      group,
      mastery:
        job.tier <= 1
          ? (proficiency.groups[job.id]?.cumLevel ?? 0)
          : (proficiency.jobCumLevel?.[job.id] ?? 0),
    };
  });
  return { certificates, jobs };
}

export async function readMasteryCertificateStatus(
  executor: DbExecutor,
  userId: string,
): Promise<MasteryCertificateStatus> {
  const [character, proficiency, inventory] = await Promise.all([
    readSave(executor, userId, "character.v2", {}),
    readSave(executor, userId, "proficiency.v2", {}),
    readSave(executor, userId, "inventory.v2", {}),
  ]);
  return masteryCertificateStatusFromSaves(
    character,
    proficiency,
    inventory,
  );
}
