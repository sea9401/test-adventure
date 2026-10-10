import {
  LEGACY_CLASS_SPEC_BY_JOB,
  V2_JOB_LIST,
  cumLevelForJob,
  isJobContentUnlocked,
  isLifestyleMasteryJobId,
  isRootJobSelectable,
  jobIdFromLegacy,
} from "@/adventure/data/v2/v2JobCatalog";
import { MASTERY_CERTIFICATE_KEY } from "@/adventure/data/v2/masteryTower";
import { parseV2Class } from "@/adventure/data/v2/classes";
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
  // 모달이 현재 직업을 기본 선택하도록 함께 내려준다. 직업이 없으면 null.
  currentJobId?: string | null;
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

export function masteryCertificateCurrentJobId(
  character: Record<string, unknown>,
): string | null {
  const spec =
    typeof character.specChoice === "string" ? character.specChoice : null;
  const jobId = jobIdFromLegacy(parseV2Class(character.class), spec);
  return jobId === "none" ? null : jobId;
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
  return {
    certificates,
    jobs,
    currentJobId: masteryCertificateCurrentJobId(character),
  };
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
