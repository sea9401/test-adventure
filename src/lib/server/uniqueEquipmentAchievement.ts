import {
  V2_EQUIPMENT,
  isUnique,
  parseEquipmentSave,
  type V2EquipInstance,
  type V2EquipmentId,
} from "@/adventure/data/v2/v2Equipment";
import { parseEquipmentCodex } from "@/adventure/data/v2/equipmentCodex";
import {
  lockSaveForUpdate,
  upsertSave,
  type DbExecutor,
} from "@/lib/server/savesKv";

export type UniqueEquipmentAcquisitionEvidence = {
  equipmentOwnedAfter: readonly V2EquipInstance[];
  equipmentCodexRaw: unknown;
  acquiredIds: readonly V2EquipmentId[];
  minimum?: number;
};

type AdventureLogWithUniqueEquipment = {
  uniqueEquipmentAcquired?: unknown;
  [key: string]: unknown;
};

function adventureLog(raw: unknown): AdventureLogWithUniqueEquipment {
  return raw != null && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as AdventureLogWithUniqueEquipment)
    : {};
}

export function persistedUniqueEquipmentAcquired(raw: unknown): number {
  const value = Number(adventureLog(raw).uniqueEquipmentAcquired);
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

export function countUniqueEquipmentInstances(
  owned: readonly V2EquipInstance[],
): number {
  return owned.reduce(
    (count, instance) =>
      count + (isUnique(V2_EQUIPMENT[instance.id]) ? 1 : 0),
    0,
  );
}

export function countUniqueEquipmentCodexEntries(raw: unknown): number {
  return parseEquipmentCodex(raw).registeredIds.reduce(
    (count, id) => count + (isUnique(V2_EQUIPMENT[id]) ? 1 : 0),
    0,
  );
}

export function uniqueEquipmentAcquisitionProgress(args: {
  adventureLogRaw: unknown;
  equipmentRaw: unknown;
  equipmentCodexRaw: unknown;
  minimum?: number;
}): number {
  const { owned } = parseEquipmentSave(args.equipmentRaw);
  return Math.max(
    persistedUniqueEquipmentAcquired(args.adventureLogRaw),
    countUniqueEquipmentInstances(owned),
    countUniqueEquipmentCodexEntries(args.equipmentCodexRaw),
    Math.max(0, Math.floor(Number(args.minimum) || 0)),
  );
}

export function applyUniqueEquipmentAcquisitions(args: {
  adventureLogRaw: unknown;
} & UniqueEquipmentAcquisitionEvidence): AdventureLogWithUniqueEquipment {
  const log = adventureLog(args.adventureLogRaw);
  const acquiredCount = args.acquiredIds.reduce(
    (count, id) => count + (isUnique(V2_EQUIPMENT[id]) ? 1 : 0),
    0,
  );
  if (acquiredCount === 0) return log;

  // equipmentOwnedAfter 는 신규 개체가 추가된 뒤의 인벤토리다. 신규분을 뺀 보유량을
  // 레거시 시작값으로 삼아, 이미 판매한 뒤 새 유니크를 얻어도 저장된 누적치에서 정확히 +N 한다.
  const ownedBeforeFloor = Math.max(
    0,
    countUniqueEquipmentInstances(args.equipmentOwnedAfter) - acquiredCount,
  );
  const previous = Math.max(
    persistedUniqueEquipmentAcquired(log),
    ownedBeforeFloor,
    countUniqueEquipmentCodexEntries(args.equipmentCodexRaw),
    Math.max(0, Math.floor(Number(args.minimum) || 0)),
  );
  return {
    ...log,
    uniqueEquipmentAcquired: previous + acquiredCount,
  };
}

export async function ensureUniqueEquipmentAcquisitionBaseline(args: {
  executor: DbExecutor;
  userId: string;
  equipmentRaw: unknown;
  equipmentCodexRaw: unknown;
  minimum?: number;
}): Promise<AdventureLogWithUniqueEquipment> {
  const log = await lockSaveForUpdate<AdventureLogWithUniqueEquipment>(
    args.executor,
    args.userId,
    "adventure-log.v2",
    {},
  );
  const baseline = uniqueEquipmentAcquisitionProgress({
    adventureLogRaw: log,
    equipmentRaw: args.equipmentRaw,
    equipmentCodexRaw: args.equipmentCodexRaw,
    minimum: args.minimum,
  });
  if (baseline <= persistedUniqueEquipmentAcquired(log)) return log;

  const next = { ...log, uniqueEquipmentAcquired: baseline };
  await upsertSave(
    args.executor,
    args.userId,
    "adventure-log.v2",
    next,
  );
  return next;
}

export async function recordUniqueEquipmentAcquisitions(args: {
  executor: DbExecutor;
  userId: string;
  evidence: UniqueEquipmentAcquisitionEvidence;
}): Promise<number> {
  const uniqueCount = args.evidence.acquiredIds.reduce(
    (count, id) => count + (isUnique(V2_EQUIPMENT[id]) ? 1 : 0),
    0,
  );
  if (uniqueCount === 0) return 0;

  const log = await lockSaveForUpdate<AdventureLogWithUniqueEquipment>(
    args.executor,
    args.userId,
    "adventure-log.v2",
    {},
  );
  const next = applyUniqueEquipmentAcquisitions({
    adventureLogRaw: log,
    ...args.evidence,
  });
  await upsertSave(
    args.executor,
    args.userId,
    "adventure-log.v2",
    next,
  );
  return persistedUniqueEquipmentAcquired(next);
}
