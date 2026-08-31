import { describe, expect, it } from "vitest";
import {
  associationDiningContributionProgress,
  diningDonationQuantityLimit,
  guildDiningMenuUnavailableReason,
  guildDiningUnavailableReasons,
} from "./guildDiningAvailability";

const available = {
  eligible: true,
  weeklySource: null,
  currentSource: "guild" as const,
  pantry: { ready: true, remaining: 0 },
  contributionPoints: 0,
  availableTickets: 1,
};

describe("guild dining availability", () => {
  it("모든 주문 조건을 충족하면 제한 사유가 없다", () => {
    expect(guildDiningUnavailableReasons(available)).toEqual([]);
  });

  it("다른 식당을 먼저 선택했다면 선택한 이용처와 다음 이용 시점을 안내한다", () => {
    expect(
      guildDiningUnavailableReasons({
        ...available,
        weeklySource: "association",
      }),
    ).toEqual([
      "이번 주 식당 이용처를 협회 식당으로 이미 선택했습니다. 다음 주 월요일 00:00 KST부터 다시 선택할 수 있습니다.",
    ]);
  });

  it("주간 참여 대상이 아니면 다음 이용 시점을 안내한다", () => {
    expect(
      guildDiningUnavailableReasons({ ...available, eligible: false }),
    ).toEqual([
      "이번 주 공동 준비가 시작된 뒤 길드에 가입하여 다음 주 월요일 00:00 KST부터 이용할 수 있습니다.",
    ]);
  });

  it("동시에 충족하지 못한 주문 조건을 모두 안내한다", () => {
    expect(
      guildDiningUnavailableReasons({
        ...available,
        pantry: { ready: false, remaining: 37 },
        availableTickets: 0,
      }),
    ).toEqual([
      "공동 식재료 준비가 끝나지 않았습니다. 37점이 더 필요합니다.",
      "이번 주 사용할 수 있는 식권을 모두 사용했습니다.",
    ]);
  });

  it("협회 식당은 공동 목표 대신 다음 개인 식권까지 필요한 기여를 안내한다", () => {
    expect(
      guildDiningUnavailableReasons({
        ...available,
        currentSource: "association",
        pantry: { ready: false, remaining: 400 },
        contributionPoints: 7,
        availableTickets: 0,
      }),
    ).toEqual([
      "사용 가능한 식권이 없습니다. 다음 식권까지 13점이 필요합니다.",
    ]);
  });

  it("협회 식당 기부량은 개인·공동 한도 없이 보유량과 요청 한도만 적용한다", () => {
    expect(
      diningDonationQuantityLimit({
        source: "association",
        owned: 2_000,
        batchSize: 1,
        pointValue: 1,
        contributionPoints: 80,
        contributionCap: null,
        pantryRemaining: 0,
      }),
    ).toBe(999);
    expect(associationDiningContributionProgress(47)).toEqual({
      points: 7,
      target: 20,
      remaining: 13,
    });
  });

  it("HP와 MP 충전량이 모두 가득 찬 회복식만 막는다", () => {
    expect(
      guildDiningMenuUnavailableReason({
        isRecoveryMenu: true,
        charges: { hp: 100, mp: 100, max: 100 },
      }),
    ).toBe("HP·MP 충전량이 모두 가득 차 있어 이 메뉴를 주문할 수 없습니다.");
    expect(
      guildDiningMenuUnavailableReason({
        isRecoveryMenu: true,
        charges: { hp: 99, mp: 100, max: 100 },
      }),
    ).toBeNull();
    expect(
      guildDiningMenuUnavailableReason({
        isRecoveryMenu: false,
        charges: { hp: 100, mp: 100, max: 100 },
      }),
    ).toBeNull();
  });
});
