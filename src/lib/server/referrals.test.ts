import { afterEach, describe, expect, it } from "vitest";
import {
  completeReferral,
  createReferralCode,
  normalizeReferralCode,
  referralRewardGold,
} from "./referrals";
import { marketplaceInbox, referralConversions } from "@/db/schema";

const originalReward = process.env.REFERRAL_REWARD_GOLD;

afterEach(() => {
  if (originalReward === undefined) delete process.env.REFERRAL_REWARD_GOLD;
  else process.env.REFERRAL_REWARD_GOLD = originalReward;
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

  it("완료 실적과 보상 우편을 한 executor에 함께 기록한다", async () => {
    process.env.REFERRAL_REWARD_GOLD = "25000";
    const inserted: Array<{ table: unknown; values: unknown }> = [];
    const tx = fakeExecutor("referrer", true, inserted);

    const result = await completeReferral(
      tx as never,
      "new-user",
      "새싹",
      "abcdef0123456789",
    );

    expect(result).toEqual({ rewarded: true, rewardGold: 25_000 });
    expect(inserted.map((entry) => entry.table)).toEqual([
      referralConversions,
      marketplaceInbox,
    ]);
    expect(inserted[1]?.values).toMatchObject({
      userId: "referrer",
      kind: "admin_gift",
      payload: { gold: 25_000 },
      message: expect.stringContaining("새싹님"),
    });
  });

  it("자기 추천과 이미 귀속된 계정에는 보상 우편을 만들지 않는다", async () => {
    const selfInserts: Array<{ table: unknown; values: unknown }> = [];
    expect(
      await completeReferral(
        fakeExecutor("same-user", true, selfInserts) as never,
        "same-user",
        "본인",
        "abcdef0123456789",
      ),
    ).toEqual({ rewarded: false, rewardGold: 0 });
    expect(selfInserts).toHaveLength(0);

    const duplicateInserts: Array<{ table: unknown; values: unknown }> = [];
    expect(
      await completeReferral(
        fakeExecutor("referrer", false, duplicateInserts) as never,
        "already-attributed",
        "중복",
        "abcdef0123456789",
      ),
    ).toEqual({ rewarded: false, rewardGold: 0 });
    expect(duplicateInserts.map((entry) => entry.table)).toEqual([
      referralConversions,
    ]);
  });
});

function fakeExecutor(
  ownerUserId: string,
  conversionInserted: boolean,
  inserted: Array<{ table: unknown; values: unknown }>,
) {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [{ userId: ownerUserId }],
        }),
      }),
    }),
    insert: (table: unknown) => ({
      values: (values: unknown) => {
        inserted.push({ table, values });
        if (table === referralConversions) {
          return {
            onConflictDoNothing: () => ({
              returning: async () =>
                conversionInserted ? [{ referredUserId: "new-user" }] : [],
            }),
          };
        }
        return Promise.resolve();
      },
    }),
  };
}
