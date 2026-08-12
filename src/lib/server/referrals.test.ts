import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  attributeReferral,
  createReferralCode,
  normalizeReferralCode,
  REFERRAL_NEW_USER_STAMINA_POTIONS,
  REFERRAL_REFERRER_SIGNUP_STAMINA_POTIONS,
  REFERRAL_TUTORIAL_STAMINA_POTIONS_PER_TASK,
  preserveReferralBeforeUserDeletion,
  referralLandingUrl,
  rewardReferralTutorialTasks,
} from "./referrals";
import {
  marketplaceInbox,
  referralCodes,
  referralConversions,
} from "@/db/schema";

const identityMocks = vi.hoisted(() => ({
  allowed: true,
  backfilled: [] as string[],
}));

vi.mock("./referralIdentity", () => ({
  reserveReferralIdentityClaims: vi.fn(async () => identityMocks.allowed),
  backfillReferralIdentityClaims: vi.fn(async (_tx, userId: string) => {
    identityMocks.backfilled.push(userId);
  }),
}));

const originalAuthUrl = process.env.AUTH_URL;

beforeEach(() => {
  identityMocks.allowed = true;
  identityMocks.backfilled = [];
});

afterEach(() => {
  if (originalAuthUrl === undefined) delete process.env.AUTH_URL;
  else process.env.AUTH_URL = originalAuthUrl;
});

describe("referrals", () => {
  it("URL 코드를 정규화하고 잘못된 형식은 거절한다", () => {
    expect(normalizeReferralCode(" ABCDEF0123456789 ")).toBe(
      "abcdef0123456789",
    );
    expect(normalizeReferralCode("too-short")).toBeNull();
    expect(normalizeReferralCode("gggggggggggggggg")).toBeNull();
  });

  it("충분히 긴 임의 hex 코드를 발급한다", () => {
    const first = createReferralCode();
    const second = createReferralCode();
    expect(first).toMatch(/^[a-f0-9]{16}$/);
    expect(second).toMatch(/^[a-f0-9]{16}$/);
    expect(first).not.toBe(second);
  });

  it("프록시 내부 주소 대신 운영 AUTH_URL로 대문 이동 주소를 만든다", () => {
    process.env.AUTH_URL = "https://msmsge.com";
    expect(
      referralLandingUrl("https://localhost:3000/r/code").href,
    ).toBe("https://msmsge.com/sign-in");
  });

  it("가입과 각 튜토리얼 과제는 양쪽에 회복약 2개씩 지급한다", () => {
    expect(REFERRAL_NEW_USER_STAMINA_POTIONS).toBe(2);
    expect(REFERRAL_REFERRER_SIGNUP_STAMINA_POTIONS).toBe(2);
    expect(REFERRAL_TUTORIAL_STAMINA_POTIONS_PER_TASK).toBe(2);
  });

  it("신규 캐릭터 귀속 시 신규와 홍보자에게 회복약 2개 우편을 한 번만 만든다", async () => {
    const trace = makeTrace();
    const tx = fakeExecutor({
      ownerUserId: "referrer",
      conversionInserted: true,
      trace,
    });

    await expect(
      attributeReferral(tx as never, "new-user", "abcdef0123456789", "새싹"),
    ).resolves.toEqual({ attributed: true });
    expect(trace.inserted.map((entry) => entry.table)).toEqual([
      referralConversions,
      marketplaceInbox,
      marketplaceInbox,
    ]);
    expect(trace.inserted[0]?.values).toMatchObject({
      referredUserId: "new-user",
      referrerUserId: "referrer",
      referredName: "새싹",
      rewardGold: 0,
      rewardedDepth: 0,
      referrerSignupRewardedAt: expect.any(Date),
      rewardedStaminaDepth: 0,
    });
    expect(trace.inserted[1]).toMatchObject({
      table: marketplaceInbox,
      values: {
        userId: "new-user",
        kind: "admin_gift",
        payload: { staminaPotions: 2 },
      },
    });
    expect(trace.inserted[2]).toMatchObject({
      table: marketplaceInbox,
      values: {
        userId: "referrer",
        kind: "admin_gift",
        payload: { staminaPotions: 2 },
        message: expect.stringContaining("새싹님"),
      },
    });
  });

  it("로그인 주체가 과거 보상을 받았으면 새 사용자 ID에도 귀속과 우편을 만들지 않는다", async () => {
    identityMocks.allowed = false;
    const trace = makeTrace();
    const tx = fakeExecutor({
      ownerUserId: "referrer",
      conversionInserted: true,
      trace,
    });

    await expect(
      attributeReferral(
        tx as never,
        "recreated-user-id",
        "abcdef0123456789",
        "돌아온 모험가",
      ),
    ).resolves.toEqual({ attributed: false });
    expect(trace.inserted).toHaveLength(0);
  });

  it("자기 추천과 이미 귀속된 계정에는 새 귀속을 만들지 않는다", async () => {
    const selfTrace = makeTrace();
    expect(
      await attributeReferral(
        fakeExecutor({
          ownerUserId: "same-user",
          conversionInserted: true,
          trace: selfTrace,
        }) as never,
        "same-user",
        "abcdef0123456789",
      ),
    ).toEqual({ attributed: false });
    expect(selfTrace.inserted).toHaveLength(0);

    const duplicateTrace = makeTrace();
    expect(
      await attributeReferral(
        fakeExecutor({
          ownerUserId: "referrer",
          conversionInserted: false,
          trace: duplicateTrace,
        }) as never,
        "already-attributed",
        "abcdef0123456789",
      ),
    ).toEqual({ attributed: false });
    expect(duplicateTrace.inserted.map((entry) => entry.table)).toEqual([
      referralConversions,
    ]);
  });

  it("새 과제들을 로드맵 순서로 기록하고 양쪽 보상을 한 통씩 합산한다", async () => {
    const trace = makeTrace();
    const tx = fakeExecutor({
      ownerUserId: "unused",
      conversionInserted: false,
      lockedConversion: {
        referredUserId: "new-user",
        referrerUserId: "referrer",
        completedTutorialTaskIds: [],
      },
      trace,
    });

    await expect(
      rewardReferralTutorialTasks(
        tx as never,
        "new-user",
        "새싹",
        ["life_level_10", "life_level_5", "life_level_10"],
      ),
    ).resolves.toEqual({
      staminaPotions: 4,
      newlyCompletedTaskIds: ["life_level_5", "life_level_10"],
      completedTaskIds: ["life_level_5", "life_level_10"],
    });
    expect(trace.updates).toEqual([
      {
        table: referralConversions,
        values: {
          completedTutorialTaskIds: ["life_level_5", "life_level_10"],
        },
      },
    ]);
    expect(trace.inserted).toHaveLength(2);
    expect(trace.inserted[0]).toMatchObject({
      table: marketplaceInbox,
      values: {
        userId: "new-user",
        kind: "admin_gift",
        payload: { gold: 0, staminaPotions: 4 },
        message: expect.stringContaining("첫 생활 숙련, 생활의 기반"),
      },
    });
    expect(trace.inserted[1]).toMatchObject({
      table: marketplaceInbox,
      values: {
        userId: "referrer",
        kind: "admin_gift",
        payload: { gold: 0, staminaPotions: 4 },
        message: expect.stringContaining("새싹님"),
      },
    });
  });

  it("이미 완료된 과제는 재호출과 승계 상태에서 다시 지급하지 않는다", async () => {
    const trace = makeTrace();
    const tx = fakeExecutor({
      ownerUserId: "unused",
      conversionInserted: false,
      lockedConversion: {
        referredUserId: "new-user",
        referrerUserId: "referrer",
        completedTutorialTaskIds: ["hunt_depth_24", "join_guild"],
      },
      trace,
    });

    await expect(
      rewardReferralTutorialTasks(
        tx as never,
        "new-user",
        "새싹",
        ["join_guild", "hunt_depth_24"],
      ),
    ).resolves.toEqual({
      staminaPotions: 0,
      newlyCompletedTaskIds: [],
      completedTaskIds: ["hunt_depth_24", "join_guild"],
    });
    expect(trace.inserted).toHaveLength(0);
    expect(trace.updates).toHaveLength(0);
  });

  it("다섯 과제를 모두 기록한 뒤에는 추가 보상을 만들지 않는다", async () => {
    const trace = makeTrace();
    const tx = fakeExecutor({
      ownerUserId: "unused",
      conversionInserted: false,
      lockedConversion: {
        referredUserId: "new-user",
        referrerUserId: "referrer",
        completedTutorialTaskIds: [
          "hunt_depth_24",
          "join_guild",
          "life_level_5",
          "hunt_depth_36",
          "life_level_10",
        ],
      },
      trace,
    });

    await expect(
      rewardReferralTutorialTasks(
        tx as never,
        "new-user",
        "새싹",
        ["life_level_10"],
      ),
    ).resolves.toMatchObject({ staminaPotions: 0, newlyCompletedTaskIds: [] });
    expect(trace.inserted).toHaveLength(0);
    expect(trace.updates).toHaveLength(0);
  });

  it("후보 과제가 없으면 홍보 DB를 조회하지 않는다", async () => {
    const trace = makeTrace();
    const tx = fakeExecutor({
      ownerUserId: "unused",
      conversionInserted: false,
      trace,
    });
    await expect(
      rewardReferralTutorialTasks(tx as never, "new-user", "새싹", []),
    ).resolves.toEqual({
      staminaPotions: 0,
      newlyCompletedTaskIds: [],
      completedTaskIds: [],
    });
    expect(trace.selectedTables).toHaveLength(0);
  });

  it("귀속 기록이 없으면 보상과 완료 기록을 만들지 않는다", async () => {
    const trace = makeTrace();
    const tx = fakeExecutor({
      ownerUserId: "unused",
      conversionInserted: false,
      trace,
    });

    await expect(
      rewardReferralTutorialTasks(
        tx as never,
        "new-user",
        "새싹",
        ["join_guild"],
      ),
    ).resolves.toEqual({
      staminaPotions: 0,
      newlyCompletedTaskIds: [],
      completedTaskIds: [],
    });
    expect(trace.inserted).toHaveLength(0);
    expect(trace.updates).toHaveLength(0);
  });

  it("추천 참여자가 탈퇴하면 식별 원장을 보강하고 전환 기록을 익명화한다", async () => {
    const trace = makeTrace();
    const tx = fakeExecutor({
      ownerUserId: "unused",
      conversionInserted: false,
      existingConversion: true,
      trace,
    });

    await preserveReferralBeforeUserDeletion(tx as never, "referred-user");

    expect(identityMocks.backfilled).toEqual(["referred-user"]);
    expect(trace.updates).toContainEqual({
      table: referralConversions,
      values: {
        referredUserId: null,
        referredName: "탈퇴한 사용자",
        referredDeletedAt: expect.any(Date),
      },
    });
  });
});

type Trace = {
  selectedTables: unknown[];
  inserted: Array<{ table: unknown; values: unknown }>;
  updates: Array<{ table: unknown; values: unknown }>;
};

function makeTrace(): Trace {
  return { selectedTables: [], inserted: [], updates: [] };
}

function fakeExecutor(args: {
  ownerUserId: string;
  conversionInserted: boolean;
  existingConversion?: boolean;
  lockedConversion?: {
    referredUserId: string | null;
    referrerUserId: string;
    completedTutorialTaskIds: unknown;
  };
  trace: Trace;
}) {
  return {
    select: () => ({
      from: (table: unknown) => {
        args.trace.selectedTables.push(table);
        return {
          where: () => ({
            limit: async () =>
              table === referralCodes
                ? [{ userId: args.ownerUserId }]
                : table === referralConversions && args.existingConversion
                  ? [{ id: 1 }]
                  : [],
            for: () => ({
              limit: async () =>
                table === referralConversions && args.lockedConversion
                  ? [args.lockedConversion]
                  : [],
            }),
          }),
        };
      },
    }),
    insert: (table: unknown) => ({
      values: (values: unknown) => {
        args.trace.inserted.push({ table, values });
        if (table === referralConversions) {
          return {
            onConflictDoNothing: () => ({
              returning: async () =>
                args.conversionInserted ? [{ referredUserId: "new-user" }] : [],
            }),
          };
        }
        return Promise.resolve();
      },
    }),
    update: (table: unknown) => ({
      set: (values: unknown) => ({
        where: async () => {
          args.trace.updates.push({ table, values });
        },
      }),
    }),
  };
}
