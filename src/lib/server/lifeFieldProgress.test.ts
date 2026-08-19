import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CodexMasteryGameplayEvent } from "./codexMasteryGameplay";

const { store, recordCodexMasteryGameplayBatch } = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  recordCodexMasteryGameplayBatch: vi.fn(
    async (
      _executor: unknown,
      _userId: string,
      _events: readonly CodexMasteryGameplayEvent[],
      _now: Date,
    ) => [],
  ),
}));

vi.mock("./savesKv", () => ({
  lockSaveForUpdate: vi.fn(async (_tx, _userId, key: string, fallback: unknown) =>
    store.has(key) ? store.get(key) : fallback,
  ),
  readSave: vi.fn(async (_tx, _userId, key: string, fallback: unknown) =>
    store.has(key) ? store.get(key) : fallback,
  ),
  upsertSave: vi.fn(async (_tx, _userId, key: string, value: unknown) => {
    store.set(key, value);
  }),
}));

vi.mock("./codexMasteryGameplay", () => ({
  recordCodexMasteryGameplayBatch,
}));

import {
  LIFE_FIELD_RECORDS_KEY,
  emptyLifeFieldRecordsState,
} from "@/adventure/v2/lifeFieldRecords";
import { DEFAULT_LIFE_FIELD_FEATURES } from "./opsSettings";
import { recordLifeFieldSuccessInTx } from "./lifeFieldProgress";
import type { DbTransactionExecutor } from "./savesKv";

const TX = {} as DbTransactionExecutor;
const USER_ID = "u-life-field";
const FIRST_DAY = Date.parse("2026-08-20T01:00:00.000Z");

function args(overrides: Partial<Parameters<typeof recordLifeFieldSuccessInTx>[2]> = {}) {
  return {
    activity: "fishing" as const,
    sourceId: "village_pier",
    environmentId: "fishing_active_school" as const,
    sessionId: "session-1",
    successes: 1,
    now: FIRST_DAY,
    features: DEFAULT_LIFE_FIELD_FEATURES,
    ...overrides,
  };
}

describe("recordLifeFieldSuccessInTx codex mastery", () => {
  beforeEach(() => {
    store.clear();
    recordCodexMasteryGameplayBatch.mockClear();
  });

  it("counts every regional success but an environment only once per KST day", async () => {
    // Break caught: automatic batches inflate environment mastery by actions instead of observed days.
    await recordLifeFieldSuccessInTx(TX, USER_ID, args({ successes: 7 }));
    await recordLifeFieldSuccessInTx(TX, USER_ID, args({
      sessionId: "session-2",
      successes: 2,
      now: FIRST_DAY + 60 * 60 * 1_000,
    }));
    await recordLifeFieldSuccessInTx(TX, USER_ID, args({
      sessionId: "session-3",
      successes: 3,
      now: FIRST_DAY + 24 * 60 * 60 * 1_000,
    }));

    expect(recordCodexMasteryGameplayBatch.mock.calls.map((call) => call[2])).toEqual([
      [
        {
          category: "life",
          entryId: "region:fishing:village_pier",
          amount: 7,
          source: "life.complete",
        },
        {
          category: "life",
          entryId: "environment:fishing_active_school",
          amount: 1,
          source: "life.complete",
        },
      ],
      [
        {
          category: "life",
          entryId: "region:fishing:village_pier",
          amount: 2,
          source: "life.complete",
        },
      ],
      [
        {
          category: "life",
          entryId: "region:fishing:village_pier",
          amount: 3,
          source: "life.complete",
        },
        {
          category: "life",
          entryId: "environment:fishing_active_school",
          amount: 1,
          source: "life.complete",
        },
      ],
    ]);
  });

  it("records the completed discovery delta with the same transaction timestamp", async () => {
    // Break caught: completing a held trace updates field records but never advances permanent mastery.
    const state = emptyLifeFieldRecordsState();
    state.traces.fishing = {
      discoveryId: "fishing_migrating_school",
      activity: "fishing",
      sourceId: "village_pier",
      environmentId: "fishing_active_school",
      foundAt: FIRST_DAY - 1_000,
      progress: 0,
    };
    store.set(LIFE_FIELD_RECORDS_KEY, state);

    await recordLifeFieldSuccessInTx(TX, USER_ID, args({ successes: 3 }));

    expect(recordCodexMasteryGameplayBatch).toHaveBeenCalledWith(
      TX,
      USER_ID,
      expect.arrayContaining([{
        category: "life",
        entryId: "discovery:fishing_migrating_school",
        amount: 1,
        source: "life.complete",
      }]),
      new Date(FIRST_DAY),
    );
  });

  it("does not record duplicate sessions or zero-success transitions", async () => {
    // Break caught: retries or empty automatic settlements create permanent mastery without an activity.
    await recordLifeFieldSuccessInTx(TX, USER_ID, args());
    recordCodexMasteryGameplayBatch.mockClear();

    await recordLifeFieldSuccessInTx(TX, USER_ID, args());
    await recordLifeFieldSuccessInTx(TX, USER_ID, args({
      sessionId: "empty-session",
      successes: 0,
    }));

    expect(recordCodexMasteryGameplayBatch).not.toHaveBeenCalled();
  });
});
