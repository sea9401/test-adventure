import {
  LIFE_FIELD_RECORDS_KEY,
  abandonLifeFieldTrace,
  applyLifeFieldSuccess,
  lifeFieldDailyView,
  lifeFieldRecordSummary,
  parseLifeFieldRecordsState,
  type ApplyLifeFieldSuccessResult,
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
} from "@/lib/server/savesKv";
import type { LifeFieldFeatureSettings } from "@/lib/server/opsSettings";
import { hash32 } from "@/adventure/data/v2/hash";

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
};

export async function recordLifeFieldSuccessInTx(
  tx: DbExecutor,
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
  }
  return result;
}

export async function readLifeFieldProgress(
  executor: DbExecutor,
  userId: string,
  now = Date.now(),
) {
  const state = parseLifeFieldRecordsState(
    await readSave(executor, userId, LIFE_FIELD_RECORDS_KEY, {}),
  );
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
