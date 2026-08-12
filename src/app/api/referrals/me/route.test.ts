import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userId: "referrer" as string | null,
  codeRows: [{ code: "abcdef0123456789", disabledAt: null }] as Array<
    Record<string, unknown>
  >,
  currentProgressRows: [] as Array<Record<string, unknown>>,
  referralRows: [] as Array<Record<string, unknown>>,
  selectCall: 0,
}));

vi.mock("@/lib/server/ensureUser", () => ({
  ensureOriginalUser: vi.fn(async () => mocks.userId),
}));
vi.mock("@/lib/server/checkSession", () => ({
  requireActiveDeviceSession: vi.fn(async () => null),
}));
vi.mock("@/db", () => ({
  db: {
    select: vi.fn((selection: Record<string, unknown>) => {
      mocks.selectCall += 1;
      if ("code" in selection) {
        return {
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn(async () => mocks.codeRows),
            })),
          })),
        };
      }
      if (!("currentName" in selection)) {
        return {
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn(async () => mocks.currentProgressRows),
            })),
          })),
        };
      }
      const terminal = {
        where: vi.fn(() => ({
          orderBy: vi.fn(async () => mocks.referralRows),
        })),
      };
      const secondJoin = {
        leftJoin: vi.fn(() => terminal),
      };
      return {
        from: vi.fn(() => ({
          innerJoin: vi.fn(() => secondJoin),
          leftJoin: vi.fn(() => secondJoin),
        })),
      };
    }),
  },
}));

import { GET } from "./route";

describe("GET /api/referrals/me", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.userId = "referrer";
    mocks.selectCall = 0;
    mocks.codeRows = [{ code: "abcdef0123456789", disabledAt: null }];
    mocks.currentProgressRows = [];
    mocks.referralRows = [];
  });

  it("탈퇴한 참여자도 익명 이름과 지급 진척도로 계속 집계한다", async () => {
    mocks.referralRows = [
      {
        currentName: null,
        referredName: "탈퇴한 사용자",
        referredUserId: null,
        referredDeletedAt: new Date("2026-08-12T00:00:00.000Z"),
        character: null,
        completedTutorialTaskIds: ["hunt_depth_24", "join_guild"],
        referrerSignupRewardedAt: new Date("2026-08-01T00:00:00.000Z"),
        convertedAt: new Date("2026-08-01T00:00:00.000Z"),
      },
    ];

    const response = await GET(new Request("http://test/api/referrals/me"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({
      attributedCount: 1,
      totalRewardStaminaPotions: 6,
      referrals: [
        {
          name: "탈퇴한 사용자",
          deleted: true,
          completedTaskIds: ["hunt_depth_24", "join_guild"],
          completedRewardStages: 3,
        },
      ],
    });
  });

  it("초대받은 이용자의 내 진행도와 여섯 단계 로드맵을 반환한다", async () => {
    mocks.currentProgressRows = [
      {
        referrerSignupRewardedAt: new Date("2026-08-01T00:00:00.000Z"),
        completedTutorialTaskIds: ["life_level_10", "hunt_depth_24"],
      },
    ];

    const response = await GET(new Request("http://test/api/referrals/me"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.tutorialTasks.map((task: { id: string }) => task.id)).toEqual([
      "signup",
      "hunt_depth_24",
      "join_guild",
      "life_level_5",
      "hunt_depth_36",
      "life_level_10",
    ]);
    expect(json.myReferralProgress).toEqual({
      signupRewarded: true,
      completedTaskIds: ["hunt_depth_24", "life_level_10"],
      completedRewardStages: 3,
    });
  });
});
