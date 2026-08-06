import { describe, expect, it } from "vitest";
import { RETENTION_POLICY, retentionCutoff } from "./retentionPolicy";

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
});
