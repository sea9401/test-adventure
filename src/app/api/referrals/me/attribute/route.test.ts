import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userId: "referred-user" as string | null,
  sessionFailure: null as Response | null,
  limited: null as Response | null,
  normalizedCode: "abcdef0123456789" as string | null,
  attribution: { attributed: true as const } as
    | { attributed: true }
    | {
        attributed: false;
        reason: "invalid_code" | "self_referral" | "already_attributed";
      },
  profile: { name: "새싹" } as { name?: unknown },
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
    staminaPotions: 10,
    newlyCompletedTaskIds: [
      "hunt_depth_24",
      "join_guild",
      "life_level_5",
      "hunt_depth_36",
      "life_level_10",
    ],
    completedTaskIds: [
      "hunt_depth_24",
      "join_guild",
      "life_level_5",
      "hunt_depth_36",
      "life_level_10",
    ],
  },
  tx: { kind: "transaction" },
  attributeCalls: [] as unknown[][],
  rewardCalls: [] as unknown[][],
  rateLimitCalls: [] as unknown[],
}));

vi.mock("@/lib/server/ensureUser", () => ({
  ensureOriginalUser: vi.fn(async () => mocks.userId),
}));
vi.mock("@/lib/server/checkSession", () => ({
  requireActiveDeviceSession: vi.fn(async () => mocks.sessionFailure),
}));
vi.mock("@/lib/server/userRateLimit", () => ({
  enforceUserAndIpRateLimit: vi.fn((_req, options) => {
    mocks.rateLimitCalls.push(options);
    return mocks.limited;
  }),
}));
vi.mock("@/lib/server/referralTutorialProgress", () => ({
  loadReferralTutorialSnapshot: vi.fn(async () => mocks.snapshot),
}));
vi.mock("@/lib/server/referrals", () => ({
  normalizeReferralInput: vi.fn(() => mocks.normalizedCode),
  attributeReferral: vi.fn(async (...args: unknown[]) => {
    mocks.attributeCalls.push(args);
    return mocks.attribution;
  }),
  rewardReferralTutorialTasks: vi.fn(async (...args: unknown[]) => {
    mocks.rewardCalls.push(args);
    return mocks.reward;
  }),
}));
vi.mock("@/lib/server/savesKv", () => ({
  readSave: vi.fn(async () => mocks.profile),
}));
vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn(async (run: (tx: object) => Promise<unknown>) =>
      run(mocks.tx),
    ),
  },
}));

import { POST } from "./route";

function request(referral: unknown = "https://msmsge.com/r/abcdef0123456789") {
  return new Request("http://test/api/referrals/me/attribute", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ referral }),
  });
}

describe("POST /api/referrals/me/attribute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.userId = "referred-user";
    mocks.sessionFailure = null;
    mocks.limited = null;
    mocks.normalizedCode = "abcdef0123456789";
    mocks.attribution = { attributed: true };
    mocks.profile = { name: "새싹" };
    mocks.attributeCalls = [];
    mocks.rewardCalls = [];
    mocks.rateLimitCalls = [];
  });

  it("사후 귀속과 현재 진행도 보상을 한 트랜잭션에서 완료한다", async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      staminaPotions: 10,
      newlyCompletedTaskIds: [
        "hunt_depth_24",
        "join_guild",
        "life_level_5",
        "hunt_depth_36",
        "life_level_10",
      ],
    });
    expect(mocks.attributeCalls).toEqual([
      [mocks.tx, "referred-user", "abcdef0123456789", "새싹"],
    ]);
    expect(mocks.rewardCalls).toEqual([
      [mocks.tx, "referred-user", "새싹", mocks.snapshot.taskIds],
    ]);
    expect(mocks.rateLimitCalls).toEqual([
      {
        userId: "referred-user",
        action: "referrals:attribute",
        userLimit: 10,
        ipLimit: 100,
        windowMs: 60_000,
      },
    ]);
  });

  it("형식이 잘못된 입력은 트랜잭션 전에 거절한다", async () => {
    mocks.normalizedCode = null;

    const response = await POST(request("잘못된 코드"));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      ok: false,
      error: "invalid_referral",
    });
    expect(mocks.attributeCalls).toHaveLength(0);
    expect(mocks.rewardCalls).toHaveLength(0);
  });

  it.each([
    ["self_referral", "self_referral"],
    ["already_attributed", "already_attributed"],
    ["invalid_code", "invalid_referral"],
  ] as const)("귀속 실패 %s 뒤에는 소급 보상을 만들지 않는다", async (reason, error) => {
    mocks.attribution = { attributed: false, reason };

    const response = await POST(request());

    expect(response.status).toBe(reason === "invalid_code" ? 400 : 409);
    expect(await response.json()).toEqual({ ok: false, error });
    expect(mocks.rewardCalls).toHaveLength(0);
  });

  it("인증, 활성 세션, 호출 제한 실패 시 귀속하지 않는다", async () => {
    mocks.userId = null;
    expect((await POST(request())).status).toBe(401);

    mocks.userId = "referred-user";
    mocks.sessionFailure = new Response("inactive", { status: 410 });
    expect((await POST(request())).status).toBe(410);

    mocks.sessionFailure = null;
    mocks.limited = Response.json(
      { ok: false, error: "rate_limited" },
      { status: 429 },
    );
    expect((await POST(request())).status).toBe(429);
    expect(mocks.attributeCalls).toHaveLength(0);
  });
});
