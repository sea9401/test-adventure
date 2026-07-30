import { describe, expect, it } from "vitest";
import {
  couponAvailability,
  couponRewardLabels,
  hashCouponCode,
  normalizeCouponCode,
  parseCouponReward,
} from "./coupon";

describe("coupon", () => {
  it("대소문자와 구분자 차이를 같은 코드로 정규화한다", () => {
    expect(normalizeCouponCode(" beta-abcd 1234-efgh ")).toBe("BETAABCD1234EFGH");
    expect(hashCouponCode("BETAABCD1234EFGH")).toHaveLength(64);
  });

  it("너무 짧거나 비어 있는 코드를 거절한다", () => {
    expect(normalizeCouponCode("short")).toBeNull();
    expect(normalizeCouponCode(null)).toBeNull();
  });

  it("수량형 우편 보상을 검증하고 표시 문구를 만든다", () => {
    const reward = parseCouponReward({ gold: 10_000, museunCoins: 50 });
    expect(reward).not.toBeNull();
    expect(couponRewardLabels(reward!)).toEqual(["10,000 골드", "무슨 코인 50개"]);
  });

  it("영구 칭호를 쿠폰 보상으로 검증하고 표시한다", () => {
    const reward = parseCouponReward({
      titleIds: ["pre_open_regular"],
      staminaPotions: 15,
    });
    expect(reward).not.toBeNull();
    expect(couponRewardLabels(reward!)).toEqual([
      "칭호 ‘오픈 전 단골’",
      "스태미나 회복약 15개",
    ]);
  });

  it("빈 보상과 한도 밖 보상을 거절한다", () => {
    expect(parseCouponReward({})).toBeNull();
    expect(parseCouponReward({ gold: 1_000_001 })).toBeNull();
    expect(
      parseCouponReward({ gold: 1, items: [{ itemId: "x", count: 1 }] }),
    ).toBeNull();
    expect(parseCouponReward({ titleIds: ["unknown_title"] })).toBeNull();
  });

  it("시작 전만 막고 만료가 없으면 시작 이후 계속 사용할 수 있다", () => {
    const startsAt = new Date("2026-08-01T13:00:00+09:00");
    expect(
      couponAvailability(
        startsAt,
        null,
        new Date("2026-08-01T12:59:59+09:00"),
      ),
    ).toBe("not_started");
    expect(couponAvailability(startsAt, null, startsAt)).toBeNull();
    expect(
      couponAvailability(
        startsAt,
        null,
        new Date("2036-08-01T13:00:00+09:00"),
      ),
    ).toBeNull();
  });

  it("만료 시각이 있는 기존 캠페인은 종전처럼 만료된다", () => {
    const startsAt = new Date("2026-08-01T13:00:00+09:00");
    const endsAt = new Date("2026-09-01T13:00:00+09:00");
    expect(couponAvailability(startsAt, endsAt, endsAt)).toBe("expired");
  });
});
