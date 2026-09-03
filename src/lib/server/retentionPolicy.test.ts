import { describe, expect, it } from "vitest";
import {
  RETENTION_POLICY,
  drainRetentionBatches,
  retentionCutoff,
} from "./retentionPolicy";

describe("운영 로그 보관 정책", () => {
  it("고빈도 로그와 운영 기록의 확정 보관 기간을 유지한다", () => {
    expect(RETENTION_POLICY.coopReplayDays).toBe(7);
    expect(RETENTION_POLICY.coopReplaysPerSession).toBe(100);
    expect(RETENTION_POLICY.guildActivitiesPerGuild).toBe(500);
    expect(RETENTION_POLICY.marketplaceClosedDays).toBe(60);
    expect(RETENTION_POLICY.adminAuditDays).toBe(60);
    expect(RETENTION_POLICY.endedSanctionDays).toBe(60);
    expect(RETENTION_POLICY.abuseDays).toBe(30);
    expect(RETENTION_POLICY.economyDays).toBe(30);
  });

  it("기간 기준 시각을 밀리초 손실 없이 계산한다", () => {
    const now = new Date("2026-08-05T04:20:00.000Z");
    expect(retentionCutoff(7, now).toISOString()).toBe(
      "2026-07-29T04:20:00.000Z",
    );
  });

  it("적체 배치를 제한 횟수까지만 합산하고 남은 적체를 표시한다", async () => {
    const batches = [
      { deleted: 5_000, more: true },
      { deleted: 5_000, more: true },
      { deleted: 2_000, more: false },
    ];
    let calls = 0;

    await expect(
      drainRetentionBatches(async () => batches[calls++], 6),
    ).resolves.toEqual({ deleted: 12_000, more: false });
    expect(calls).toBe(3);
  });

  it("모든 배치가 가득 차도 실행 상한을 넘지 않는다", async () => {
    let calls = 0;

    await expect(
      drainRetentionBatches(async () => {
        calls += 1;
        return { deleted: 5_000, more: true };
      }, 3),
    ).resolves.toEqual({ deleted: 15_000, more: true });
    expect(calls).toBe(3);
  });

  it("경제 로그는 현재 일일 유입량보다 큰 정리 여유를 확보한다", async () => {
    let calls = 0;
    const result = await drainRetentionBatches(async () => {
      calls += 1;
      return { deleted: RETENTION_POLICY.deleteBatchSize, more: true };
    }, RETENTION_POLICY.economyDeleteMaxBatches);

    expect(result.deleted).toBeGreaterThanOrEqual(100_000);
    expect(result.more).toBe(true);
    expect(calls).toBe(RETENTION_POLICY.economyDeleteMaxBatches);
  });
});
