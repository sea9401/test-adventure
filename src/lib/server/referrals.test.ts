import { afterEach, describe, expect, it } from "vitest";
import {
  attributeReferral,
  createReferralCode,
  normalizeReferralCode,
  REFERRAL_NEW_USER_STAMINA_POTIONS,
  REFERRAL_REFERRER_SIGNUP_STAMINA_POTIONS,
  REFERRAL_REFERRER_STAMINA_POTIONS_PER_MILESTONE,
  referralLandingUrl,
  referralRewardMilestones,
  rewardReferralProgress,
} from "./referrals";
import {
  marketplaceInbox,
  referralCodes,
  referralConversions,
} from "@/db/schema";

const originalAuthUrl = process.env.AUTH_URL;

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
      referralLandingUrl("https://localhost:3000/r/code", "accepted").href,
    ).toBe("https://msmsge.com/sign-in?referral=accepted");
  });

  it("프론티어 6·12·18·24·36의 5단계마다 홍보자 회복약 2개를 지급한다", () => {
    expect(referralRewardMilestones()).toEqual([
      { frontierDepth: 6, referrerStaminaPotions: 2 },
      { frontierDepth: 12, referrerStaminaPotions: 2 },
      { frontierDepth: 18, referrerStaminaPotions: 2 },
      { frontierDepth: 24, referrerStaminaPotions: 2 },
      { frontierDepth: 36, referrerStaminaPotions: 2 },
    ]);
    expect(REFERRAL_NEW_USER_STAMINA_POTIONS).toBe(2);
    expect(REFERRAL_REFERRER_SIGNUP_STAMINA_POTIONS).toBe(2);
    expect(REFERRAL_REFERRER_STAMINA_POTIONS_PER_MILESTONE).toBe(2);
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

  it("프론티어 단계 도달 시 진척도를 갱신하고 홍보자에게 회복약을 보낸다", async () => {
    const trace = makeTrace();
    const tx = fakeExecutor({
      ownerUserId: "unused",
      conversionInserted: false,
      lockedConversion: {
        referrerUserId: "referrer",
        rewardedStaminaDepth: 12,
      },
      trace,
    });

    await expect(
      rewardReferralProgress(tx as never, "new-user", "새싹", 24),
    ).resolves.toEqual({ staminaPotions: 4, rewardedDepth: 24 });
    expect(trace.updates).toEqual([
      {
        table: referralConversions,
        values: { rewardedStaminaDepth: 24 },
      },
    ]);
    expect(trace.inserted).toHaveLength(1);
    expect(trace.inserted[0]).toMatchObject({
      table: marketplaceInbox,
      values: {
        userId: "referrer",
        kind: "admin_gift",
        payload: { gold: 0, staminaPotions: 4 },
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
        rewardedStaminaDepth: 0,
      },
      trace: skipTrace,
    });
    await expect(
      rewardReferralProgress(skipped as never, "new-user", "새싹", 36),
    ).resolves.toEqual({ staminaPotions: 10, rewardedDepth: 36 });

    const repeatedTrace = makeTrace();
    const repeated = fakeExecutor({
      ownerUserId: "unused",
      conversionInserted: false,
      lockedConversion: {
        referrerUserId: "referrer",
        rewardedStaminaDepth: 36,
      },
      trace: repeatedTrace,
    });
    await expect(
      rewardReferralProgress(repeated as never, "new-user", "새싹", 36),
    ).resolves.toEqual({ staminaPotions: 0, rewardedDepth: 36 });
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
      rewardReferralProgress(tx as never, "new-user", "새싹", 5),
    ).resolves.toEqual({ staminaPotions: 0, rewardedDepth: 0 });
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
    rewardedStaminaDepth: number;
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
