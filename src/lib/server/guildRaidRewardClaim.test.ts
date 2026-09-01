import { describe, expect, it } from "vitest";
import { resolveGuildRaidRewardClaim } from "./guildRaidRewardClaim";

const event = {
  startsAt: new Date("2026-08-16T15:00:00.000Z"),
  endsAt: new Date("2026-08-21T15:00:00.000Z"),
  status: "settled",
};

const participant = {
  eligibleAtSettlement: true,
  rewardClaimedAt: null,
};

describe("길드 토벌전 주말 보상 수령", () => {
  it("토요일과 일요일에 정산 순위 보상을 직접 수령한다", () => {
    expect(
      resolveGuildRaidRewardClaim({
        now: new Date("2026-08-22T03:00:00.000Z"),
        event,
        participant,
        finalRank: 2,
      }),
    ).toEqual({
      ok: true,
      rank: 2,
      reward: { gold: 3_000_000, masteryCertificates: 300 },
    });
  });

  it("전투 기간에는 아직 받을 수 없고 다음 월요일부터는 소멸한다", () => {
    expect(
      resolveGuildRaidRewardClaim({
        now: new Date("2026-08-21T14:59:59.999Z"),
        event: { ...event, status: "active" },
        participant,
        finalRank: 1,
      }),
    ).toEqual({ ok: false, error: "claim_not_open" });
    expect(
      resolveGuildRaidRewardClaim({
        now: new Date("2026-08-23T15:00:00.000Z"),
        event,
        participant,
        finalRank: 1,
      }),
    ).toEqual({ ok: false, error: "reward_expired" });
  });

  it("미달·미정산·기수령 상태를 구분해 거절한다", () => {
    expect(
      resolveGuildRaidRewardClaim({
        now: new Date("2026-08-22T03:00:00.000Z"),
        event,
        participant: { ...participant, eligibleAtSettlement: false },
        finalRank: 1,
      }),
    ).toEqual({ ok: false, error: "not_eligible" });
    expect(
      resolveGuildRaidRewardClaim({
        now: new Date("2026-08-22T03:00:00.000Z"),
        event: { ...event, status: "active" },
        participant,
        finalRank: null,
      }),
    ).toEqual({ ok: false, error: "not_settled" });
    expect(
      resolveGuildRaidRewardClaim({
        now: new Date("2026-08-22T03:00:00.000Z"),
        event,
        participant: { ...participant, rewardClaimedAt: new Date() },
        finalRank: 1,
      }),
    ).toEqual({ ok: false, error: "already_claimed" });
  });
});
