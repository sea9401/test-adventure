import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  charSave: { level: 10, gold: 20_000_000, bankedGold: 0 },
  rewardCalls: [] as unknown[][],
}));

vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "founder"),
}));
vi.mock("@/lib/server/ugcSafety", () => ({
  requireCurrentUgcConsent: vi.fn(async () => null),
}));
vi.mock("@/lib/server/v2EnsureSoloGuild", () => ({
  createUserGuild: vi.fn(async () => 7),
  GuildCreateError: class GuildCreateError extends Error {},
}));
vi.mock("@/lib/server/guildActivityLog", () => ({
  logGuildActivity: vi.fn(async () => undefined),
}));
vi.mock("@/lib/server/referrals", () => ({
  rewardReferralTutorialTasks: vi.fn(async (...args: unknown[]) => {
    mocks.rewardCalls.push(args);
    return {
      staminaPotions: 2,
      newlyCompletedTaskIds: ["join_guild"],
      completedTaskIds: ["join_guild"],
    };
  }),
}));
vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: vi.fn(async () => mocks.charSave),
  upsertSave: vi.fn(async () => undefined),
}));
vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn(async (run: (tx: object) => Promise<unknown>) => run({})),
  },
}));

import { POST } from "./route";

describe("POST /api/v2/guild/create referral tutorial", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rewardCalls = [];
  });

  it("길드 창단이 성공하면 길드 가입 과제를 완료한다", async () => {
    const response = await POST(new Request("http://test/api/v2/guild/create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "새길드" }),
    }));

    expect(response.status).toBe(200);
    expect(mocks.rewardCalls).toHaveLength(1);
    expect(mocks.rewardCalls[0]?.slice(1)).toEqual([
      "founder",
      "새 모험가",
      ["join_guild"],
    ]);
  });
});
