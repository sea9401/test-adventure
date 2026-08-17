import { eq } from "drizzle-orm";
import {
  jobSpRebalanceState,
  type JobSpRebalanceState,
} from "@/adventure/data/v2/jobSpPolicy";
import { opsSettings } from "@/db/schema";
import type { DbExecutor } from "./savesKv";

export const JOB_SP_REBALANCE_SETTING_KEY = "job-sp-rebalance.v1";

export async function readJobSpRebalanceState(
  executor: DbExecutor,
  now = Date.now(),
): Promise<JobSpRebalanceState> {
  if (typeof (executor as { select?: unknown }).select !== "function") {
    return jobSpRebalanceState(undefined, now);
  }
  const row = (
    await executor
      .select({ value: opsSettings.value })
      .from(opsSettings)
      .where(eq(opsSettings.key, JOB_SP_REBALANCE_SETTING_KEY))
      .limit(1)
  )[0];
  return jobSpRebalanceState(row?.value, now);
}
