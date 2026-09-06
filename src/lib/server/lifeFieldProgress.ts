import {
  LIFE_FIELD_RECORDS_KEY,
  abandonLifeFieldTrace,
  applyLifeFieldSuccess,
  lifeFieldDailyView,
  lifeFieldDiscoveryRecordId,
  lifeFieldEnvironmentRecordId,
  lifeFieldRegionRecordId,
  lifeFieldRecordSummary,
  parseLifeFieldRecordsState,
  type ApplyLifeFieldSuccessResult,
  type LifeFieldRecordsState,
} from "@/adventure/v2/lifeFieldRecords";
import {
  lifeFieldDayKey,
  type LifeFieldActivity,
  type LifeFieldEnvironmentId,
} from "@/adventure/data/v2/lifeFieldEnvironment";
import {
  lockSaveForUpdate,
  readSave,
  upsertSave,
  type DbExecutor,
  type DbTransactionExecutor,
} from "@/lib/server/savesKv";
import type { LifeFieldFeatureSettings } from "@/lib/server/opsSettings";
import { hash32 } from "@/adventure/data/v2/hash";
import {
  recordCodexMasteryGameplayBatch,
  type CodexMasteryGameplayEvent,
  type CodexMasteryGameplayContext,
} from "@/lib/server/codexMasteryGameplay";

function sessionRng(sessionId: string): () => number {
  let index = 0;
  return () => {
    const value = hash32(`life-field:${sessionId}:${index}`) / 0x1_0000_0000;
    index += 1;
    return value;
  };
}

export function lifeFieldSessionRoll(sessionId: string, purpose: string) {
  return hash32(`life-field-effect:${sessionId}:${purpose}`) / 0x1_0000_0000;
}

export type RecordLifeFieldSuccessArgs = {
  activity: LifeFieldActivity;
  sourceId: string;
  environmentId: LifeFieldEnvironmentId;
  sessionId: string;
  successes?: number;
  now: number;
  features: LifeFieldFeatureSettings;
  masteryContext?: CodexMasteryGameplayContext;
};

function recordCount(state: LifeFieldRecordsState, entryId: string): number {
  return state.records[entryId]?.count ?? 0;
}

function lifeEvent(entryId: string, amount: number): CodexMasteryGameplayEvent {
  return {
    category: "life",
    entryId,
    amount,
    source: "life.complete",
  };
}

export function codexMasteryLifeEvents(
  before: LifeFieldRecordsState,
  result: ApplyLifeFieldSuccessResult,
  args: RecordLifeFieldSuccessArgs,
): CodexMasteryGameplayEvent[] {
  if (result.duplicate) return [];

  const events: CodexMasteryGameplayEvent[] = [];
  const regionId = lifeFieldRegionRecordId(args.activity, args.sourceId);
  const regionDelta = recordCount(result.state, regionId) - recordCount(before, regionId);
  if (regionDelta > 0) events.push(lifeEvent(regionId, regionDelta));

  const environmentId = lifeFieldEnvironmentRecordId(args.environmentId);
  const environmentBefore = before.records[environmentId];
  const environmentDelta =
    recordCount(result.state, environmentId) - recordCount(before, environmentId);
  if (
    environmentDelta > 0 &&
    (!environmentBefore || lifeFieldDayKey(environmentBefore.lastAt) !== lifeFieldDayKey(args.now))
  ) {
    events.push(lifeEvent(environmentId, 1));
  }

  if (result.completedTrace) {
    const discoveryId = lifeFieldDiscoveryRecordId(result.completedTrace.discoveryId);
    const discoveryDelta =
      recordCount(result.state, discoveryId) - recordCount(before, discoveryId);
    if (discoveryDelta > 0) events.push(lifeEvent(discoveryId, discoveryDelta));
  }

  return events;
}

export async function recordLifeFieldSuccessInTx(
  tx: DbTransactionExecutor,
  userId: string,
  args: RecordLifeFieldSuccessArgs,
): Promise<ApplyLifeFieldSuccessResult> {
  const current = parseLifeFieldRecordsState(
    await lockSaveForUpdate(tx, userId, LIFE_FIELD_RECORDS_KEY, {}),
  );
  const result = applyLifeFieldSuccess(current, {
    activity: args.activity,
    sourceId: args.sourceId,
    environmentId: args.environmentId,
    dayKey: lifeFieldDayKey(args.now),
    now: args.now,
    sessionId: args.sessionId,
    successes: args.successes,
    environmentsEnabled: args.features.environmentEnabled,
    discoveriesEnabled: args.features.discoveriesEnabled,
    rng: sessionRng(args.sessionId),
  });
  if (!result.duplicate) {
    await upsertSave(tx, userId, LIFE_FIELD_RECORDS_KEY, result.state);
    const masteryEvents = codexMasteryLifeEvents(current, result, args);
    if (masteryEvents.length > 0) {
      await recordCodexMasteryGameplayBatch(
        tx,
        userId,
        masteryEvents,
        new Date(args.now),
        ...(args.masteryContext ? [args.masteryContext] : []),
      );
    }
  }
  return result;
}

export async function readLifeFieldProgress(
  executor: DbExecutor,
  userId: string,
  now = Date.now(),
) {
  const state = await readLifeFieldState(executor, userId);
  const dayKey = lifeFieldDayKey(now);
  return {
    state,
    summary: lifeFieldRecordSummary(state),
    daily: {
      fishing: lifeFieldDailyView(state, "fishing", dayKey),
      woodcutting: lifeFieldDailyView(state, "woodcutting", dayKey),
      mining: lifeFieldDailyView(state, "mining", dayKey),
    },
  };
}

export async function readLifeFieldState(
  executor: DbExecutor,
  userId: string,
) {
  return parseLifeFieldRecordsState(
    await readSave(executor, userId, LIFE_FIELD_RECORDS_KEY, {}),
  );
}

export async function abandonLifeFieldTraceInTx(
  tx: DbExecutor,
  userId: string,
  activity: LifeFieldActivity,
) {
  const current = await lockSaveForUpdate(
    tx,
    userId,
    LIFE_FIELD_RECORDS_KEY,
    {},
  );
  const result = abandonLifeFieldTrace(current, activity);
  if (result.abandoned) {
    await upsertSave(tx, userId, LIFE_FIELD_RECORDS_KEY, result.state);
  }
  return result;
}
