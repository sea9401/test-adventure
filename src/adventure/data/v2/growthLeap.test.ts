import { describe, expect, it } from "vitest";
import {
  GROWTH_LEAP_CLAIM_GRACE_MS,
  GROWTH_LEAP_MILESTONES,
  GROWTH_LEAP_PACKAGE_POTIONS,
  GROWTH_LEAP_PROGRESS_MS,
  MONTHLY_STAMINA_BUNDLE_LIMIT,
  MONTHLY_STAMINA_BUNDLE_POTIONS,
  activateGrowthLeap,
  buyMonthlyStaminaBundle,
  claimGrowthLeapMilestone,
  growthLeapMissionView,
  growthLeapShopView,
  parseGrowthLeapSave,
  recordGrowthLeapStamina,
} from "./growthLeap";

const PURCHASED_AT = 1_000;

function activated() {
  const result = activateGrowthLeap({}, PURCHASED_AT);
  if (!result.ok) throw new Error("expected activation");
  return result.state;
}

describe("성장 도약 상품 구매 상태", () => {
  it("KST 월 경계에서 회복약 세트 구매 횟수를 새로 시작한다", () => {
    const august = buyMonthlyStaminaBundle(
      {},
      Date.UTC(2026, 7, 31, 14, 59),
    );
    expect(august).toMatchObject({
      ok: true,
      purchases: 1,
      remaining: 2,
      state: { monthlyPeriod: "2026-08", monthlyPurchases: 1 },
    });

    const september = buyMonthlyStaminaBundle(
      august.ok ? august.state : {},
      Date.UTC(2026, 7, 31, 15, 0),
    );
    expect(september).toMatchObject({
      ok: true,
      purchases: 1,
      remaining: 2,
      state: { monthlyPeriod: "2026-09", monthlyPurchases: 1 },
    });
  });

  it("같은 KST 달에는 세 번째 구매까지만 허용한다", () => {
    const now = Date.UTC(2026, 7, 1);
    const first = buyMonthlyStaminaBundle({}, now);
    const second = buyMonthlyStaminaBundle(first.ok ? first.state : {}, now);
    const third = buyMonthlyStaminaBundle(second.ok ? second.state : {}, now);
    const fourth = buyMonthlyStaminaBundle(third.ok ? third.state : {}, now);

    expect(third).toMatchObject({ ok: true, purchases: 3, remaining: 0 });
    expect(fourth).toEqual({ ok: false, error: "monthly_limit" });
  });

  it("성장 도약은 한 번만 활성화하고 정확히 30일과 7일 경계를 저장한다", () => {
    const first = activateGrowthLeap({}, PURCHASED_AT);
    expect(first).toMatchObject({
      ok: true,
      state: {
        mission: {
          purchasedAt: PURCHASED_AT,
          progressUntil: PURCHASED_AT + GROWTH_LEAP_PROGRESS_MS,
          claimUntil:
            PURCHASED_AT +
            GROWTH_LEAP_PROGRESS_MS +
            GROWTH_LEAP_CLAIM_GRACE_MS,
          staminaSpent: 0,
          claimedMilestoneIds: [],
        },
      },
    });
    expect(activateGrowthLeap(first.ok ? first.state : {}, PURCHASED_AT + 1)).toEqual({
      ok: false,
      error: "already_owned",
    });
  });

  it("손상된 저장값을 안전한 구매 상태로 정규화한다", () => {
    expect(
      parseGrowthLeapSave({
        monthlyPeriod: "bad",
        monthlyPurchases: 99,
        mission: {
          purchasedAt: 100,
          progressUntil: 200,
          claimUntil: 300,
          staminaSpent: 99_999,
          claimedMilestoneIds: ["growth_1", "unknown", "growth_1"],
        },
      }),
    ).toEqual({
      monthlyPeriod: null,
      monthlyPurchases: 3,
      mission: {
        purchasedAt: 100,
        progressUntil: 200,
        claimUntil: 300,
        staminaSpent: 50_000,
        claimedMilestoneIds: ["growth_1"],
      },
    });
  });
});

describe("성장 도약 의뢰 진행과 보상", () => {
  it("진행 기간의 실제 양수 스태미나만 누적하고 50,000에서 멈춘다", () => {
    const state = activated();
    const progressed = recordGrowthLeapStamina(state, 3_500.9, PURCHASED_AT + 1);
    const capped = recordGrowthLeapStamina(progressed, 99_999, PURCHASED_AT + 2);

    expect(progressed.mission?.staminaSpent).toBe(3_500);
    expect(capped.mission?.staminaSpent).toBe(50_000);
    expect(recordGrowthLeapStamina(capped, -100, PURCHASED_AT + 3)).toEqual(capped);
    expect(
      recordGrowthLeapStamina(
        state,
        100,
        PURCHASED_AT + GROWTH_LEAP_PROGRESS_MS + 1,
      ),
    ).toEqual(state);
  });

  it("진행 중·수령 유예·만료 상태를 시간 경계에서 구분한다", () => {
    const state = activated();
    const progressUntil = PURCHASED_AT + GROWTH_LEAP_PROGRESS_MS;
    const claimUntil = progressUntil + GROWTH_LEAP_CLAIM_GRACE_MS;

    expect(growthLeapMissionView(state, progressUntil)).toMatchObject({
      status: "active",
    });
    expect(growthLeapMissionView(state, progressUntil + 1)).toMatchObject({
      status: "claim_only",
    });
    expect(growthLeapMissionView(state, claimUntil)).toMatchObject({
      status: "claim_only",
    });
    expect(growthLeapMissionView(state, claimUntil + 1)).toMatchObject({
      status: "expired",
    });
    expect(growthLeapMissionView({}, PURCHASED_AT)).toEqual({
      status: "not_purchased",
    });
  });

  it("달성한 단계만 한 번 수령하고 정확한 보상을 반환한다", () => {
    const active = recordGrowthLeapStamina(
      activated(),
      10_000,
      PURCHASED_AT + 1,
    );
    expect(claimGrowthLeapMilestone(active, "growth_3", PURCHASED_AT + 2)).toEqual({
      ok: false,
      error: "not_complete",
    });

    const claimed = claimGrowthLeapMilestone(
      active,
      "growth_2",
      PURCHASED_AT + 2,
    );
    expect(claimed).toMatchObject({
      ok: true,
      reward: {
        masteryCertificates: 1_000,
        staminaPotions: 0,
        cosmeticExtensions: 0,
      },
      state: {
        mission: { claimedMilestoneIds: ["growth_2"] },
      },
    });
    expect(
      claimGrowthLeapMilestone(
        claimed.ok ? claimed.state : active,
        "growth_2",
        PURCHASED_AT + 3,
      ),
    ).toEqual({ ok: false, error: "already_claimed" });
  });

  it("월간·패키지 전체 지급량과 다섯 단계 보상 합계를 고정한다", () => {
    expect(MONTHLY_STAMINA_BUNDLE_POTIONS * MONTHLY_STAMINA_BUNDLE_LIMIT).toBe(
      60,
    );
    expect(
      GROWTH_LEAP_MILESTONES.reduce(
        (sum, milestone) => sum + milestone.masteryCertificates,
        0,
      ),
    ).toBe(5_000);
    const missionPotions =
      GROWTH_LEAP_MILESTONES.reduce(
        (sum, milestone) => sum + milestone.staminaPotions,
        0,
      );
    expect(missionPotions).toBe(10);
    expect(GROWTH_LEAP_PACKAGE_POTIONS + missionPotions).toBe(40);
    expect(
      GROWTH_LEAP_MILESTONES.reduce(
        (sum, milestone) => sum + milestone.cosmeticExtensions,
        0,
      ),
    ).toBe(1);
  });

  it("상점 조회는 이번 달 남은 횟수와 평생 구매 여부를 반환한다", () => {
    const now = Date.UTC(2026, 7, 20);
    const monthly = buyMonthlyStaminaBundle({}, now);
    const state = activateGrowthLeap(monthly.ok ? monthly.state : {}, now);

    expect(growthLeapShopView(state.ok ? state.state : {}, now)).toEqual({
      monthlyStaminaBundle: { purchases: 1, remaining: 2, limit: 3 },
      growthLeapPackage: { owned: true },
    });
  });
});
