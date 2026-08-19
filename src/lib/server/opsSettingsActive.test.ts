import { describe, expect, it, vi } from "vitest";
import type { DbExecutor } from "./savesKv";
import {
  CODEX_MASTERY_FEATURES_KEY,
  HOT_TIME_KEY,
  HOT_TIME_SCHEDULES_KEY,
  applyPctBonus,
  readActiveHotTime,
  readCodexMasteryFeatureSettings,
  parseCodexMasteryFeatureSettings,
  parseLifeFieldFeatureSettings,
} from "./opsSettings";

describe("applyPctBonus", () => {
  it("작은 핫타임 보너스도 소수 확률만큼 지급한다", () => {
    expect(applyPctBonus(3, 20, () => 0.59)).toBe(4);
    expect(applyPctBonus(3, 20, () => 0.6)).toBe(3);
  });
});

function executorReturning(rows: Array<{ key: string; value: unknown }>) {
  const limit = vi.fn(async () => rows);
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));
  return {
    executor: { select } as unknown as DbExecutor,
    select,
    limit,
  };
}

describe("readActiveHotTime", () => {
  it("수동 설정과 예약 설정을 지정 executor의 단일 쿼리로 읽는다", async () => {
    const now = Date.parse("2026-07-24T12:00:00.000Z");
    const { executor, select, limit } = executorReturning([
      {
        key: HOT_TIME_KEY,
        value: {
          enabled: true,
          title: "사냥 핫타임",
          startsAt: "2026-07-24T11:00:00.000Z",
          endsAt: "2026-07-24T13:00:00.000Z",
          bonuses: { expPct: 20, goldPct: 10 },
        },
      },
      { key: HOT_TIME_SCHEDULES_KEY, value: [] },
    ]);

    const active = await readActiveHotTime(now, executor);

    expect(select).toHaveBeenCalledTimes(1);
    expect(limit).toHaveBeenCalledWith(2);
    expect(active).toMatchObject({
      active: true,
      source: "manual",
      title: "사냥 핫타임",
      bonuses: { expPct: 20, goldPct: 10 },
    });
  });

  it("수동 설정이 꺼져 있으면 같은 쿼리에서 읽은 예약 설정을 적용한다", async () => {
    // 2026-07-24 02:00 UTC = 금요일 11:00 KST로 예약 구간 안이다.
    const now = Date.parse("2026-07-24T02:00:00.000Z");
    const { executor, select } = executorReturning([
      { key: HOT_TIME_KEY, value: { enabled: false } },
      {
        key: HOT_TIME_SCHEDULES_KEY,
        value: [
          {
            id: "friday",
            enabled: true,
            title: "금요일 핫타임",
            days: [5],
            startsAt: "11:00",
            endsAt: "13:00",
            bonuses: { masteryPct: 30 },
          },
        ],
      },
    ]);

    const active = await readActiveHotTime(now, executor);

    expect(select).toHaveBeenCalledTimes(1);
    expect(active).toMatchObject({
      active: true,
      source: "schedule",
      scheduleId: "friday",
      bonuses: { masteryPct: 30 },
    });
  });
});

describe("life field feature settings", () => {
  it("defaults missing switches on and preserves explicit emergency stops", () => {
    expect(parseLifeFieldFeatureSettings({ discoveriesEnabled: false })).toEqual({
      environmentEnabled: true,
      discoveriesEnabled: false,
      discoveryRewardsEnabled: true,
      feedEnabled: true,
      milestonesEnabled: true,
    });
  });
});

describe("codex mastery feature settings", () => {
  it("defaults every new feature off and preserves explicit switches", () => {
    expect(parseCodexMasteryFeatureSettings({ recordingEnabled: true })).toEqual({
      recordingEnabled: true,
      rankingVisible: false,
      sealsEnabled: false,
      trophiesEnabled: false,
      monthlyProgressEnabled: false,
      monthlyRankingVisible: false,
      settlementEnabled: false,
      feedEnabled: false,
    });
  });

  it("reads through the supplied executor", async () => {
    const { executor, select } = executorReturning([
      {
        key: CODEX_MASTERY_FEATURES_KEY,
        value: { recordingEnabled: true },
      },
    ]);

    const settings = await readCodexMasteryFeatureSettings(executor);

    expect(select).toHaveBeenCalledTimes(1);
    expect(settings).toMatchObject({ recordingEnabled: true });
  });
});
