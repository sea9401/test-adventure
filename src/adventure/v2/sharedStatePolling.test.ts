import { describe, expect, it } from "vitest";
import {
  coopDetailPollDelayMs,
  coopListPollDelayMs,
  guildRaidPollDelayMs,
  guildTradePollDelayMs,
  sharedStateSnapshotKey,
  tournamentPollDelayMs,
} from "./sharedStatePolling";

describe("shared state polling policies", () => {
  it.each([
    [coopListPollDelayMs, [20_000, 20_000, 60_000, 60_000]],
    [guildRaidPollDelayMs, [20_000, 20_000, 60_000, 60_000]],
    [guildTradePollDelayMs, [10_000, 10_000, 30_000, 60_000]],
    [tournamentPollDelayMs, [15_000, 15_000, 30_000, 60_000]],
    [coopDetailPollDelayMs, [5_000, 5_000, 5_000, 30_000]],
  ])("화면별 idle 단계에 맞는 간격을 반환한다 %#", (delay, expected) => {
    expect([delay(0), delay(1), delay(2), delay(8)]).toEqual(expected);
  });

  it("공유 상태 snapshot은 같은 payload에 안정적이고 변경을 감지한다", () => {
    const current = sharedStateSnapshotKey({ hp: 100, rows: [{ id: 1 }] });
    expect(sharedStateSnapshotKey({ hp: 100, rows: [{ id: 1 }] })).toBe(current);
    expect(sharedStateSnapshotKey({ hp: 99, rows: [{ id: 1 }] })).not.toBe(current);
  });
});
