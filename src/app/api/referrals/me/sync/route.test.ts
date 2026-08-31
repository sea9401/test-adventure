import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userId: "referred-user" as string | null,
  sessionFailure: null as Response | null,
  snapshot: {
    frontierDepth: 36,
    hasGuild: true,
    maxLifeLevel: 10,
    taskIds: [
      "hunt_depth_24",
      "join_guild",
      "life_level_5",
      "hunt_depth_36",
      "life_level_10",
    ],
  },
  reward: {
    staminaPotions: 4,
    newlyCompletedTaskIds: ["join_guild", "life_level_5"],
    completedTaskIds: ["hunt_depth_24", "join_guild", "life_level_5"],
  },
  rewardCalls: [] as unknown[][],
}));

vi.mock("@/lib/server/ensureUser", () => ({
  ensureOriginalUser: vi.fn(async () => mocks.userId),
}));
vi.mock("@/lib/server/checkSession", () => ({
  requireActiveDeviceSession: vi.fn(async () => mocks.sessionFailure),
}));
vi.mock("@/lib/server/userRateLimit", () => ({
  enforceUserAndIpRateLimit: vi.fn(() => null),
}));
vi.mock("@/lib/server/referralTutorialProgress", () => ({
  loadReferralTutorialSnapshot: vi.fn(async () => mocks.snapshot),
}));
vi.mock("@/lib/server/referrals", () => ({
  rewardReferralTutorialTasks: vi.fn(async (...args: unknown[]) => {
    mocks.rewardCalls.push(args);
    return mocks.reward;
  }),
}));
vi.mock("@/lib/server/savesKv", () => ({
  readSave: vi.fn(async () => ({ name: "새싹" })),
}));
vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn(async (run: (tx: object) => Promise<unknown>) => run({})),
  },
}));

import { POST } from "./route";

describe("POST /api/referrals/me/sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.userId = "referred-user";
    mocks.sessionFailure = null;
    mocks.rewardCalls = [];
  });

  it("현재 상태에서 달성한 과제를 한 번에 동기화한다", async () => {
    const response = await POST(new Request("http://test/api/referrals/me/sync", {
      method: "POST",
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      staminaPotions: 4,
      newlyCompletedTaskIds: ["join_guild", "life_level_5"],
    });
    expect(mocks.rewardCalls).toHaveLength(1);
    expect(mocks.rewardCalls[0]?.slice(1)).toEqual([
      "referred-user",
      "새싹",
      mocks.snapshot.taskIds,
    ]);
  });

  it("인증 또는 활성 세션이 없으면 동기화하지 않는다", async () => {
    mocks.userId = null;
    const unauthorized = await POST(new Request("http://test/api/referrals/me/sync", {
      method: "POST",
    }));
    expect(unauthorized.status).toBe(401);

    mocks.userId = "referred-user";
    mocks.sessionFailure = new Response("inactive", { status: 410 });
    const inactive = await POST(new Request("http://test/api/referrals/me/sync", {
      method: "POST",
    }));
    expect(inactive.status).toBe(410);
    expect(mocks.rewardCalls).toHaveLength(0);
  });
});
