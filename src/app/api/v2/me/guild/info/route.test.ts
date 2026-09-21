import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  viewerId: "member",
  lastSeenAt: null as Date | null,
  currentMember: true,
}));
vi.mock("@/lib/server/ensureUser", () => ({ ensureUser: async () => state.viewerId }));
vi.mock("@/lib/server/guildFacilityUpgradeDonations", () => ({
  readGuildFacilityDonationProgress: async () => ({}),
}));
vi.mock("@/db", async () => {
  const { guildMembers, guilds, presence } = await import("@/db/schema");
  return { db: {
    select: (fields: Record<string, unknown>) => ({ from: (table: unknown) => {
      const members = [{ userId: "master", role: "master", joinedAt: new Date("2026-08-01") }];
      if (state.currentMember) members.push({ userId: "member", role: "member", joinedAt: new Date("2026-08-02") });
      const rows = table === guildMembers
        ? "guildId" in fields ? [{ guildId: 7 }] : members
        : table === guilds ? [{
          id: 7, name: "길드", masterId: "master", createdAt: new Date("2026-08-01"),
          level: 1, fameTotal: 0, fameAvailable: 0, nationName: null,
        }]
        : table === presence && state.lastSeenAt ? [{ userId: "master", lastSeenAt: state.lastSeenAt }]
        : [];
      const chain = {
        where: () => chain, limit: () => chain, orderBy: () => chain,
        then: (resolve: (value: unknown[]) => unknown) => Promise.resolve(rows).then(resolve),
      };
      return chain;
    } }),
  } };
});

import { GET } from "./route";

const now = Date.parse("2026-09-21T05:00:00Z");
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  state.viewerId = "member";
  state.currentMember = true;
  state.lastSeenAt = new Date(now - 72 * 60 * 60 * 1000);
});
afterEach(() => vi.useRealTimers());

describe("길드 정보의 승계 가능 여부", () => {
  it("72시간 미접속 시 일반 길드원에게 승계를 허용한다", async () => {
    const response = await GET();
    expect(await response.json()).toMatchObject({ isMaster: false, canClaimLeadership: true });
  });
  it("현재 길드장에게 승계를 표시하지 않는다", async () => {
    state.viewerId = "master";
    expect(await (await GET()).json()).toMatchObject({ isMaster: true, canClaimLeadership: false });
  });
  it("조회 도중 소속을 잃은 신청자에게 승계를 표시하지 않는다", async () => {
    state.currentMember = false;
    expect(await (await GET()).json()).toMatchObject({ canClaimLeadership: false });
  });
  it.each([null, new Date(now - 72 * 60 * 60 * 1000 + 1)])(
    "접속 기록이 없거나 72시간 미만이면 승계를 표시하지 않는다", async (lastSeenAt) => {
      state.lastSeenAt = lastSeenAt;
      expect(await (await GET()).json()).toMatchObject({ canClaimLeadership: false });
    },
  );
});
