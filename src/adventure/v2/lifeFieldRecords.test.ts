import { describe, expect, it } from "vitest";
import {
  LIFE_FIELD_BASIC_RECORD_TOTAL,
  LIFE_FIELD_RARE_RECORD_TOTAL,
  abandonLifeFieldTrace,
  applyLifeFieldSuccess,
  emptyLifeFieldRecordsState,
  lifeFieldDailyView,
  lifeFieldRecordSummary,
} from "./lifeFieldRecords";

const NOW = Date.parse("2026-08-06T12:00:00+09:00");

function sequence(values: number[]) {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)] ?? 0.99;
}

describe("life field records", () => {
  it("starts with 33 basic and 3 rare records", () => {
    expect(LIFE_FIELD_BASIC_RECORD_TOTAL).toBe(33);
    expect(LIFE_FIELD_RARE_RECORD_TOTAL).toBe(3);
  });

  it("records region and environment observations without backfill", () => {
    const result = applyLifeFieldSuccess(emptyLifeFieldRecordsState(), {
      activity: "woodcutting",
      sourceId: "pine_grove",
      environmentId: "woodcutting_dense_growth",
      dayKey: "2026-08-06",
      now: NOW,
      sessionId: "manual-1",
      discoveriesEnabled: false,
    });
    expect(result.newRecordIds).toEqual([
      "region:woodcutting:pine_grove",
      "environment:woodcutting_dense_growth",
    ]);
    expect(lifeFieldRecordSummary(result.state).basic.discovered).toBe(2);
  });

  it("does not process a retried session twice", () => {
    const first = applyLifeFieldSuccess(emptyLifeFieldRecordsState(), {
      activity: "mining",
      sourceId: "iron_quarry",
      environmentId: "mining_exposed_vein",
      dayKey: "2026-08-06",
      now: NOW,
      sessionId: "same-session",
      successes: 5,
      discoveriesEnabled: false,
    });
    const retry = applyLifeFieldSuccess(first.state, {
      activity: "mining",
      sourceId: "iron_quarry",
      environmentId: "mining_exposed_vein",
      dayKey: "2026-08-06",
      now: NOW,
      sessionId: "same-session",
      successes: 5,
      discoveriesEnabled: false,
    });
    expect(retry.duplicate).toBe(true);
    expect(retry.state.records["region:mining:iron_quarry"].count).toBe(5);
  });

  it("caps automatic discovery evaluations while preserving all observations", () => {
    const result = applyLifeFieldSuccess(emptyLifeFieldRecordsState(), {
      activity: "woodcutting",
      sourceId: "pine_grove",
      environmentId: "woodcutting_dense_growth",
      dayKey: "2026-08-06",
      now: NOW,
      sessionId: "auto-1",
      successes: 500,
      rng: () => 0.99,
    });
    const daily = lifeFieldDailyView(result.state, "woodcutting", "2026-08-06");
    expect(daily.evaluated).toBe(80);
    expect(result.state.records["region:woodcutting:pine_grove"].count).toBe(500);
  });

  it("does not complete a newly found trace in the same automatic settlement", () => {
    const found = applyLifeFieldSuccess(emptyLifeFieldRecordsState(), {
      activity: "fishing",
      sourceId: "village_pier",
      environmentId: "fishing_active_school",
      dayKey: "2026-08-06",
      now: NOW,
      sessionId: "batch-1",
      successes: 100,
      rng: sequence([0.5, 0, 0]),
    });
    expect(found.foundTrace).not.toBeNull();
    expect(found.state.traces.fishing?.progress).toBe(0);
    expect(found.completedTrace).toBeNull();

    const completed = applyLifeFieldSuccess(found.state, {
      activity: "fishing",
      sourceId: "village_pier",
      environmentId: "fishing_active_school",
      dayKey: "2026-08-07",
      now: NOW + 86_400_000,
      sessionId: "batch-2",
      successes: 3,
      rng: () => 0.99,
    });
    expect(completed.completedTrace?.progress).toBe(3);
    expect(completed.state.traces.fishing).toBeUndefined();
  });

  it("pauses pity and daily evaluations while a trace is held", () => {
    const found = applyLifeFieldSuccess(emptyLifeFieldRecordsState(), {
      activity: "mining",
      sourceId: "iron_quarry",
      environmentId: "mining_exposed_vein",
      dayKey: "2026-08-06",
      now: NOW,
      sessionId: "find",
      rng: sequence([0.5, 0, 0]),
    });
    const before = lifeFieldDailyView(found.state, "mining", "2026-08-06");
    const wrongSpot = applyLifeFieldSuccess(found.state, {
      activity: "mining",
      sourceId: "copper_gallery",
      environmentId: "mining_stable_rock",
      dayKey: "2026-08-06",
      now: NOW + 1_000,
      sessionId: "wrong-spot",
      successes: 20,
      rng: () => 0,
    });
    const after = lifeFieldDailyView(wrongSpot.state, "mining", "2026-08-06");
    expect(after.evaluated).toBe(before.evaluated);
    expect(after.pity).toBe(before.pity);
    expect(after.trace?.progress).toBe(0);
  });

  it("abandons a trace without restoring pity", () => {
    const found = applyLifeFieldSuccess(emptyLifeFieldRecordsState(), {
      activity: "fishing",
      sourceId: "village_pier",
      environmentId: "fishing_active_school",
      dayKey: "2026-08-06",
      now: NOW,
      sessionId: "find-abandon",
      rng: sequence([0.5, 0, 0]),
    });
    const abandoned = abandonLifeFieldTrace(found.state, "fishing");
    expect(abandoned.abandoned).not.toBeNull();
    expect(abandoned.state.traces.fishing).toBeUndefined();
    expect(abandoned.state.pity.fishing).toBe(0);
  });
});
