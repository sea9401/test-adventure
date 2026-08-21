import {
  LEGACY_CLASS_SPEC_BY_JOB,
  V2_JOB_LIST,
  cumLevelForJob,
  isJobContentUnlocked,
  isLifestyleMasteryJobId,
  isRootJobSelectable,
} from "@/adventure/data/v2/v2JobCatalog";
import { MASTERY_CERTIFICATE_KEY } from "@/adventure/data/v2/masteryTower";
import {
  parseProficiencyForChar,
  type V2ProficiencyState,
} from "@/adventure/data/v2/proficiency";
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

export function masteryCertificateJobs(
  proficiency: V2ProficiencyState,
): MasteryCertificateJob[] {
  return V2_JOB_LIST.filter(
    (job) =>
      job.id !== "none" &&
      !isLifestyleMasteryJobId(job.id) &&
      isRootJobSelectable(job) &&
      isJobContentUnlocked(job, proficiency),
  ).map((job) => ({
    id: job.id,
    name: job.name,
    tier: job.tier,
    group: LEGACY_CLASS_SPEC_BY_JOB[job.id]?.class ?? job.id,
    mastery: cumLevelForJob(proficiency, job),
  }));
}

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
  const jobs = masteryCertificateJobs(proficiency);
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
