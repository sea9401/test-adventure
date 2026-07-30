import { afterEach, describe, expect, it } from "vitest";
import {
  attributeReferral,
  createReferralCode,
  normalizeReferralCode,
  referralLandingUrl,
  referralRewardGold,
  referralRewardMilestones,
  rewardReferralProgress,
} from "./referrals";
import {
  marketplaceInbox,
  referralCodes,
  referralConversions,
} from "@/db/schema";

const originalReward = process.env.REFERRAL_REWARD_GOLD;
const originalAuthUrl = process.env.AUTH_URL;

afterEach(() => {
  if (originalReward === undefined) delete process.env.REFERRAL_REWARD_GOLD;
  else process.env.REFERRAL_REWARD_GOLD = originalReward;
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
      referralLandingUrl("https://localhost:3000/r/code", "accepted").href,
    ).toBe("https://msmsge.com/sign-in?referral=accepted");
  });

  it("보상액은 환경변수를 쓰되 잘못된 값에는 안전한 기본값을 쓴다", () => {
    process.env.REFERRAL_REWARD_GOLD = "25000";
    expect(referralRewardGold()).toBe(25_000);
    process.env.REFERRAL_REWARD_GOLD = "-1";
    expect(referralRewardGold()).toBe(10_000);
    process.env.REFERRAL_REWARD_GOLD = "not-a-number";
    expect(referralRewardGold()).toBe(10_000);
    process.env.REFERRAL_REWARD_GOLD = "";
    expect(referralRewardGold()).toBe(10_000);
  });

  it("총 보상을 프론티어 12·24·36 단계에 20%·30%·50%로 나눈다", () => {
    process.env.REFERRAL_REWARD_GOLD = "25000";
    expect(referralRewardMilestones()).toEqual([
      { frontierDepth: 12, rewardGold: 5_000 },
      { frontierDepth: 24, rewardGold: 7_500 },
      { frontierDepth: 36, rewardGold: 12_500 },
    ]);
    expect(referralRewardMilestones(10_001)).toEqual([
      { frontierDepth: 12, rewardGold: 2_000 },
      { frontierDepth: 24, rewardGold: 3_000 },
      { frontierDepth: 36, rewardGold: 5_001 },
    ]);
  });

  it("가입 시에는 귀속만 기록하고 보상 우편을 만들지 않는다", async () => {
    const trace = makeTrace();
    const tx = fakeExecutor({
      ownerUserId: "referrer",
      conversionInserted: true,
      trace,
    });

    await expect(
      attributeReferral(tx as never, "new-user", "abcdef0123456789"),
    ).resolves.toEqual({ attributed: true });
    expect(trace.inserted.map((entry) => entry.table)).toEqual([
      referralConversions,
    ]);
    expect(trace.inserted[0]?.values).toMatchObject({
      referredUserId: "new-user",
      referrerUserId: "referrer",
      rewardGold: 0,
      rewardedDepth: 0,
    });
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

  it("프론티어 단계 도달 시 누적값을 갱신하고 추천인에게 단계 보상을 보낸다", async () => {
    const trace = makeTrace();
    const tx = fakeExecutor({
      ownerUserId: "unused",
      conversionInserted: false,
      lockedConversion: {
        referrerUserId: "referrer",
        rewardGold: 2_000,
        rewardedDepth: 12,
      },
      trace,
    });

    await expect(
      rewardReferralProgress(tx as never, "new-user", "새싹", 24),
    ).resolves.toEqual({ rewardGold: 3_000, rewardedDepth: 24 });
    expect(trace.updates).toEqual([
      {
        table: referralConversions,
        values: { rewardGold: 5_000, rewardedDepth: 24 },
      },
    ]);
    expect(trace.inserted).toHaveLength(1);
    expect(trace.inserted[0]).toMatchObject({
      table: marketplaceInbox,
      values: {
        userId: "referrer",
        kind: "admin_gift",
        payload: { gold: 3_000 },
        message: expect.stringContaining("프론티어 24"),
      },
    });
  });

  it("여러 단계를 건너뛰면 합산하고 재호출에는 지급하지 않는다", async () => {
    const skipTrace = makeTrace();
    const skipped = fakeExecutor({
      ownerUserId: "unused",
      conversionInserted: false,
      lockedConversion: {
        referrerUserId: "referrer",
        rewardGold: 0,
        rewardedDepth: 0,
      },
      trace: skipTrace,
    });
    await expect(
      rewardReferralProgress(skipped as never, "new-user", "새싹", 36),
    ).resolves.toEqual({ rewardGold: 10_000, rewardedDepth: 36 });

    const repeatedTrace = makeTrace();
    const repeated = fakeExecutor({
      ownerUserId: "unused",
      conversionInserted: false,
      lockedConversion: {
        referrerUserId: "referrer",
        rewardGold: 10_000,
        rewardedDepth: 36,
      },
      trace: repeatedTrace,
    });
    await expect(
      rewardReferralProgress(repeated as never, "new-user", "새싹", 36),
    ).resolves.toEqual({ rewardGold: 0, rewardedDepth: 36 });
    expect(repeatedTrace.inserted).toHaveLength(0);
    expect(repeatedTrace.updates).toHaveLength(0);
  });

  it("첫 단계 미만이면 홍보 DB를 조회하지 않는다", async () => {
    const trace = makeTrace();
    const tx = fakeExecutor({
      ownerUserId: "unused",
      conversionInserted: false,
      trace,
    });
    await expect(
      rewardReferralProgress(tx as never, "new-user", "새싹", 11),
    ).resolves.toEqual({ rewardGold: 0, rewardedDepth: 0 });
    expect(trace.selectedTables).toHaveLength(0);
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
  lockedConversion?: {
    referrerUserId: string;
    rewardGold: number;
    rewardedDepth: number;
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
              table === referralCodes ? [{ userId: args.ownerUserId }] : [],
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
